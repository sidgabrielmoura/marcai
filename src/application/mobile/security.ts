import { readManualSubscription, getSubscriptionNotice } from "@/application/superadmin/manual-subscription";
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT,jwtVerify,EncryptJWT,jwtDecrypt } from 'jose';
import { z } from 'zod';
import { prisma } from '@/infrastructure/database/prisma';
import { getAuthenticatedContext, authenticatedMemberSelect, contextFromMember } from '@/application/security/auth-context';
import { mobileSessionContext } from '@/infrastructure/security/mobile-context';
import { securityKey,hasSecondFactorProof,secondFactorProof,openTotp,sealTotp,verifyTotp,hashRecoveryCode,generateTotpSecret,generateRecoveryCodes,buildTotpUri } from '@/infrastructure/security/totp';
import { MobileError,fail } from './http';
import type { SessionData } from '@/infrastructure/security/session';
import type { Prisma } from '@prisma/client';
import { publishSyncRequired, mobileMutationKinds } from '@/infrastructure/realtime/sync';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const accessKey=()=>createHash('sha256').update('marcai:mobile:'+Buffer.from(securityKey()).toString('hex')).digest();
export const uuid=z.string().uuid();
const identityInclude={user:true,organization:true} as const;
export async function rate(key:string,limit=10,seconds=300) {
 const k=hash(key);
 const [row]=await prisma.$queryRaw<Array<{attempts:number}>>`INSERT INTO mobile_rate_limits(key,attempts) VALUES(${k},1)
 ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN mobile_rate_limits.window_at<now()-${seconds}*interval '1 second' THEN 1 ELSE mobile_rate_limits.attempts+1 END,
 window_at=CASE WHEN mobile_rate_limits.window_at<now()-${seconds}*interval '1 second' THEN now() ELSE mobile_rate_limits.window_at END RETURNING attempts`;
 if(!row||row.attempts>limit)fail(429,'RATE_LIMIT','Muitas tentativas. Aguarde alguns minutos.');
}
export async function rateRequest(req:Request,kind:string,identity='') {
 // Trusted only behind Vercel; never accept X-Forwarded-For for authorization.
 const ip=req.headers.get('x-vercel-forwarded-for')?.split(',')[0]??'unknown';
 await rate('ip:'+kind+':'+ip,60); if(identity)await rate('identity:'+kind+':'+identity.toLowerCase().trim(),10);
}
const credential=(u:{passwordHash:string|null},m:{pinHash:string|null})=>hash((u.passwordHash??'')+':'+(m.pinHash??''));
type DbSession={id:string;user_id:string;member_id:string;installation_id:string;proof:string|null;credential_version:string;expires_at:Date;revoked_at:Date|null};
async function activeMember(memberId:string,userId:string,proof:string|null,version:string,db:Pick<Prisma.TransactionClient,'organizationMember'>=prisma) {
 const m=await db.organizationMember.findFirst({where:{id:memberId,userId,status:'ACTIVE',user:{status:'ACTIVE'},organization:{status:'ACTIVE'}},select:authenticatedMemberSelect});
 if(!m || !hasSecondFactorProof(m.user,proof??undefined) || credential(m.user,m)!==version)fail(401,'SESSION_REVOKED','Seu acesso mudou. Entre novamente.');
 return m;
}
export function identity(m:Awaited<ReturnType<typeof activeMember>>) {
 const notice=getSubscriptionNotice(readManualSubscription(m.organization.settings));
 const subscriptionNotice=notice?notice.isExpired?"A vigência informada terminou. Fale com a gestão; suas tarefas continuam disponíveis.":"A vigência se aproxima do fim. Fale com a gestão.":null;
 return {userId:m.userId,memberId:m.id,organizationId:m.organizationId,name:m.user.name,email:m.user.email,employeeCode:m.employeeCode,organizationName:m.organization.name,organizationSlug:m.organization.slug,role:m.role,subscriptionNotice};
}
async function sessionResponse(s:DbSession,refreshToken:string,db:Pick<Prisma.TransactionClient,'organizationMember'>=prisma) {
 const m=await activeMember(s.member_id,s.user_id,s.proof,s.credential_version,db);
 const accessExpiresAt=new Date(Date.now()+300000).toISOString();
 const accessToken=await new SignJWT({sid:s.id}).setProtectedHeader({alg:'HS256'}).setSubject(s.user_id).setAudience('marcai-mobile').setIssuer('https://marcai-coral.vercel.app').setIssuedAt().setExpirationTime('5m').sign(accessKey());
 return {accessToken,accessExpiresAt,refreshToken,identity:identity(m)};
}
async function dispatchSessionRevokedPush(params: {
  tokens: string[];
  userId: string;
  organizationId: string;
}) {
  try {
    const { sendWebPushNotification } = await import(
      "@/infrastructure/firebase/firebase-admin"
    );
    const result = await sendWebPushNotification({
      tokens: params.tokens,
      title: "Desconexão de segurança",
      body: "Outro dispositivo conectou-se à sua conta. Sua sessão neste aparelho foi encerrada.",
      platform: "native",
      data: {
        type: "SESSION_REVOKED",
        reason: "CONCURRENT_DEVICE_LOGIN",
        organizationId: params.organizationId,
      },
    });
    console.log(
      `[Security] Push de desconexão enviado para ${params.tokens.length} token(s). Sucessos: ${result.successCount}, Falhas: ${result.failureCount}`
    );
  } catch (error) {
    console.error("[Security] Erro ao disparar push de desconexão de sessão:", error);
  }
}

