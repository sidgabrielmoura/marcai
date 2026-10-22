import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import vm from "node:vm";
import ts from "typescript";
import { prisma } from "../src/infrastructure/database/prisma";
import { encryptSession, decryptSession } from "../src/infrastructure/security/session";
import { authenticatedMemberSelect, contextFromMember, type AuthenticatedContext } from "../src/application/security/auth-context";
import { notices, projectNotices, replay } from "../src/application/mobile/notifications";
import { includeTask, listTaskArgs, listTasks, projectTaskList, history } from "../src/application/mobile/data";
import { eventStream } from "../src/application/mobile/event-stream";
import { runScheduledJob, recordWorkFailure, clearWorkFailure, retryStates } from "../src/application/jobs/scheduled-job";
import { operationalTick } from "../src/application/processes/operational-tick";
import { pendingSlaMilestone } from "../src/domain/rules/operational-work";
import { databasePoolConfig, databaseQuerySampleRate } from "../src/infrastructure/database/config";
import { withReadRequest, requestRead } from "../src/infrastructure/database/request-memo";
import { maintainMobile } from "../src/application/mobile/maintenance";
import { resolveDestination } from "../src/application/mobile/destinations";
import { GET as fullRetention } from "../src/app/api/jobs/retention/route";
import { GET as historyRetention } from "../src/app/api/jobs/retention/history/route";
import { GET as trashRetention } from "../src/app/api/jobs/retention/trash/route";

const configured = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.DATABASE_EFFICIENCY_ISOLATED, "1");
assert.equal(configured.hostname, "127.0.0.1");
assert.equal(configured.port, "56433");
assert.equal(configured.pathname, "/tarefai_efficiency");
for (const key of ["ABLY_API_KEY", "RESEND_API_KEY", "WAHA_API_KEY", "FIREBASE_PRIVATE_KEY", "CLOUDINARY_API_SECRET"]) assert.equal(process.env[key], undefined);
globalThis.fetch = async () => { throw new Error("External transport disabled in isolated tests"); };

const statements: string[] = [];
const originalQuery = Client.prototype.query;
(Client.prototype as any).query = function (...args: any[]) {
  const query = typeof args[0] === "string" ? args[0] : args[0]?.text;
  if (query) statements.push(query);
  return (originalQuery as any).apply(this, args);
};
const results: Array<{ name: string; success: boolean; [key:string]: unknown }> = [];
const metrics: Record<string, unknown> = {};
const organizations: string[] = [];
const users: string[] = [];
const stateNames: string[] = [];
async function check(name: string, work: () => Promise<void> | void) {
  try { await work(); results.push({name,success:true}); console.log("PASS: "+name); }
  catch (error) { results.push({name,success:false,error:String(error)}); throw error; }
}
async function fixture(role: "OWNER" | "EMPLOYEE" = "EMPLOYEE") {
  const key=randomUUID();
  const org=await prisma.organization.create({data:{name:"Cost audit fixture",slug:"cost-audit-"+key}}); organizations.push(org.id);
  const user=await prisma.user.create({data:{name:"Isolated cost audit",passwordHash:"synthetic-password-hash"}}); users.push(user.id);
  const member=await prisma.organizationMember.create({data:{organizationId:org.id,userId:user.id,role,pinHash:"synthetic-pin-hash"}});
  const location=await prisma.location.create({data:{organizationId:org.id,name:"Test unit"}});
  const team=await prisma.team.create({data:{organizationId:org.id,name:"Test team"}});
  await prisma.memberLocationAccess.create({data:{memberId:member.id,locationId:location.id}});
  await prisma.teamMember.create({data:{organizationMemberId:member.id,teamId:team.id}});
  const context=contextFromMember(await prisma.organizationMember.findUniqueOrThrow({where:{id:member.id},select:authenticatedMemberSelect}));
  return {org,user,member,location,team,context};
}

