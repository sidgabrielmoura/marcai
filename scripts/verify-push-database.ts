import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";
import { Client } from "pg";
import { initializeApp, getApps } from "firebase-admin/app";
import { prisma } from "../src/infrastructure/database/prisma";
import { getFirebaseAdminMessaging } from "../src/infrastructure/firebase/firebase-admin";
import { notificationTransaction } from "../src/infrastructure/notifications/transaction";
import { dispatchPersistedNotifications, sendNotification } from "../src/infrastructure/notifications/notification-service";
import { encryptSession } from "../src/infrastructure/security/session";
import { decodeJwt } from "jose";

assert.equal(process.env.DATABASE_EFFICIENCY_ISOLATED,"1");
const url=new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"56433");assert.equal(url.pathname,"/tarefai_efficiency");
for(const key of ['FIREBASE_SERVICE_ACCOUNT_KEY','FIREBASE_PRIVATE_KEY','ABLY_API_KEY','RESEND_API_KEY'])assert.equal(process.env[key],undefined);
globalThis.fetch=async()=>{throw new Error('External traffic forbidden in isolated tests');};
if(!getApps().length)initializeApp({projectId:'synthetic-push-tests'});
const sent: Array<any>=[];
let reject=false;
getFirebaseAdminMessaging().sendEachForMulticast=async message=>{
  sent.push(message);
  return {successCount:reject?0:message.tokens.length,failureCount:reject?message.tokens.length:0,
    responses:message.tokens.map(()=>reject?{success:false,error:{code:'messaging/authentication-error'} as any}:{success:true,messageId:'synthetic-provider-id'})};
};

let authSession:any;
function sourceModule(file:string,dependencies:Record<string,unknown>) {
  const exports:Record<string,any>={};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:(name:string)=>{if(name in dependencies)return dependencies[name];if(name==='node:crypto')return {randomUUID};throw new Error(name);},
    console,TextEncoder,process:{env:{AUTH_SECRET:process.env.AUTH_SECRET}}});
  return exports;
}
const actions=sourceModule('src/presentation/actions/push-notification-actions.ts',{
  zod, '@/infrastructure/database/prisma':{prisma}, '@/infrastructure/security/session':{getSession:async()=>authSession},
  '@/application/security/auth-context':{getAuthenticatedContext:async()=>authSession},
});
const logout=sourceModule('src/infrastructure/security/session.ts',{
  '@/infrastructure/database/prisma':{prisma},'./mobile-context':{mobileSessionContext:{}},
  jose:{jwtVerify:async()=>({payload:authSession})},'next/headers':{cookies:async()=>({get:()=>({value:'synthetic-cookie'}),delete(){}})},
  '@/domain/types':{},react:{cache:(fn:unknown)=>fn},'@/infrastructure/database/request-memo':{},
});
async function check(name:string,work:()=>Promise<void>){await work();console.log('PASS: '+name);}

