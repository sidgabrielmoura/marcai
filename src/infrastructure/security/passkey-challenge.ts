import {cookies} from 'next/headers';
import {prisma} from '@/infrastructure/database/prisma';
import type {Prisma} from '@prisma/client';
type Kind='registration'|'authentication';
const name=(kind:Kind)=>'webauthn_'+kind+'_challenge';
export async function savePasskeyChallenge(challenge:string,kind:Kind,userId:string|null=null){
 await prisma.$executeRaw`INSERT INTO web_passkey_challenges(challenge,user_id,kind,expires_at) VALUES(${challenge},${userId},${kind},${new Date(Date.now()+300000)})`;
 (await cookies()).set(name(kind),challenge,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:300});
}
export async function pendingPasskeyChallenge(kind:Kind){return (await cookies()).get(name(kind))?.value;}
export async function consumePasskeyChallenge(tx:Prisma.TransactionClient,challenge:string,kind:Kind,userId:string|null=null){
 const rows=await tx.$executeRaw`UPDATE web_passkey_challenges SET consumed_at=now() WHERE challenge=${challenge} AND kind=${kind} AND user_id IS NOT DISTINCT FROM ${userId}::text AND consumed_at IS NULL AND expires_at>now()`;
 if(rows!==1)throw new Error('Desafio expirado ou já utilizado.');
}
export async function clearPasskeyChallenge(kind:Kind){(await cookies()).delete(name(kind));}