async function main() {
  await check("pool bounds, UTC and opt-in sampling",()=>{
    assert.equal(databasePoolConfig().min,0); assert.equal(databasePoolConfig().max,10);
    assert.equal(databasePoolConfig().options,"-c timezone=UTC"); assert.equal(databaseQuerySampleRate(),0);
    process.env.DATABASE_POOL_MAX="0"; assert.throws(databasePoolConfig); delete process.env.DATABASE_POOL_MAX;
    process.env.DATABASE_QUERY_SAMPLE_RATE="2"; assert.throws(databaseQuerySampleRate); delete process.env.DATABASE_QUERY_SAMPLE_RATE;
  });
  const f=await fixture();
  await check("read memo is per invocation and never persists authorization between requests",async()=>{
    let loads=0; const load=async()=>++loads;
    assert.deepEqual(await withReadRequest(()=>Promise.all([requestRead('actor',load),requestRead('actor',load)])),[1,1]);
    assert.equal(await withReadRequest(()=>requestRead('actor',load)),2);
    assert.equal(await requestRead('actor',load),3); assert.equal(await requestRead('actor',load),4);
    assert.deepEqual(await Promise.all([withReadRequest(()=>requestRead('actor',load)),withReadRequest(()=>requestRead('actor',load))]),[5,6]);
  });
  await check("web session uses one SQL query and revokes on PIN/status/role changes",async()=>{
    const session={userId:f.user.id,name:f.user.name,email:null,activeOrgId:f.org.id,activeMemberId:f.member.id,role:"EMPLOYEE" as const};
    const token=await encryptSession(session);
    const start=statements.length;
    assert.equal((await decryptSession(token))?.activeMemberId,f.member.id);
    metrics.webSessionQueries=statements.length-start; assert.equal(metrics.webSessionQueries,1);
    await prisma.organizationMember.update({where:{id:f.member.id},data:{pinHash:"changed"}}); assert.equal(await decryptSession(token),null);
    await prisma.organizationMember.update({where:{id:f.member.id},data:{pinHash:f.member.pinHash,status:"SUSPENDED"}}); assert.equal(await decryptSession(token),null);
    await prisma.organizationMember.update({where:{id:f.member.id},data:{status:"ACTIVE",role:"MANAGER"}}); assert.equal(await decryptSession(token),null);
    await prisma.organizationMember.update({where:{id:f.member.id},data:{role:"EMPLOYEE"}});
    await prisma.webAuthSession.updateMany({where:{userId:f.user.id},data:{revokedAt:new Date()}}); assert.equal(await decryptSession(token),null);
  });
  await check("request projection excludes expired, future and foreign scopes",async()=>{
    const member=await prisma.organizationMember.findUniqueOrThrow({where:{id:f.member.id},select:authenticatedMemberSelect});
    const now=new Date();
    const copy={...member,locationAccesses:[...member.locationAccesses.map(a=>({...a,expiresAt:new Date(now.getTime()-1)})),{...member.locationAccesses[0]!,locationId:"future",startsAt:new Date(now.getTime()+10000)}],teamMemberships:member.teamMemberships.map(a=>({...a,team:{...a.team,organizationId:"foreign"}}))};
    const context=contextFromMember(copy,now); assert.deepEqual(context.scope,{locationIds:[],teamIds:[]});
  });
  const task=await prisma.task.create({data:{organizationId:f.org.id,teamId:f.team.id,locationId:f.location.id,title:"Bounded task",status:"IN_PROGRESS",startedAt:new Date(),assignments:{create:{memberId:f.member.id}},formFields:[{id:"large",type:"TEXT",label:"A".repeat(65536)}],formAnswers:{large:"B".repeat(65536)},description:"C".repeat(32768),instructions:"D".repeat(32768),evidenceRequirements:{create:{type:"TEXT",submissions:{create:{submittedBy:f.member.id,value:"E".repeat(65536),metadata:{large:"F".repeat(65536)}}}}}}});
  await check("list projection preserves DTO, permissions, clocks and evidence counts",async()=>{
    const full=await prisma.task.findMany({where:{id:task.id},include:includeTask});
    const small=await prisma.task.findMany({where:{id:task.id},...listTaskArgs});
    const serialize=(value:unknown)=>Buffer.byteLength(JSON.stringify(value));
    metrics.taskFullBytes=serialize(full); metrics.taskListBytes=serialize(small);
    assert.ok(Number(metrics.taskListBytes)<Number(metrics.taskFullBytes)/10);
    const now=new Date();
    const expected=(await projectTaskList(full,f.context,now))[0];
    const actual=(await listTasks(f.context,null,"","all",now)).items.find(row=>row.id===task.id);
    assert.deepEqual(actual,expected);
  });
  await check("notification destinations are authorized in batches and isolate tenants",async()=>{
    await prisma.notification.createMany({data:Array.from({length:20},(_,i)=>({organizationId:f.org.id,userId:f.user.id,type:"TASK_ASSIGNED",title:"Fixture "+i,message:"Synthetic message",data:{taskId:task.id}}))});
    const rows=await prisma.notification.findMany({where:{organizationId:f.org.id,userId:f.user.id}});
    const start=statements.length;
    const projected=await projectNotices(f.context,rows);
    metrics.notificationAuthorizationQueries=statements.length-start;
    assert.equal(metrics.notificationAuthorizationQueries,1); assert.equal(projected.length,20); assert.equal(projected[0]!.title,rows[0]!.title);
    const other=await fixture();
    assert.ok((await projectNotices(other.context,rows)).every(n=>n.title==="Acesso alterado"&&!n.destination.taskId));
    const listStart=statements.length;
    const page=await notices(f.context,"all",null);
    metrics.notificationPageQueries=statements.length-listStart; assert.ok(Number(metrics.notificationPageQueries)<=3); assert.equal(page.items.length,20);
    const ids=new Set(page.items.map(n=>n.id)); assert.equal(ids.size,20);
  });
  await check("cross-organization destination lookup stays bounded and rejects foreign access",async()=>{
    const foreign=await fixture();
    const foreignTask=await prisma.task.create({data:{organizationId:foreign.org.id,teamId:foreign.team.id,locationId:foreign.location.id,title:'Foreign destination',status:'COMPLETED',completedAt:new Date()}});
    const start=statements.length;
    assert.equal((await resolveDestination(f.context,{taskId:task.id})).organizationId,f.org.id);
    metrics.destinationQueries=statements.length-start; assert.ok(Number(metrics.destinationQueries)<=10);
    await assert.rejects(()=>resolveDestination(f.context,{taskId:foreignTask.id}),error=>(error as {status:number}).status===404);
    await assert.rejects(()=>resolveDestination(f.context,{}),error=>(error as {status:number}).status===400);
    await prisma.organizationMember.create({data:{organizationId:foreign.org.id,userId:f.user.id,role:'EMPLOYEE'}});
    await assert.rejects(()=>resolveDestination(f.context,{taskId:foreignTask.id}),error=>(error as {status:number}).status===404);
  });
  await check("event replay snapshots do not load historical events; idle and repeated-resource replay stay bounded",async()=>{
    let start=statements.length; const snapshot=await replay(f.context,null);
    metrics.snapshotQueries=statements.length-start; assert.equal(metrics.snapshotQueries,1); assert.ok(snapshot.requiresSnapshot);
    start=statements.length; const idle=await replay(f.context,snapshot.nextCursor);
    metrics.idleReplayQueries=statements.length-start; assert.equal(metrics.idleReplayQueries,2); assert.equal(idle.events.length,0);
    await prisma.nativeEvent.createMany({data:Array.from({length:100},()=>({organizationId:f.org.id,taskId:task.id,kind:"TASK_CHANGED"}))});
    start=statements.length; const replayed=await replay(f.context,idle.nextCursor);
    metrics.hundredEventReplayQueries=statements.length-start; assert.equal(replayed.events.length,100); assert.equal(metrics.hundredEventReplayQueries,3);
    const scopeChanged={...f.context,scope:{locationIds:[],teamIds:[]}};
    assert.notEqual((await replay(scopeChanged,replayed.nextCursor)).scopeVersion,replayed.scopeVersion);
    await assert.rejects(()=>replay(f.context,"invalid"));
    const other=await fixture(); const foreign=await replay(other.context,idle.nextCursor); assert.equal(foreign.events.length,0);
  });
  await check("late transactions cannot fall behind the replay watermark",async()=>{
    const baseline=await replay(f.context,null);
    const slow=new Client({connectionString:process.env.DATABASE_URL}); await slow.connect();
    try {
      await slow.query("BEGIN");
      await slow.query("INSERT INTO mobile_events(organization_id,task_id,kind) VALUES($1,$2,'SLOW_FIXTURE')",[f.org.id,task.id]);
      await prisma.nativeEvent.create({data:{organizationId:f.org.id,taskId:task.id,kind:"FAST_FIXTURE"}});
      const during=await replay(f.context,baseline.nextCursor); assert.equal(during.events.length,0);
      await slow.query("COMMIT");
      const after=await replay(f.context,during.nextCursor); assert.deepEqual(new Set(after.events.map(e=>e.kind)),new Set(["SLOW_FIXTURE","FAST_FIXTURE"]));
    } finally { await slow.query("ROLLBACK"); await slow.end(); }
  });
  await check("SSE idle reconnect preserves cursor, avoids refresh and backs off; revoked scope stops streaming",async()=>{
    const snapshot=await replay(f.context,null);
    let validations=0;
      const url=`http://localhost/api/events?cursor=${snapshot.nextCursor}&scopeVersion=${snapshot.scopeVersion}`;
      const start=statements.length;
      const text=await eventStream({request:new Request(url),initialContext:f.context,authenticate:async()=>{validations++;return f.context;}}).text();
      metrics.idleStreamQueries=statements.length-start; metrics.idleStreamValidations=validations;
      const checkpoints=(text.match(/event: checkpoint/g)||[]).length;
      assert.doesNotMatch(text,/SYNC_REQUIRED/); assert.ok(checkpoints>=2&&checkpoints<=3); assert.equal(validations,checkpoints-1);
      const revoked=await eventStream({request:new Request(url),initialContext:f.context,authenticate:async()=>null}).text(); assert.match(revoked,/event: revoked/);
  });
  await check("lease excludes overlap and failed/expired leases recover",async()=>{
    const name="test:"+randomUUID(); stateNames.push(name);
    let entered!:()=>void,release!:()=>void; const ready=new Promise<void>(r=>entered=r); const gate=new Promise<void>(r=>release=r);
    const first=runScheduledJob(name,60000,async()=>{entered();await gate;return {count:1};}); await ready;
    assert.equal((await runScheduledJob(name,60000,async()=>({count:2}))).skipped,true);
    release(); assert.equal((await first).skipped,false);
    await assert.rejects(()=>runScheduledJob(name,60000,async()=>{throw new Error("fixture");}));
    assert.equal((await prisma.scheduledJobState.findUniqueOrThrow({where:{name}})).leaseToken,null);
    await prisma.scheduledJobState.update({where:{name},data:{leaseToken:"expired",leaseUntil:new Date(0)}});
    assert.equal((await runScheduledJob(name,60000,async()=>({count:3}))).skipped,false);
  });
  await check("retry backoff is persistent and can be cleared after correction",async()=>{
    const key="test:"+randomUUID(); stateNames.push("retry:"+key);
    await recordWorkFailure(key); const first=(await retryStates([key])).get(key)!;
    assert.ok(first.nextAttemptAt!.getTime()>Date.now()+50000);
    await recordWorkFailure(key); const second=(await retryStates([key])).get(key)!;
    assert.ok(second.nextAttemptAt!.getTime()>Date.now()+100000);
    await clearWorkFailure(key); assert.equal((await retryStates([key])).size,0);
  });
  await check("all retention entry points share a lease and reject unauthorized calls before database work",async()=>{
    const start=statements.length;
    for(const route of [fullRetention,historyRetention,trashRetention]) assert.equal((await route(new Request('http://localhost/api/jobs/retention'))).status,401);
    assert.equal(statements.length,start);
    stateNames.push('retention');let release!:()=>void,entered!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const holding=runScheduledJob('retention',360000,async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});return {count:1};});
    await started;
    try {for(const route of [fullRetention,historyRetention,trashRetention]) {
      const response=await route(new Request('http://localhost/api/jobs/retention',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}));
      assert.equal(response.status,200);assert.equal((await response.json()).reason,'ALREADY_RUNNING');
    }} finally {release();await holding;}
  });
  await check("all handled SLA milestones cause no per-task transaction",async()=>{
    const owner=await fixture("OWNER");
    const now=new Date(); now.setHours(15,0,0,0);
    const due=new Date(now.getTime()-3*3600000);
    const ids=Array.from({length:40},()=>randomUUID());
    await prisma.task.createMany({data:ids.map(id=>({id,organizationId:owner.org.id,title:"Handled SLA",status:"IN_PROGRESS",slaDueAt:due,createdAt:new Date(now.getTime()-4*3600000)}))});
    await prisma.taskOccurrence.createMany({data:ids.map(id=>({taskId:id,type:"SLA_BREACH",category:"SLA_120",reason:"Synthetic processed milestone"}))});
    const begin=statements.length; const tick=await operationalTick(now);
    metrics.handledSlaTickQueries=statements.length-begin;
    const transactions=statements.slice(begin).filter(sql=>/^\s*BEGIN\b/i.test(sql));
    assert.equal(transactions.length,0); assert.equal(tick.alerts,0); assert.deepEqual(tick.failures,[]);
    assert.equal(pendingSlaMilestone(due,null,["SLA_120"],now),null);
  });
  await check("approval escalation filters completed work before the batch limit",async()=>{
    const owner=await fixture("OWNER"),now=new Date();
    const ids=Array.from({length:101},()=>randomUUID());
    await prisma.task.createMany({data:ids.map(id=>({id,organizationId:owner.org.id,title:"Approval fixture",status:"SUBMITTED"}))});
    await prisma.approvalWorkflow.createMany({data:ids.map(id=>({id:"workflow-"+id,taskId:id}))});
    await prisma.approvalStep.createMany({data:ids.map(id=>({id:"step-"+id,workflowId:"workflow-"+id,sequence:1,deadlineAt:new Date(now.getTime()-60000)}))});
    await prisma.activityLog.createMany({data:ids.slice(0,100).map(id=>({organizationId:owner.org.id,entityType:"APPROVAL_STEP",entityId:"step-"+id,action:"APPROVAL_DEADLINE_EXCEEDED"}))});
    const result=await operationalTick(now); assert.deepEqual(result.failures,[]); assert.equal(result.escalations,1);
    assert.equal(await prisma.activityLog.count({where:{organizationId:owner.org.id,action:"APPROVAL_DEADLINE_EXCEEDED"}}),101);
    assert.equal((await operationalTick(now)).escalations,0);
  });
  await check("history projects rounds in a batch instead of one lookup per task",async()=>{
    await prisma.task.update({where:{id:task.id},data:{status:"COMPLETED",completedAt:new Date()}});
    const start=statements.length; const result=await history(f.context,30,"ALL",null);
    assert.equal(result.items.length,1); assert.ok(statements.length-start<20);
  });
  await check("server board pagination reuses totals without truncating items",async()=>{
    const pageFixture=await fixture();
    await prisma.task.createMany({data:Array.from({length:105},(_,i)=>({id:'page-'+randomUUID(),organizationId:pageFixture.org.id,title:'Page '+i,teamId:pageFixture.team.id,locationId:pageFixture.location.id,status:'AVAILABLE'}))});
    const cache:NonNullable<Parameters<typeof listTasks>[5]>={}; const now=new Date();
    const first=await listTasks(pageFixture.context,null,'','all',now,cache); assert.equal(first.items.length,100); assert.ok(first.nextCursor);
    const start=statements.length; const second=await listTasks(pageFixture.context,first.nextCursor,'','all',now,cache); const cachedQueries=statements.length-start;
    const uncachedStart=statements.length; const uncached=await listTasks(pageFixture.context,first.nextCursor,'','all',now); const uncachedQueries=statements.length-uncachedStart;
    assert.equal(second.items.length,5); assert.equal(new Set([...first.items,...second.items].map(t=>t.id)).size,105); assert.deepEqual(second,uncached); assert.ok(cachedQueries<uncachedQueries);
    metrics.secondBoardPageQueries={cached:cachedQueries,uncached:uncachedQueries};
  });
  await check("routine latest index reduces page access; future generation avoids transaction",async()=>{
    const owner=await fixture('OWNER');
    const routineProcess=await prisma.process.create({data:{organizationId:owner.org.id,name:'Index fixture'}});
    const routine=await prisma.routine.create({data:{processId:routineProcess.id,recurrenceRule:'FREQ=DAILY',startsAt:new Date('2020-01-01'),timezone:'UTC'}});
    const now=new Date();
    await prisma.processExecution.createMany({data:Array.from({length:4000},(_,i)=>({organizationId:owner.org.id,processId:routineProcess.id,routineId:routine.id,status:'COMPLETED',scheduledAt:new Date(now.getTime()-(4001-i)*60000),availableAt:new Date(now.getTime()-(4001-i)*60000)}))});
    await prisma.processExecution.create({data:{organizationId:owner.org.id,processId:routineProcess.id,routineId:routine.id,status:'SCHEDULED',scheduledAt:new Date(now.getTime()+86400000),availableAt:new Date(now.getTime()+86400000)}});
    await prisma.routine.create({data:{processId:routineProcess.id,recurrenceRule:'FREQ=DAILY',startsAt:new Date(now.getTime()+2*86400000),timezone:'UTC',generationLeadTime:0}});
    const client=new Client({connectionString:process.env.DATABASE_URL}); await client.connect();
    try {
      await client.query('ANALYZE process_executions');
      const sql='EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM process_executions WHERE "routineId"=$1 ORDER BY "scheduledAt" DESC LIMIT 1';
      const indexed=(await client.query(sql,[routine.id])).rows[0]['QUERY PLAN'][0].Plan;
      assert.match(JSON.stringify(indexed),/process_executions_routine_latest_idx/);
      await client.query('BEGIN');
      await client.query('DROP INDEX process_executions_routine_latest_idx');
      const baseline=(await client.query(sql,[routine.id])).rows[0]['QUERY PLAN'][0].Plan;
      const blocks=(plan:any)=>(plan['Shared Hit Blocks']||0)+(plan['Shared Read Blocks']||0);
      metrics.routineLatestIndex={indexedBlocks:blocks(indexed),baselineBlocks:blocks(baseline),rows:4001};
      assert.ok(blocks(indexed)<blocks(baseline));
      await client.query('ROLLBACK');
    } finally {await client.query('ROLLBACK');await client.end();}
    const start=statements.length; await operationalTick(now);
    const work=statements.slice(start); assert.equal(work.filter(sql=>/^\s*BEGIN\b/i.test(sql)).length,0);
    assert.equal(await prisma.processExecution.count({where:{routineId:routine.id}}),4001);
  });
  await check("maintenance removes expired auxiliaries and preserves active sessions",async()=>{
    const oldId=randomUUID(),activeId=randomUUID();
    await prisma.webAuthSession.createMany({data:[{id:oldId,userId:f.user.id,memberId:f.member.id,organizationId:f.org.id,credentialVersion:'synthetic',expiresAt:new Date(Date.now()-9*86400000)},{id:activeId,userId:f.user.id,memberId:f.member.id,organizationId:f.org.id,credentialVersion:'synthetic',expiresAt:new Date(Date.now()+86400000)}]});
    await prisma.webQrBinding.createMany({data:[{token:'old-'+randomUUID(),initiatorHash:'synthetic',expiresAt:new Date(Date.now()-2*86400000)}]});
    const result=await maintainMobile(); assert.equal(result.webSessions,1); assert.equal(result.qrBindings,1);
    assert.ok(await prisma.webAuthSession.findUnique({where:{id:activeId}}));
  });
  await check("realtime client deduplicates reconnect listeners, bursts and hidden-tab work",async()=>{
    await verifyRealtimeClient();
  });
  await check("QR polling is sequential, pauses when hidden and stops at expiry or approval",async()=>{
    await verifyQrPolling();
  });
}