async function enforceSingleDeviceConcurrency(
  user: { id: string; platformRole?: string | null },
  currentInstallationId: string,
  organizationId: string,
  db: Prisma.TransactionClient
) {
  // Superadmin é isento do limite de 1 celular logado por vez
  if (user.platformRole === "SUPERADMIN") {
    return;
  }

  // 1. Busca sessões móveis ativas com row lock para prevenir race condition em logins simultâneos
  const activeSessions = await db.$queryRaw<Array<{ id: string; installation_id: string }>>`
    SELECT id::text, installation_id::text
    FROM mobile_sessions
    WHERE user_id = ${user.id}
      AND revoked_at IS NULL
      AND expires_at > now()
    FOR UPDATE
  `;

  if (activeSessions.length === 0) {
    return;
  }

  // Identifica sessões que estavam em outro aparelho (diferente do atual)
  const otherDeviceSessions = activeSessions.filter(
    (s) => s.installation_id !== currentInstallationId
  );

  // Revoga todas as sessões móveis ativas anteriores do usuário
  await db.$executeRaw`
    UPDATE mobile_sessions
    SET revoked_at = now()
    WHERE user_id = ${user.id}
      AND revoked_at IS NULL
      AND expires_at > now()
  `;

  if (otherDeviceSessions.length > 0) {
    const otherSessionUuids = otherDeviceSessions.map((s) => s.id);
    const otherInstallationUuids = [
      ...new Set(otherDeviceSessions.map((s) => s.installation_id)),
    ];

    // Busca push tokens dos aparelhos anteriores que foram desconectados
    const tokensToRevoke = await db.$queryRaw<
      Array<{
        id: string;
        token: string;
        platform: string;
      }>
    >`
      SELECT id::text, token, platform
      FROM mobile_installations
      WHERE (session_id = ANY(${otherSessionUuids}::uuid[]) OR id = ANY(${otherInstallationUuids}::uuid[]))
        AND user_id = ${user.id}
        AND revoked_at IS NULL
        AND token IS NOT NULL
    `;

    // Revoga as instalações anteriores
    await db.$executeRaw`
      UPDATE mobile_installations
      SET revoked_at = now()
      WHERE (session_id = ANY(${otherSessionUuids}::uuid[]) OR id = ANY(${otherInstallationUuids}::uuid[]))
        AND user_id = ${user.id}
    `;

    // Registra alerta de segurança no histórico de notificações do usuário
    await db.notification.create({
      data: {
        organizationId,
        userId: user.id,
        title: "Desconexão de segurança",
        message:
          "Outro dispositivo conectou-se à sua conta. A sessão no aparelho anterior foi encerrada por segurança.",
        type: "SECURITY_ALERT",
        priority: "HIGH",
      },
    });

    // Envia a notificação push para os aparelhos desconectados fora da transação
    if (tokensToRevoke.length > 0) {
      const uniqueTokens = [...new Set(tokensToRevoke.map((t) => t.token))];
      void dispatchSessionRevokedPush({
        tokens: uniqueTokens,
        userId: user.id,
        organizationId,
      });
    }
  }
}

