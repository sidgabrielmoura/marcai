import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {generateAuthenticationOptions,verifyAuthenticationResponse,generateRegistrationOptions,verifyRegistrationResponse,type AuthenticationResponseJSON,type RegistrationResponseJSON} from '@simplewebauthn/server';
import {prisma} from '@/infrastructure/database/prisma';
import {fail} from './http';
import {finishLogin} from './security';
import type {AuthenticatedContext} from '@/application/security/auth-context';
const rpID='marcai-coral.vercel.app';
function origins(){
 const configured=JSON.parse(process.env.MOBILE_PASSKEY_ORIGINS??'["https://marcai-coral.vercel.app"]') as string[];
 if(!Array.isArray(configured)||configured.some(v=>v!=='https://marcai-coral.vercel.app'&&!/^android:apk-key-hash:[A-Za-z0-9_-]+$/.test(v)))throw new Error('Invalid passkey origins');
 return configured;
}
export async function authenticationOptions(input:unknown) {
 const b=z.object({installationId:z.string().uuid()}).strict().parse(input);
 const options=await generateAuthenticationOptions({rpID,userVerification:'required'});
 const id=randomUUID();
 await prisma.$executeRaw`INSERT INTO mobile_challenges(id,kind,payload,expires_at) VALUES(${id}::uuid,'PASSKEY_LOGIN',${JSON.stringify({challenge:options.challenge,installationId:b.installationId})}::jsonb,now()+interval '5 minutes')`;
 return {challengeId:id,options};
}
export async function authenticationVerify(input:unknown){
 const b=z.object({challengeId:z.string().uuid(),response:z.unknown()}).strict().parse(input);
 const result=await prisma.$transaction(async tx=>{
 const [ch]=await tx.$queryRaw<Array<{payload:{challenge:string;installationId:string}}>>`SELECT payload FROM mobile_challenges WHERE id=${b.challengeId}::uuid AND kind='PASSKEY_LOGIN' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`;
 if(!ch)return {error:'Desafio expirado ou já utilizado.'};
 await tx.$executeRaw`UPDATE mobile_challenges SET consumed_at=now() WHERE id=${b.challengeId}::uuid`;
 const response=b.response as AuthenticationResponseJSON;
 const credential=await tx.passkeyAuthenticator.findUnique({where:{credentialID:response?.id??''},include:{user:{include:{memberships:{where:{status:'ACTIVE',organization:{status:'ACTIVE'}},orderBy:{id:'asc'}}}}}});
 if(!credential||credential.user.status!=='ACTIVE')return {error:'Credencial indisponível.'};
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'passkey:'+credential.id}))`;
 try{
 const fresh=await tx.passkeyAuthenticator.findUniqueOrThrow({where:{id:credential.id}});
 const verification=await verifyAuthenticationResponse({response,expectedChallenge:ch.payload.challenge,expectedOrigin:origins(),expectedRPID:rpID,requireUserVerification:true,credential:{id:fresh.credentialID,publicKey:new Uint8Array(fresh.credentialPublicKey),counter:Number(fresh.counter)}});
 if(!verification.verified)return {error:'Não foi possível verificar a chave.'};
 await tx.passkeyAuthenticator.update({where:{id:credential.id},data:{counter:BigInt(verification.authenticationInfo.newCounter),lastUsedAt:new Date()}});
 const member=credential.user.memberships.find(m=>m.role==='EMPLOYEE');
 if(!member)return {error:'Não há vínculo de funcionário disponível.'};
 return {memberId:member.id,installationId:ch.payload.installationId};
 }catch{return {error:'Não foi possível verificar a chave.'};}
 });
 if(result.error)fail(401,'PASSKEY_INVALID',result.error);
 // Remote passkey never bypasses required TOTP.
 return finishLogin(result.memberId!,result.installationId!);
}
export async function registrationOptions(c:AuthenticatedContext){
 const user=await prisma.user.findUniqueOrThrow({where:{id:c.userId},include:{passkeys:true}});
 const options=await generateRegistrationOptions({rpName:'Marcaí',rpID,userID:new Uint8Array(Buffer.from(user.id)),userName:user.email??user.name,authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:user.passkeys.map(k=>({id:k.credentialID}))});
 const id=randomUUID();
 await prisma.$executeRaw`INSERT INTO mobile_challenges(id,kind,payload,expires_at) VALUES(${id}::uuid,'PASSKEY_REGISTER',${JSON.stringify({challenge:options.challenge,userId:c.userId})}::jsonb,now()+interval '5 minutes')`;
 return {challengeId:id,options};
}
export async function registrationVerify(c:AuthenticatedContext,input:unknown){
 const b=z.object({challengeId:z.string().uuid(),response:z.unknown()}).strict().parse(input);
 const result=await prisma.$transaction(async tx=>{
 const [ch]=await tx.$queryRaw<Array<{payload:{challenge:string;userId:string}}>>`SELECT payload FROM mobile_challenges WHERE id=${b.challengeId}::uuid AND kind='PASSKEY_REGISTER' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`;
 if(!ch||ch.payload.userId!==c.userId)return false;
 await tx.$executeRaw`UPDATE mobile_challenges SET consumed_at=now() WHERE id=${b.challengeId}::uuid`;
 try{
 const verified=await verifyRegistrationResponse({response:b.response as RegistrationResponseJSON,expectedChallenge:ch.payload.challenge,expectedRPID:rpID,expectedOrigin:origins(),requireUserVerification:true});
 if(!verified.verified||!verified.registrationInfo)return false;
 const info=verified.registrationInfo;
 await tx.passkeyAuthenticator.create({data:{userId:c.userId,credentialID:info.credential.id,credentialPublicKey:Buffer.from(info.credential.publicKey),counter:BigInt(info.credential.counter),credentialDeviceType:info.credentialDeviceType,credentialBackedUp:info.credentialBackedUp,transports:info.credential.transports?.join(',')}});
 return true;
 }catch{return false;}
 });
 if(!result)fail(400,'PASSKEY_INVALID','O cadastro expirou ou não pôde ser verificado.');
 return {success:true};
}