async function verifyQrPolling() {
  const source=readFileSync(join(process.cwd(),'src/app/(auth)/login/page.tsx'),'utf8');
  const parsed=ts.createSourceFile('login.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let effect:ts.ArrowFunction|undefined;
  function visit(node:ts.Node) {
    if(ts.isCallExpression(node)&&node.expression.getText(parsed)==='useEffect'&&node.arguments[0]&&ts.isArrowFunction(node.arguments[0])&&node.arguments[0].getText(parsed).includes('async function checkQR'))effect=node.arguments[0];
    ts.forEachChild(node,visit);
  }
  visit(parsed); assert.ok(effect);
  const code=ts.transpileModule('globalThis.startQrEffect = '+effect.getText(parsed),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const approved of [false,true]) {
    const timers=new Map<number,()=>Promise<void>>(),listeners=new Map<string,()=>void>();
    let serial=0,calls=0,expired=false,loggedIn=0,now=1000,finish:((status:string)=>void)|undefined;
    const document={hidden:false,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)};
    const sandbox:any={document,window:{location:{origin:'http://localhost',href:''}},console,Date:class extends Date{static now(){return now;}},tab:'biometrics',isMobile:false,isPlatformBiometricAvailable:false,showQrOnDesktop:true,qrToken:'fixture',qrExpiresAt:301000,qrExpired:false,
      setQrExpired:(value:boolean)=>{expired=value;},setIsQrLoading(){},setQrToken(){},setQrExpiresAt(){},setQrUrl(){},toast:{add(){}},
      generateMobileAuthTokenAction:()=>{throw new Error('Unexpected QR regeneration');},
      checkMobileAuthTokenAction:()=>{calls++;return new Promise<string>(resolve=>{finish=resolve;});},loginWithMobileSessionAction:async()=>{loggedIn++;return {redirectUrl:'/tasks'};},
      setTimeout:(fn:()=>Promise<void>)=>{const id=++serial;timers.set(id,fn);return id;},clearTimeout:(id:number)=>timers.delete(id)};
    vm.runInNewContext(code,sandbox);const cleanup=sandbox.startQrEffect();
    assert.equal(timers.size,1); const [id,fn]=[...timers][0]!;timers.delete(id);const running=fn();assert.equal(calls,1);assert.equal(timers.size,0);
    listeners.get('visibilitychange')!();assert.equal(calls,1);
    finish!(approved?'APPROVED':'PENDING');await running;
    if(approved){assert.equal(loggedIn,1);assert.equal(timers.size,0);assert.equal(sandbox.window.location.href,'/tasks');}
    else {assert.equal(timers.size,1);document.hidden=true;listeners.get('visibilitychange')!();assert.equal(timers.size,0);assert.equal(calls,1);now=302000;document.hidden=false;listeners.get('visibilitychange')!();assert.ok(expired);assert.equal(calls,1);assert.equal(timers.size,0);}
    cleanup();assert.equal(listeners.size,0);
  }
}