async function main(){
  const org=await prisma.organization.create({data:{name:'Push test',slug:'push-test-'+randomUUID()}});
  const user=await prisma.user.create({data:{name:'Synthetic push test',passwordHash:'synthetic-password'}});
  const member=await prisma.organizationMember.create({data:{organizationId:org.id,userId:user.id,role:'OWNER',pinHash:'synthetic-pin'}});
  const base={userId:user.id,name:user.name,email:null,activeOrgId:org.id,activeMemberId:member.id,role:'OWNER' as const};
  const sessionA=String(decodeJwt(await encryptSession(base)).sessionId);
  const sessionB=String(decodeJwt(await encryptSession(base)).sessionId);
  authSession={...base,sessionId:sessionA};
  const client=new Client({connectionString:process.env.DATABASE_URL});
  await client.connect();
  try {
    await check('real database: legacy, expired and revoked registrations cannot receive; current session can',async()=>{
      await prisma.userDeviceToken.createMany({data:[
        {userId:user.id,token:'synthetic-active',sessionId:sessionA},
        {userId:user.id,token:'synthetic-other-device',sessionId:sessionB},
        {userId:user.id,token:'synthetic-legacy'},
      ]});
      const notice=await notificationTransaction(tx=>tx.notification.create({data:{organizationId:org.id,userId:user.id,type:'OPERATIONAL_ALERT',title:'Never in web FCM payload',message:'Private synthetic detail'}}));
      assert.equal(sent.length,2);
      assert.deepEqual(sent.flatMap(m=>m.tokens).sort(),['synthetic-active','synthetic-other-device']);
      assert.ok(!JSON.stringify(sent).includes('Private synthetic detail'));
      assert.equal((await prisma.notificationDelivery.findFirstOrThrow({where:{notificationId:notice.id,channel:'PUSH'}})).status,'PROVIDER_ACCEPTED');
      await dispatchPersistedNotifications([notice.id]);assert.equal(sent.length,2);
      await prisma.webAuthSession.update({where:{id:sessionB},data:{revokedAt:new Date()}});
      sent.length=0;
      await notificationTransaction(tx=>tx.notification.create({data:{organizationId:org.id,userId:user.id,type:'OPERATIONAL_ALERT',title:'Synthetic',message:'Synthetic'}}));
      assert.deepEqual(sent.flatMap(m=>m.tokens),['synthetic-active']);
    });
    await check('real database: explicit channel policy and forcePush are preserved',async()=>{
      const before=sent.length;
      const skipped=await sendNotification({organizationId:org.id,userId:user.id,type:'OPERATIONAL_ALERT',title:'Disabled push',message:'Synthetic',channels:['INTERNAL','PUSH'],forcePush:false});
      assert.equal(sent.length,before);
      assert.equal((await prisma.notificationDelivery.findFirstOrThrow({where:{notificationId:skipped.id,channel:'PUSH'}})).status,'SKIPPED_POLICY');
      await sendNotification({organizationId:org.id,userId:user.id,type:'CUSTOM_NOTICE',title:'Explicit push',message:'Synthetic',channels:['PUSH']});
      assert.equal(sent.length,before+1);
    });
    await check('real database: bulk notifications dispatch once and rollback dispatches nothing',async()=>{
      const before=sent.length;
      const result=await notificationTransaction(tx=>tx.notification.createMany({data:[1,2].map(i=>({organizationId:org.id,userId:user.id,type:'OPERATIONAL_ALERT',title:'Bulk '+i,message:'Synthetic'}))}));
      assert.equal(result.count,2);assert.equal(sent.length,before+2);
      await assert.rejects(notificationTransaction(async tx=>{await tx.notification.create({data:{organizationId:org.id,userId:user.id,type:'OPERATIONAL_ALERT',title:'Must roll back',message:'Synthetic'}});throw new Error('rollback');}));
      assert.equal(await prisma.notification.count({where:{organizationId:org.id,title:'Must roll back'}}),0);
      assert.equal(sent.length,before+2);
    });
    await check('real database: provider failures are persisted and no device remains an honest skip',async()=>{
      reject=true;
      const n=await notificationTransaction(tx=>tx.notification.create({data:{organizationId:org.id,userId:user.id,type:'OPERATIONAL_ALERT',title:'Failure',message:'Synthetic'}}));
      const d=await prisma.notificationDelivery.findFirstOrThrow({where:{notificationId:n.id,channel:'PUSH'}});
      assert.equal(d.status,'FAILED');assert.equal(d.error,'messaging/authentication-error');reject=false;
      await prisma.webAuthSession.update({where:{id:sessionA},data:{expiresAt:new Date(Date.now()-1000)}});
      const skipped=await notificationTransaction(tx=>tx.notification.create({data:{organizationId:org.id,userId:user.id,type:'OPERATIONAL_ALERT',title:'No active device',message:'Synthetic'}}));
      const skip=await prisma.notificationDelivery.findFirstOrThrow({where:{notificationId:skipped.id,channel:'PUSH'}});
      assert.equal(skip.status,'SKIPPED_NO_DEVICES');assert.equal(skip.sentAt,null);assert.equal(skip.attempts,0);
      await prisma.webAuthSession.update({where:{id:sessionA},data:{expiresAt:new Date(Date.now()+3600000)}});
    });
    await check('real database: logout wins against an in-flight registration and preserves other devices',async()=>{
      await prisma.webAuthSession.update({where:{id:sessionB},data:{revokedAt:null}});
      await client.query('BEGIN');
      await client.query('SELECT id FROM web_auth_sessions WHERE id=$1 FOR UPDATE',[sessionA]);
      const binding=actions.saveDeviceTokenAction('synthetic-rotated-token','synthetic-agent',sessionA);
      // Observe the actual blocked registration before enqueueing logout.
      const observer=new Client({connectionString:process.env.DATABASE_URL});await observer.connect();
      try {
        for(let attempt=0;attempt<100;attempt++){
          const waiting=await observer.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM web_auth_sessions%' AND pid<>pg_backend_pid()");
          if(waiting.rowCount)break;
          if(attempt===99)throw new Error('Registration did not reach session lock');
          await new Promise(resolve=>setTimeout(resolve,10));
        }
      }finally{await observer.end();}
      const clearing=logout.clearSession();
      await client.query('COMMIT');
      await Promise.all([binding,clearing]);
      assert.equal(await prisma.userDeviceToken.count({where:{sessionId:sessionA}}),0);
      assert.equal(await prisma.userDeviceToken.count({where:{sessionId:sessionB}}),1);
      assert.ok((await actions.saveDeviceTokenAction('synthetic-late-token','agent',sessionA)).error);
      assert.equal(await prisma.userDeviceToken.count({where:{sessionId:sessionA}}),0);
    });
  } finally {
    await client.query('ROLLBACK').catch(()=>{});await client.end();
    await prisma.organization.delete({where:{id:org.id}});
    await prisma.webAuthSession.deleteMany({where:{userId:user.id}});
    await prisma.user.delete({where:{id:user.id}});
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
