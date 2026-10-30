// Real source modules, synthetic data and provider stubs. Never loads .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies, extra = {}) {
  const source = fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports = {};
  vm.runInNewContext(code,{exports,require(name){if(name in dependencies)return dependencies[name];if(name.startsWith('node:'))return require(name);throw new Error('Unstubbed dependency: '+name);},
    console:{error(){},warn(){},log(){}},process:{env:{}},URL,Response,Request,TextEncoder,setTimeout,clearTimeout,...extra},{filename:file});
  return exports;
}
async function check(name, test) { await test(); console.log('PASS: '+name); }

async function main() {
  await check('provider: web data-only, HTTPS links, native alerts, 500-address batches and safe failures',async()=>{
    const calls=[]; let failBatch=0;
    const provider={async sendEachForMulticast(message){calls.push(message);if(failBatch&&calls.length===failBatch)throw {code:'messaging/authentication-error',message:'secret-token-must-not-appear'};return {successCount:message.tokens.length,failureCount:0,responses:message.tokens.map(()=>({success:true}))};},async sendEach(messages){calls.push(messages);return {successCount:messages.length,failureCount:0,responses:messages.map(()=>({success:true}))};}};
    const sender=load('src/infrastructure/firebase/firebase-admin.ts',{
      'firebase-admin/app':{getApps:()=>[{}]},'firebase-admin/messaging':{getMessaging:()=>provider},fs:require('node:fs'),path:require('node:path'),
    });
    const base={tokens:['token-one'],title:'Private task title',body:'Private task body',clickAction:'/tasks/task-one'};
    await sender.sendWebPushNotification({...base,platform:'web'});
    assert.equal(calls[0].notification,undefined);assert.equal(calls[0].webpush.notification,undefined);
    assert.equal(calls[0].webpush.fcmOptions,undefined);assert.ok(!JSON.stringify(calls[0]).includes(base.title));assert.ok(!JSON.stringify(calls[0]).includes(base.body));
    await sender.sendWebPushNotification({...base,platform:'native',addressType:'fid'});
    assert.equal(calls[1][0].fid,'token-one');assert.equal(calls[1][0].notification.title,base.title);
    assert.equal(calls[1][0].webpush.fcmOptions.link,'https://tarefai.com.br/tasks/task-one');
    calls.length=0;
    const result=await sender.sendWebPushNotification({...base,tokens:Array.from({length:501},(_,i)=>'t-'+i)});
    assert.equal(result.successCount,501);assert.equal(calls[0].tokens.length,500);assert.equal(calls[1].tokens.length,1);
    calls.length=0;failBatch=2;
    const partial=await sender.sendWebPushNotification({...base,tokens:Array.from({length:501},(_,i)=>'t-'+i)});
    assert.equal(partial.successCount,500);assert.equal(partial.failureCount,1);
    assert.deepEqual(Array.from(partial.errors),['messaging/authentication-error']);
    assert.ok(!JSON.stringify(partial).includes('secret-token'));
  });

  await check('transaction: dispatch after commit, bulk IDs, no dispatch on rollback, transport cannot fail committed mutation',async()=>{
    const afters=[],sent=[];let committed=false,failTransport=false;
    const tx={notification:{create:async args=>({id:args.data.id}),createManyAndReturn:async args=>args.data.map(row=>({id:row.id}))}};
    const prisma={$transaction:async work=>{committed=false;const result=await work(tx);committed=true;return result;}};
    const wrapper=load('src/infrastructure/notifications/transaction.ts',{
      'next/server':{after:fn=>afters.push(fn)},'@/infrastructure/database/prisma':{prisma},
      './notification-service':{dispatchPersistedNotifications:async ids=>{assert.equal(committed,true);if(failTransport)throw new Error('offline');sent.push(...ids);}},
    });
    const result=await wrapper.notificationTransaction(async db=>{await db.notification.create({data:{id:'one'}});await db.notification.createMany({data:[{id:'two'},{id:'three'}]});return 'committed';});
    assert.equal(result,'committed');assert.equal(sent.length,0);await afters.shift()();assert.deepEqual(sent,['one','two','three']);
    await assert.rejects(wrapper.notificationTransaction(async db=>{await db.notification.create({data:{id:'rollback'}});throw new Error('rollback');}));
    assert.equal(afters.length,0);assert.ok(!sent.includes('rollback'));
    failTransport=true;await wrapper.notificationTransaction(db=>db.notification.create({data:{id:'provider-down'}}));await afters.shift()();
  });

  await check('registration: stale accounts rejected, session row locked and only that session rotated',async()=>{
    const session={sessionId:'00000000-0000-4000-8000-000000000001',userId:'user-a'};let upsert,deleted,active=true,locked=false;
    const prisma={$transaction:async work=>work({$queryRaw:async()=>{locked=true;return active?[{id:session.sessionId}]:[];},userDeviceToken:{deleteMany:async args=>{deleted=args;},upsert:async args=>{upsert=args;}}})};
    const actions=load('src/presentation/actions/push-notification-actions.ts',{'zod':require('zod'),
      '@/infrastructure/database/prisma':{prisma},'@/infrastructure/security/session':{getSession:async()=>session},
      '@/application/security/auth-context':{getAuthenticatedContext:async()=>({userId:session.userId})},
    });
    assert.ok((await actions.saveDeviceTokenAction('synthetic-token-long','agent','old-session')).error);assert.equal(locked,false);
    assert.equal((await actions.saveDeviceTokenAction('synthetic-token-long','agent',session.sessionId)).success,true);
    assert.equal(locked,true);assert.equal(upsert.update.userId,'user-a');assert.equal(upsert.update.sessionId,session.sessionId);
    assert.equal(deleted.where.sessionId,session.sessionId);assert.equal(deleted.where.userId,undefined);
    active=false;upsert=null;assert.ok((await actions.saveDeviceTokenAction('synthetic-token-long','agent',session.sessionId)).error);assert.equal(upsert,null);
  });

  await check('logout: revoke session and remove only its subscriptions in one transaction',async()=>{
    let deleted,revoked=false,cookieDeleted=false;
    const sessionId='00000000-0000-4000-8000-000000000001';
    const prisma={$transaction:async work=>work({$executeRaw:async()=>{revoked=true;},userDeviceToken:{deleteMany:async args=>{assert.equal(revoked,true);deleted=args;}}})};
    const session=load('src/infrastructure/security/session.ts',{
      '@/infrastructure/database/prisma':{prisma},'./mobile-context':{mobileSessionContext:{getStore:()=>null}},
      jose:{jwtVerify:async()=>({payload:{sessionId}})},'next/headers':{cookies:async()=>({get:()=>({value:'signed-cookie'}),delete:()=>{cookieDeleted=true;}})},
      '@/domain/types':{},react:{cache:fn=>fn},'@/infrastructure/database/request-memo':{requestRead:(_,fn)=>fn()},
    },{process:{env:{AUTH_SECRET:'synthetic-secret-with-at-least-32-characters'}}});
    await session.clearSession();assert.equal(cookieDeleted,true);assert.equal(deleted.where.sessionId,sessionId);assert.equal(Object.keys(deleted.where).length,1);
  });

  await check('web endpoint: authenticated session/account/organization and no-store response',async()=>{
    let current={sessionId:'session-a'},queried=0;
    const route=load('src/app/api/push/notification/route.ts',{
      '@/infrastructure/security/session':{getSession:async()=>current},
      '@/application/security/auth-context':{getAuthenticatedContext:async()=>({userId:'user-a',organizationId:'org-a'})},
      '@/infrastructure/database/prisma':{prisma:{notification:{findFirst:async args=>{queried++;assert.equal(args.where.userId,'user-a');assert.equal(args.where.organizationId,'org-a');return {id:'notice-one'};}}}},
      '@/application/mobile/notifications':{projectNotice:async()=>({title:'Allowed',message:'Scoped',destination:{taskId:'task-one'}})},
    });
    assert.equal((await route.GET(new Request('https://app.test/api/push/notification?sessionId=old&notificationId=notice-one'))).status,401);assert.equal(queried,0);
    const response=await route.GET(new Request('https://app.test/api/push/notification?sessionId=session-a&notificationId=notice-one'));
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal((await response.json()).url,'/tasks/task-one');
    current=null;assert.equal((await route.GET(new Request('https://app.test/api/push/notification?sessionId=session-a&notificationId=notice-one'))).status,401);
  });

  await check('service worker: background/foreground dedup, logout, switched account, pending message and click authorization',async()=>{
    const handlers={},displayed=[],navigations=[];let callback,current='00000000-0000-4000-8000-000000000001',defer;
    const data={notificationId:'notice-one',sessionId:current};
    const worker=fs.readFileSync(path.join(__dirname,'../public/firebase-messaging-sw.js'),'utf8');
    const registration={getNotifications:async ({tag})=>displayed.filter(n=>n.tag===tag),showNotification:async (title,options)=>{displayed.push({title,...options});}};
    vm.runInNewContext(worker,{URL,URLSearchParams,importScripts(){},firebase:{initializeApp(){},messaging:()=>({onBackgroundMessage:fn=>{callback=fn;}})},
      self:{registration,location:{origin:'https://app.test'},addEventListener:(type,fn)=>{handlers[type]=fn;},clients:{claim:async()=>{}},skipWaiting:async()=>{}},
      clients:{matchAll:async()=>[],openWindow:async url=>navigations.push(url)},
      fetch:async url=>{if(url==='/api/push/session')return {ok:true,json:async()=>({sessionId:current})};const sessionId=new URL(url,'https://app.test').searchParams.get('sessionId');if(defer)await defer.promise;return {ok:sessionId===current,json:async()=>({title:'Authorized title',body:'Authorized body',url:'/tasks/task-one',notificationId:data.notificationId,sessionId})};},
    });
    let blocked=0;
    handlers.push({data:{json:()=>({notification:{title:'Legacy private text'}})},stopImmediatePropagation(){blocked++;}});
    assert.equal(blocked,1);
    handlers.push({data:{json:()=>({data})},stopImmediatePropagation(){blocked++;}});assert.equal(blocked,1);
    current='other-account';await callback({data});assert.equal(displayed.length,0);
    current=data.sessionId;await Promise.all([callback({data}),callback({data})]);assert.equal(displayed.length,1);
    await callback({data});assert.equal(displayed.length,1);
    current='other-account';let click;handlers.notificationclick({notification:{data,close(){}},stopImmediatePropagation(){},waitUntil:p=>{click=p;}});await click;assert.equal(navigations.length,0);
    displayed.length=0;current=data.sessionId;let resolve;defer={promise:new Promise(done=>{resolve=done;})};
    const pending=callback({data});let ended;handlers.message({data:{type:'PUSH_SESSION_ENDED',sessionId:data.sessionId},waitUntil:p=>{ended=p;}});current='other-account';resolve();await Promise.all([pending,ended]);assert.equal(displayed.length,0);
    defer=null;current=data.sessionId;handlers.message({data:{type:'PUSH_SESSION_STARTED',sessionId:data.sessionId}});
    let foreground;handlers.message({data:{type:'DISPLAY_PUSH',data},waitUntil:p=>{foreground=p;}});await foreground;assert.equal(displayed.length,1);
    displayed.length=0;let tabClosed;handlers.message({data:{type:'PUSH_SESSION_ENDED',sessionId:data.sessionId},waitUntil:p=>{tabClosed=p;}});await tabClosed;
    await callback({data});assert.equal(displayed.length,1,'Closing one tab must not unsubscribe another active tab');
  });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