async function verifyRealtimeClient() {
  const effects: Array<()=>void|(()=>void)> = [],timers=new Map<number,()=>void>(); let serial=0,refreshes=0;
  const listeners=new Map<string,()=>void>();
  const clients:any[]=[],sources:any[]=[];
  class FakeChannel { callbacks:any[]=[]; subscribe(callback:any){this.callbacks.push(callback);return Promise.resolve();} }
  class FakeRealtime {
    options:any; auth={clientId:"fixture-user"}; channelsByName=new Map<string,FakeChannel>(); events=new Map<string,()=>void>(); closed=false;
    channels={get:(name:string)=>{if(!this.channelsByName.has(name))this.channelsByName.set(name,new FakeChannel());return this.channelsByName.get(name)!;}};
    connection={errorReason:null,on:(name:string,callback:()=>void)=>this.events.set(name,callback)};
    constructor(options:any){this.options=options;clients.push(this);} close(){this.closed=true;}
    async connect(){await new Promise<void>(resolve=>this.options.authCallback({},()=>{this.events.get("connected")?.();resolve();}));}
  }
  class FakeSource {
    url:string; closed=false; events=new Map<string,(event:any)=>void>(); onerror?:()=>void; onopen?:()=>void;
    constructor(url:string){this.url=url;sources.push(this);} close(){this.closed=true;} addEventListener(name:string,cb:any){this.events.set(name,cb);}
  }
  const document={hidden:false,addEventListener:(name:string,callback:()=>void)=>listeners.set(name,callback),removeEventListener:(name:string)=>listeners.delete(name)};
  const source=readFileSync(join(process.cwd(),"src/presentation/hooks/use-realtime-events.ts"),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{} as any};
  const sandbox={module,exports:module.exports,document,window:{addEventListener(){},removeEventListener(){}},URLSearchParams,EventSource:FakeSource,fetch:async()=>({ok:true,json:async()=>({capability:JSON.stringify({"org:fixture-org:notifications":["subscribe"],"user:fixture-user:notifications":["subscribe"]})})}),setTimeout:(callback:()=>void)=>{const id=++serial;timers.set(id,callback);return id;},clearTimeout:(id:number)=>timers.delete(id),require:(name:string)=>{
    if(name==="react")return{useRef:(value:any)=>({current:value}),useEffect:(effect:any)=>effects.push(effect),useTransition:()=>[false,(fn:any)=>fn()]};
    if(name==="next/navigation")return{useRouter:()=>({refresh:()=>refreshes++})};
    if(name==="ably")return{Realtime:FakeRealtime};throw new Error(name);
  }};
  vm.runInNewContext(code,sandbox); module.exports.useRealtimeEvents(()=>{},true); const cleanup=effects[0]!();
  const client=clients[0]; await client.connect(); client.events.get("connected")();
  assert.equal([...client.channelsByName.values()].reduce((count:number,c:any)=>count+c.callbacks.length,0),2);
  const channel=client.channelsByName.get("user:fixture-user:notifications");
  for(let i=0;i<20;i++)channel.callbacks[0]({id:"same-event",name:"notification:new",data:{organizationId:"fixture-org",notificationId:"same-notice"}});
  assert.equal(timers.size,1); for(const [id,callback] of [...timers]){timers.delete(id);callback();} assert.equal(refreshes,1);
  client.events.get("failed")(); assert.equal(sources.length,1);
  sources[0].events.get("checkpoint")({data:JSON.stringify({cursor:"42",scopeVersion:"scope"})}); sources[0].onerror();
  for(const [id,callback] of [...timers]){timers.delete(id);callback();} assert.match(sources[1].url,/cursor=42/); assert.equal(refreshes,1);
  client.events.get("connected")(); assert.ok(sources[1].closed);
  document.hidden=true; listeners.get("visibilitychange")!(); assert.ok(client.closed); assert.equal(timers.size,0);
  document.hidden=false; listeners.get("visibilitychange")!(); assert.equal(clients.length,2);
  if(typeof cleanup==="function")cleanup(); assert.ok(clients[1].closed);
}

main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  try {
    await prisma.webAuthSession.deleteMany({where:{userId:{in:users}}});
    await prisma.organization.deleteMany({where:{id:{in:organizations}}});
    await prisma.nativeEvent.deleteMany({where:{organizationId:{in:organizations}}});
    await prisma.user.deleteMany({where:{id:{in:users}}});
    await prisma.scheduledJobState.deleteMany({where:{name:{in:stateNames}}});
  } finally {
    (Client.prototype as any).query=originalQuery;
    writeFileSync(join(process.cwd(),"../verification.json"),JSON.stringify({results,metrics,finishedAt:new Date().toISOString()},null,2));
    await prisma.$disconnect();
  }
});