export async function issue(memberId:string,installationId:string,proof:string|null=null,db:Prisma.TransactionClient=prisma) {
  const m=await db.organizationMember.findFirst({where:{id:memberId,status:'ACTIVE',user:{status:'ACTIVE'},organization:{status:'ACTIVE'}},include:identityInclude});
  if(!m||!hasSecondFactorProof(m.user,proof??undefined))fail(401,'INVALID_LOGIN','Não foi possível entrar com estes dados.');

  // Controle de login por dispositivo:
  // Desconecta qualquer celular anteriormente ativo e envia push de alerta (exceto superadmin)
  await enforceSingleDeviceConcurrency(m.user, installationId, m.organizationId, db);

  const s:DbSession={id:randomUUID(),user_id:m.userId,member_id:m.id,installation_id:installationId,proof,credential_version:credential(m.user,m),expires_at:new Date(Date.now()+30*86400000),revoked_at:null};
  const refreshToken=randomBytes(32).toString('base64url');
  await db.$executeRaw`INSERT INTO mobile_sessions(id,user_id,member_id,installation_id,proof,credential_version,expires_at) VALUES(${s.id}::uuid,${s.user_id},${s.member_id},${installationId}::uuid,${proof},${s.credential_version},${s.expires_at})`;
  await db.$executeRaw`INSERT INTO mobile_refresh_tokens(hash,session_id) VALUES(${hash(refreshToken)},${s.id}::uuid)`;
  return sessionResponse(s,refreshToken,db);
}
export async function login(input:unknown,mode:'pin'|'password') {
 const common={installationId:uuid};
 const pin=z.object({...common,organizationSlug:z.string().trim().min(2).max(100),employeeCode:z.string().trim().min(1).max(100),pin:z.string().regex(/^\d{6}$/)}).strict();
 const pass=z.object({...common,email:z.string().email().max(254),password:z.string().min(6).max(200)}).strict();
 const parsed=(mode==='pin'?pin:pass).parse(input);
 let member:Awaited<ReturnType<typeof prisma.organizationMember.findFirst>>;
 if('pin' in parsed) {
 const candidates=await prisma.organizationMember.findMany({where:{employeeCode:parsed.employeeCode,organization:{slug:parsed.organizationSlug.toLowerCase(),status:'ACTIVE'},status:'ACTIVE',user:{status:'ACTIVE'}},include:{user:true},take:2});
 // Reject ambiguous employee codes; do not silently pick findFirst.
 if(candidates.length!==1||!candidates[0]?.pinHash||!await bcrypt.compare(parsed.pin,candidates[0].pinHash))fail(401,'INVALID_LOGIN','Organização, matrícula ou PIN inválidos.');
 member=candidates[0];
 } else {
 const u=await prisma.user.findUnique({where:{email:parsed.email.toLowerCase()},include:{memberships:{where:{status:'ACTIVE',organization:{status:'ACTIVE'}},orderBy:{id:'asc'}}}});
 if(!u||u.status!=='ACTIVE'||!u.passwordHash||!await bcrypt.compare(parsed.password,u.passwordHash))fail(401,'INVALID_LOGIN','E-mail ou senha inválidos.');
 member=u.memberships.find(m=>m.role==='EMPLOYEE')??u.memberships[0]??null;
 }
 if(!member)fail(401,'INVALID_LOGIN','Não foi possível entrar com estes dados.');
 return finishLogin(member.id,parsed.installationId);
}
export async function finishLogin(memberId:string,installationId:string) {
 const m=await prisma.organizationMember.findUnique({where:{id:memberId},include:{user:true}});
 if(!m)fail(403,'ROLE_UNSUPPORTED','Use o acesso da gestão no navegador.');
 if(m.user.twoFactorEnabled){
 const enrollmentSecret=!m.user.twoFactorSecret?generateTotpSecret():null;
 const id=randomUUID(),expiresAt=new Date(Date.now()+300000);
 await prisma.$executeRaw`INSERT INTO mobile_challenges(id,kind,payload,expires_at) VALUES(${id}::uuid,'TOTP',${JSON.stringify({memberId,installationId,version:credential(m.user,m),enrollment:enrollmentSecret?sealTotp({secret:enrollmentSecret,lastCounter:-1,failures:0,lockedUntil:0}):null})}::jsonb,${expiresAt})`;
 return {challengeId:id,expiresAt:expiresAt.toISOString(),...(enrollmentSecret?{enrollment:{secret:enrollmentSecret,uri:buildTotpUri({secret:enrollmentSecret,accountName:m.user.email??m.user.name,issuer:"Marcaí"})}}:{})};
 }return {session:await prisma.$transaction(tx=>issue(memberId,installationId,null,tx))};
}
export async function secondFactor(input:unknown) {
 const b=z.object({challengeId:uuid,code:z.string().trim().min(6).max(12)}).strict().parse(input);
 const result=await prisma.$transaction(async tx=>{
 const [ch]=await tx.$queryRaw<Array<{payload:{memberId:string;installationId:string;version:string;enrollment?:string|null}}>>`SELECT payload FROM mobile_challenges WHERE id=${b.challengeId}::uuid AND kind='TOTP' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`;
 if(!ch)return {error:new MobileError(401,'CHALLENGE_EXPIRED','A verificação expirou. Entre novamente.')};
 const m=await tx.organizationMember.findFirst({where:{id:ch.payload.memberId,status:'ACTIVE',user:{status:'ACTIVE'},organization:{status:'ACTIVE'}},include:{user:true}});
 if(!m||(!m.user.twoFactorSecret&&!ch.payload.enrollment)||credential(m.user,m)!==ch.payload.version)return {error:new MobileError(401,'INVALID_LOGIN','Seu acesso mudou. Entre novamente.')};
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'2fa:'+m.userId}))`;
 const u=await tx.user.findUniqueOrThrow({where:{id:m.userId}});
 const enrolling=!!ch.payload.enrollment;
 if(enrolling&&u.twoFactorSecret)return {error:new MobileError(401,'CHALLENGE_EXPIRED','O autenticador foi configurado em outra sessão. Entre novamente.')};
 const record=openTotp(enrolling?ch.payload.enrollment!:u.twoFactorSecret!);
 let recoveryCodes:string[]|undefined;
 if(record.lockedUntil>Date.now())return {error:new MobileError(429,'RATE_LIMIT','Aguarde antes de tentar novamente.')};
 let proof:string;
 if(/^\d{6}$/.test(b.code)){
 const count=verifyTotp(record.secret,b.code,record.lastCounter);
 if(count===null){
 const failures=record.failures+1;
 const sealedFailure=sealTotp({...record,failures,lockedUntil:failures>=5?Date.now()+300000:0});
 if(enrolling)await tx.$executeRaw`UPDATE mobile_challenges SET payload=jsonb_set(payload,'{enrollment}',to_jsonb(${sealedFailure}::text)) WHERE id=${b.challengeId}::uuid`;else await tx.user.update({where:{id:u.id},data:{twoFactorSecret:sealedFailure}});
 return {error:new MobileError(401,'INVALID_2FA','Código incorreto ou expirado.')};
 }
 const sealed=sealTotp({...record,lastCounter:count,failures:0,lockedUntil:0});
 if(enrolling)recoveryCodes=generateRecoveryCodes();
 await tx.user.update({where:{id:u.id},data:{twoFactorSecret:sealed,...(enrolling?{twoFactorEnabled:true,twoFactorRecoveryCodes:JSON.stringify(recoveryCodes!.map(hashRecoveryCode))}:{})}});proof=secondFactorProof(sealed);
 }else{
 if(enrolling)return {error:new MobileError(401,'INVALID_2FA','Confirme o cadastro com os seis dígitos do autenticador.')};
 const codes:string[]=JSON.parse(u.twoFactorRecoveryCodes??'[]'),index=codes.indexOf(hashRecoveryCode(b.code));
 if(index<0)return {error:new MobileError(401,'INVALID_2FA','Código incorreto ou já utilizado.')};
 codes.splice(index,1);await tx.user.update({where:{id:u.id},data:{twoFactorRecoveryCodes:JSON.stringify(codes)}});proof=secondFactorProof(u.twoFactorSecret);
 }
 await tx.$executeRaw`UPDATE mobile_challenges SET consumed_at=now() WHERE id=${b.challengeId}::uuid`;
 return {session:await issue(m.id,ch.payload.installationId,proof,tx),recoveryCodes};
 });
 if(result.error)throw result.error;return {session:result.session,...(result.recoveryCodes?{recoveryCodes:result.recoveryCodes}:{})};
}
export async function refresh(input:unknown) {
 const b=z.object({refreshToken:z.string().min(40).max(64),requestKey:uuid}).strict().parse(input);
 const result=await prisma.$transaction(async tx=>{
 const [token]=await tx.$queryRaw<Array<{session_id:string;consumed_at:Date|null;request_key:string|null;response:string|null;retry_valid:boolean|null}>>`SELECT *,consumed_at>now()-interval '5 minutes' AS retry_valid FROM mobile_refresh_tokens WHERE hash=${hash(b.refreshToken)} FOR UPDATE`;
 if(!token)return {error:'INVALID_REFRESH'};
 const [s]=await tx.$queryRaw<DbSession[]>`SELECT * FROM mobile_sessions WHERE id=${token.session_id}::uuid AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`;
 if(!s)return {error:'SESSION_REVOKED'};
 const member=await activeMember(s.member_id,s.user_id,s.proof,s.credential_version,tx);
 if(token.consumed_at){
 if(token.request_key===b.requestKey&&token.response&&token.retry_valid){
 const {payload}=await jwtDecrypt(token.response,securityKey(),{audience:'mobile-refresh-retry'});return {session:{...(payload.result as Awaited<ReturnType<typeof sessionResponse>>),identity:identity(member)}};
 }
 await tx.$executeRaw`UPDATE mobile_sessions SET revoked_at=now() WHERE id=${s.id}::uuid`;
 await tx.$executeRaw`UPDATE mobile_installations SET revoked_at=now() WHERE session_id=${s.id}::uuid`;
 return {error:'REFRESH_REUSED'};
 }
 const next=randomBytes(32).toString('base64url');
 const session=await sessionResponse(s,next,tx);
 const sealed=await new EncryptJWT({result:session}).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setAudience('mobile-refresh-retry').setExpirationTime('5m').encrypt(securityKey());
 await tx.$executeRaw`UPDATE mobile_refresh_tokens SET consumed_at=now(),request_key=${b.requestKey}::uuid,response=${sealed} WHERE hash=${hash(b.refreshToken)}`;
 await tx.$executeRaw`INSERT INTO mobile_refresh_tokens(hash,session_id) VALUES(${hash(next)},${s.id}::uuid)`;
 return {session};
 });
 if(result.error)fail(401,result.error,'Sua sessão expirou. Entre novamente.');return result.session;
}
export async function revoke(input:unknown){
 const b=z.object({refreshToken:z.string().min(40).max(64)}).strict().parse(input);
 await prisma.$transaction(async tx=>{const [token]=await tx.$queryRaw<Array<{session_id:string}>>`SELECT session_id FROM mobile_refresh_tokens WHERE hash=${hash(b.refreshToken)}`;if(!token)return;await tx.$executeRaw`UPDATE mobile_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=${token.session_id}::uuid`;await tx.$executeRaw`UPDATE mobile_installations SET revoked_at=COALESCE(revoked_at,now()) WHERE session_id=${token.session_id}::uuid`;});return {success:true};
}
export async function authenticate(req:Request) {
 const token=req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
 if(!token)fail(401,'AUTH_REQUIRED','Entre para continuar.');
 let sid:string;
 try{const {payload}=await jwtVerify(token,accessKey(),{algorithms:['HS256'],audience:'marcai-mobile',issuer:'https://marcai-coral.vercel.app'});sid=uuid.parse(payload.sid);}catch{fail(401,'ACCESS_EXPIRED','Sua sessão precisa ser renovada.');}
 const [s]=await prisma.$queryRaw<DbSession[]>`SELECT * FROM mobile_sessions WHERE id=${sid!}::uuid AND revoked_at IS NULL AND expires_at>now()`;
 if(!s)fail(401,'SESSION_REVOKED','Sua sessão foi encerrada porque outro dispositivo conectou-se à sua conta.');
 const m=await activeMember(s.member_id,s.user_id,s.proof,s.credential_version);
 const data:SessionData={userId:m.userId,name:m.user.name,email:m.user.email,activeOrgId:m.organizationId,activeMemberId:m.id,role:m.role,employeeCode:m.employeeCode,secondFactorProof:s.proof??undefined};
 return {session:s,member:m,data};
}
export async function withAuth<T>(req:Request,work:(auth:Awaited<ReturnType<typeof authenticate>>,context:NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>)=>Promise<T>,employee=true) {
 const auth=await authenticate(req);
 return mobileSessionContext.run(auth.data,async()=>{
 // authenticate already validated this membership, credential version and 2FA.
 // Reuse its projection only within this invocation, never across requests/ticks.
 const context=contextFromMember(auth.member);
 if(employee&&context.role!=='EMPLOYEE'&&auth.member.user.platformRole!=='SUPERADMIN')fail(403,'ROLE_UNSUPPORTED','Este aplicativo é exclusivo para funcionários. Use a gestão no navegador.');
 const result=await work(auth,context);
 // Authenticated writes have finished (including interactive transactions).
 // GET/replay/token reads must never publish: that would create refresh loops.
 const kinds=mobileMutationKinds(req);
 if(kinds.length&&(!(result instanceof Response)||result.ok)){
 const receipt=req.headers.get('Idempotency-Key');
 const changeId=receipt&&uuid.safeParse(receipt).success?receipt:randomUUID();
 await publishSyncRequired(context.organizationId,kinds,kinds.every(kind=>kind==='NOTIFICATIONS_CHANGED')?context.userId:undefined,changeId);
 if(result instanceof Response)result.headers.set('X-Change-Id',changeId);
 }
 return result;
 });
}
export async function validInstallationSession(id:string){
 const [s]=await prisma.$queryRaw<DbSession[]>`SELECT * FROM mobile_sessions WHERE id=${id}::uuid AND revoked_at IS NULL AND expires_at>now()`;
 if(!s)return false;try{const m=await activeMember(s.member_id,s.user_id,s.proof,s.credential_version);if(m.role!=="EMPLOYEE"&&m.user.platformRole!=="SUPERADMIN"){await prisma.$executeRaw`UPDATE mobile_installations SET revoked_at=now() WHERE session_id=${s.id}::uuid`;return false;}return true;}catch{await logout(s);return false;}
}
export async function logout(s:DbSession) {
 await prisma.$transaction(async tx=>{
 await tx.$executeRaw`UPDATE mobile_sessions SET revoked_at=now() WHERE id=${s.id}::uuid`;
 await tx.$executeRaw`UPDATE mobile_installations SET revoked_at=now() WHERE session_id=${s.id}::uuid`;
 });
}
export async function switchOrg(s:DbSession,organizationId:string) {
 const m=await prisma.organizationMember.findFirst({where:{organizationId,userId:s.user_id,status:'ACTIVE',organization:{status:'ACTIVE'},user:{status:'ACTIVE'}},include:{user:true}});
 if(!m||(m.role!=='EMPLOYEE'&&m.user.platformRole!=='SUPERADMIN')||!hasSecondFactorProof(m.user,s.proof??undefined))fail(403,'ORG_UNAVAILABLE','Este vínculo não permite o acesso de funcionário.');
 return prisma.$transaction(async tx=>{await tx.$executeRaw`UPDATE mobile_sessions SET revoked_at=now() WHERE id=${s.id}::uuid`;await tx.$executeRaw`UPDATE mobile_installations SET revoked_at=now() WHERE session_id=${s.id}::uuid`;return issue(m.id,s.installation_id,s.proof,tx);});
}
