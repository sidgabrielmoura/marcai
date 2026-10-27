import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Client } from 'pg';
import { prisma } from '../src/infrastructure/database/prisma';
import { dueOperationalPhases, finishOperationalPhase, runSelectiveOperational } from '../src/application/processes/operational-agenda';
import { operationalTick } from '../src/application/processes/operational-tick';
import { nextOperationalRun, nextTaskSlaAt } from '../src/application/processes/operational-next';
import { routineScheduledAt, generateRoutineExecution } from '../src/application/processes/generate-execution';
import { GET } from '../src/app/api/jobs/operational/route';
import { processDefinitionSchema, processTaskSchema } from '../src/domain/rules/process-definition';

const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.DATABASE_EFFICIENCY_ISOLATED, '1');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '56433'); assert.equal(url.pathname, '/tarefai_efficiency');
for (const key of ['ABLY_API_KEY','RESEND_API_KEY','WAHA_API_KEY','FIREBASE_PRIVATE_KEY','CLOUDINARY_API_SECRET']) assert.equal(process.env[key], undefined);
globalThis.fetch = async () => { throw new Error('External delivery forbidden'); };
const statements: string[] = [];
const original = Client.prototype.query;
(Client.prototype as any).query = function (...args: any[]) { statements.push(typeof args[0] === 'string' ? args[0] : args[0]?.text ?? ''); return (original as any).apply(this,args); };
const checks: string[] = [], orgs: string[] = [], users: string[] = [];
const clock = () => new Date(Date.now() + 1000);
const progress = {nextRoutineAt:null,routineMore:false,dependencyMore:false,incomplete:false};
async function check(name: string, work: () => unknown) { await work(); checks.push(name); console.log('PASS: '+name); }
async function fixture() {
  const org = await prisma.organization.create({data:{name:'Selective isolated',slug:'selective-'+randomUUID()}}); orgs.push(org.id);
  const process = await prisma.process.create({data:{organizationId:org.id,name:'Selective process'}});
  const task = await prisma.task.create({data:{organizationId:org.id,title:'Selective task',status:'IN_PROGRESS'}});
  return {org,process,task};
}
async function clear() { await prisma.operationalSignal.deleteMany(); await prisma.operationalAgenda.deleteMany(); }
async function main() {
  await clear();
  await check('unauthorized and disabled route perform zero SQL',async()=>{
    let start=statements.length; assert.equal((await GET(new Request('http://localhost/api/jobs/operational'))).status,401); assert.equal(statements.length,start);
    process.env.OPERATIONAL_JOBS_ENABLED='0'; start=statements.length;
    const response=await GET(new Request('http://localhost/api/jobs/operational',{headers:{'x-cron-secret':process.env.CRON_SECRET!}}));
    assert.equal((await response.json()).reason,'DISABLED'); assert.equal(statements.length,start); delete process.env.OPERATIONAL_JOBS_ENABLED;
  });
  await check('empty selective tick is exactly one SELECT with no writes',async()=>{
    const invalidStart=statements.length;await assert.rejects(runSelectiveOperational(clock(),-1),/Invalid job minimum interval/);assert.equal(statements.length,invalidStart);
    const start=statements.length; assert.equal((await runSelectiveOperational(clock(),0)).reason,'NO_WORK');
    assert.equal(statements.length-start,1); assert.match(statements[start],/WITH signals/); assert.doesNotMatch(statements[start],/INSERT|UPDATE|DELETE/);
  });
  const a=await fixture(), b=await fixture();
  await check('business writes coalesce per organization/phase/transaction and rollback atomically',async()=>{
    await clear();
    await prisma.$transaction(async tx=>{for(let n=0;n<10;n++)await tx.task.update({where:{id:a.task.id},data:{description:String(n)}});});
    assert.deepEqual((await prisma.operationalSignal.findMany({orderBy:{phase:'asc'}})).map(s=>[s.organizationId,s.phase]),[[a.org.id,'DEPENDENCIES'],[a.org.id,'TASKS']]);
    const before=await prisma.operationalSignal.count();
    await assert.rejects(prisma.$transaction(async tx=>{await tx.task.update({where:{id:a.task.id},data:{description:'rollback'}});throw Error('rollback');}));
    assert.equal(await prisma.operationalSignal.count(),before);
    await prisma.task.update({where:{id:a.task.id},data:{updatedAt:new Date()}}); assert.equal(await prisma.operationalSignal.count(),before);
  });
  await check('lower-ID late commit survives acknowledgement of a newer committed signal',async()=>{
    await clear(); const late=new Client({connectionString:process.env.DATABASE_URL}); await late.connect();
    try {
      await late.query('BEGIN'); await late.query('UPDATE tasks SET description=$1 WHERE id=$2',['late',a.task.id]);
      const [{id:earlyId}]= (await late.query("SELECT id FROM operational_signals WHERE organization_id=$1 AND phase='TASKS'",[a.org.id])).rows;
      const another=await prisma.task.create({data:{organizationId:a.org.id,title:'Concurrent committed'}});
      const row=(await dueOperationalPhases(clock())).find(r=>r.organizationId===a.org.id&&r.phase==='TASKS')!;
      assert.ok(row.signalIds.every(id=>BigInt(id)>BigInt(earlyId)));
      await finishOperationalPhase(row,new Date(Date.now()+3600000),clock(),false);
      await late.query('COMMIT');
      assert.ok(await prisma.operationalSignal.findUnique({where:{id:BigInt(earlyId)}}));
      assert.ok((await dueOperationalPhases(clock())).some(r=>r.organizationId===a.org.id&&r.phase==='TASKS'));
      await prisma.task.delete({where:{id:another.id}});
    } finally {await late.query('ROLLBACK');await late.end();}
  });
  await check('new signals and stale revision cannot be erased by phase completion',async()=>{
    await clear(); await prisma.task.update({where:{id:a.task.id},data:{description:'first'}});
    const row=(await dueOperationalPhases(clock())).find(r=>r.phase==='TASKS')!;
    await prisma.task.update({where:{id:a.task.id},data:{description:'concurrent'}});
    assert.equal(await finishOperationalPhase(row,new Date(Date.now()+3600000),clock(),false),true);
    const remaining=await prisma.operationalSignal.findMany({where:{phase:'TASKS'}}); assert.equal(remaining.length,1);
    assert.equal(await finishOperationalPhase(row,new Date(),clock(),false),false);
    assert.equal(await prisma.operationalSignal.count({where:{phase:'TASKS'}}),1);
  });
  await check('failure delays captured signals; new changes bypass the old backoff',async()=>{
    await clear(); await prisma.task.update({where:{id:a.task.id},data:{description:'failure'}});
    const row=(await dueOperationalPhases(clock())).find(r=>r.phase==='TASKS')!;
    await finishOperationalPhase(row,new Date(Date.now()+3600000),null,true);
    assert.equal((await dueOperationalPhases(clock())).filter(r=>r.phase==='TASKS').length,0);
    await prisma.task.update({where:{id:a.task.id},data:{description:'new work'}});
    assert.equal((await dueOperationalPhases(clock())).filter(r=>r.phase==='TASKS').length,1);
  });
  await check('probe bounds phase and signal batches without acknowledging unseen work',async()=>{
    await clear();
    const ids=Array.from({length:7},()=>randomUUID());orgs.push(...ids);
    await prisma.organization.createMany({data:ids.map(id=>({id,name:'Bounded metadata',slug:'bounded-'+id}))});
    await prisma.operationalSignal.deleteMany();
    const now=clock(),old=new Date(now.getTime()-60000);
    await prisma.operationalAgenda.createMany({data:ids.flatMap(organizationId=>['ROUTINES','EXECUTIONS','DEPENDENCIES','TASKS','APPROVALS','REPORTS'].map(phase=>({organizationId,phase,nextRunAt:now,lastCompletedAt:old})))});
    await prisma.operationalSignal.createMany({data:Array.from({length:1005},(_,i)=>({organizationId:a.org.id,phase:'TASKS',transactionId:BigInt(100000+i),availableAt:old}))});
    const rows=await dueOperationalPhases(now);assert.equal(rows.length,36);assert.equal(rows.reduce((n,r)=>n+r.signalIds.length,0),1000);
    const task=rows.find(r=>r.organizationId===a.org.id&&r.phase==='TASKS')!;
    await finishOperationalPhase(task,new Date(now.getTime()+60000),null,false);
    assert.equal(await prisma.operationalSignal.count({where:{organizationId:a.org.id,phase:'TASKS'}}),5);
    const checkpoint=rows.find(r=>r.organizationId!==a.org.id)!;
    await finishOperationalPhase(checkpoint,new Date(now.getTime()+60000),null,false);
    assert.equal((await prisma.operationalAgenda.findUniqueOrThrow({where:{organizationId_phase:{organizationId:checkpoint.organizationId,phase:checkpoint.phase}}})).lastCompletedAt?.getTime(),old.getTime());
    await prisma.organization.deleteMany({where:{id:{in:ids}}});
  });
  await check('a persistent execution failure cannot postpone unrelated future deadlines for an hour',async()=>{
    const now=clock(),id='selective-poison-'+randomUUID();
    await prisma.processExecution.create({data:{id,organizationId:a.org.id,processId:a.process.id,scheduledAt:now,availableAt:now}});
    const healthy=await prisma.processExecution.create({data:{organizationId:a.org.id,processId:a.process.id,scheduledAt:new Date(now.getTime()+120000),availableAt:new Date(now.getTime()+120000)}});
    await clear();await prisma.operationalAgenda.create({data:{organizationId:a.org.id,phase:'EXECUTIONS',nextRunAt:now,failures:6}});
    const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
    try {
      await client.query(`CREATE FUNCTION isolated_operational_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id LIKE 'selective-poison-%' THEN RAISE EXCEPTION 'Isolated execution failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER isolated_operational_failure BEFORE UPDATE ON process_executions FOR EACH ROW EXECUTE FUNCTION isolated_operational_failure();`);
      const result=await runSelectiveOperational(now,0);assert.equal(result.skipped,false);
      if(!result.skipped)assert.equal(result.result.failures.length,1);
      const agenda=await prisma.operationalAgenda.findUniqueOrThrow({where:{organizationId_phase:{organizationId:a.org.id,phase:'EXECUTIONS'}}});
      assert.equal(agenda.nextRunAt.getTime(),now.getTime()+60000);assert.equal(agenda.lastCompletedAt,null);
    } finally {
      await client.query('DROP TRIGGER IF EXISTS isolated_operational_failure ON process_executions; DROP FUNCTION IF EXISTS isolated_operational_failure();');await client.end();
      await prisma.processExecution.deleteMany({where:{id:{in:[id,healthy.id]}}});
    }
  });
  await check('execution release is scoped and future releases remain scheduled',async()=>{
    const now=clock(), future=new Date(now.getTime()+3600000);
    const due=await prisma.processExecution.create({data:{organizationId:a.org.id,processId:a.process.id,scheduledAt:now,availableAt:now}});
    const foreign=await prisma.processExecution.create({data:{organizationId:b.org.id,processId:b.process.id,scheduledAt:now,availableAt:now}});
    const later=await prisma.processExecution.create({data:{organizationId:a.org.id,processId:a.process.id,scheduledAt:future,availableAt:future}});
    const result=await operationalTick(now,{organizationId:a.org.id,phases:['EXECUTIONS']}); assert.equal(result.released,1);assert.deepEqual(result.failures,[]);
    assert.equal((await prisma.processExecution.findUniqueOrThrow({where:{id:foreign.id}})).status,'SCHEDULED');
    assert.notEqual((await prisma.processExecution.findUniqueOrThrow({where:{id:due.id}})).status,'SCHEDULED');
    assert.equal((await nextOperationalRun(a.org.id,'EXECUTIONS',now,new Date(now.getTime()+7200000),progress,Date.now()+10000)).at.getTime(),future.getTime());
    await prisma.processExecution.deleteMany({where:{id:{in:[due.id,foreign.id,later.id]}}});
  });
  await check('SLA milestones, warning deduplication and unassigned alerts preserve idempotency',async()=>{
    const now=clock(), due=new Date(now.getTime()-20*60000);
    const sla=await prisma.task.create({data:{organizationId:a.org.id,title:'SLA',status:'IN_PROGRESS',slaDueAt:due}});
    const warning=await prisma.task.create({data:{organizationId:a.org.id,title:'Warning',status:'IN_PROGRESS',slaDueAt:new Date(now.getTime()+10*60000)}});
    const unassigned=await prisma.task.create({data:{organizationId:a.org.id,title:'Unassigned',status:'AVAILABLE',createdAt:new Date(now.getTime()-20*60000)}});
    const first=await operationalTick(now,{organizationId:a.org.id,phases:['TASKS']});assert.deepEqual(first.failures,[]); assert.equal(first.alerts,3);
    const second=await operationalTick(now,{organizationId:a.org.id,phases:['TASKS']});assert.equal(second.alerts,0);
    assert.equal(await prisma.taskOccurrence.count({where:{taskId:sla.id}}),1); assert.equal(await prisma.activityLog.count({where:{entityId:warning.id,action:'TASK_EXPIRING_SOON'}}),1);
    assert.equal(nextTaskSlaAt(due,null,['SLA_15'],now)?.getTime(),due.getTime()+30*60000);
    assert.equal(nextTaskSlaAt(new Date('2026-10-26T23:59:00'),null,['SLA_0'],new Date('2026-10-27T10:00:00')),null);
    const next=await nextOperationalRun(a.org.id,'TASKS',now,new Date(now.getTime()+3600000),progress,Date.now()+10000);
    assert.equal(next.at.getTime(),due.getTime()+30*60000);
    await prisma.task.deleteMany({where:{id:{in:[sla.id,warning.id,unassigned.id]}}});
  });
  await check('approvals and reports execute only due work once',async()=>{
    const now=clock(); const task=await prisma.task.create({data:{organizationId:a.org.id,title:'Approval',status:'SUBMITTED',approvalWorkflow:{create:{steps:{create:{sequence:1,deadlineAt:now}}}}}});
    const report=await prisma.scheduledReport.create({data:{organizationId:a.org.id,name:'No external recipient',frequency:'WEEKLY',recipients:'',nextRunAt:now}});
    const unscheduled=await prisma.scheduledReport.create({data:{organizationId:a.org.id,name:'Schedule cleared',frequency:'WEEKLY',recipients:'',nextRunAt:null}});
    await prisma.scheduledJobState.create({data:{name:'retry:report:'+unscheduled.id,nextAttemptAt:new Date(now.getTime()-60000)}});
    const result=await operationalTick(now,{organizationId:a.org.id,phases:['APPROVALS','REPORTS']});assert.equal(result.escalations,1);assert.equal(result.reports,1);assert.deepEqual(result.failures,[]);
    const repeated=await operationalTick(now,{organizationId:a.org.id,phases:['APPROVALS','REPORTS']});assert.equal(repeated.escalations,0);assert.equal(repeated.reports,0);
    assert.equal(await prisma.activityLog.count({where:{entityId:report.id,action:'SCHEDULED_REPORT_EXECUTED'}}),1);
    const next=await nextOperationalRun(a.org.id,'REPORTS',now,new Date(now.getTime()+8*86400000),progress,Date.now()+10000);assert.equal(next.at.getTime(),now.getTime()+7*86400000);
    await prisma.task.delete({where:{id:task.id}});await prisma.scheduledReport.deleteMany({where:{id:{in:[report.id,unscheduled.id]}}});
    await prisma.scheduledJobState.deleteMany({where:{name:'retry:report:'+unscheduled.id}});
  });
  await check('dependency batches continue beyond 200 and honor future location access',async()=>{
    const now=clock(), startsAt=new Date(now.getTime()+60000);
    const user=await prisma.user.create({data:{name:'Future eligibility'}}); users.push(user.id);
    const member=await prisma.organizationMember.create({data:{organizationId:a.org.id,userId:user.id,role:'EMPLOYEE'}});
    const location=await prisma.location.create({data:{organizationId:a.org.id,name:'Future unit'}}),team=await prisma.team.create({data:{organizationId:a.org.id,name:'Future team'}});
    await prisma.memberLocationAccess.create({data:{memberId:member.id,locationId:location.id,startsAt}});
    await prisma.teamMember.create({data:{organizationMemberId:member.id,teamId:team.id}});
    const execution=await prisma.processExecution.create({data:{organizationId:a.org.id,processId:a.process.id,scheduledAt:now,availableAt:now,status:'IN_PROGRESS'}});
    const parent=await prisma.task.create({data:{organizationId:a.org.id,executionId:execution.id,title:'Done',status:'COMPLETED'}});
    const ids=Array.from({length:201},()=>randomUUID());
    await prisma.task.createMany({data:ids.map(id=>({id,organizationId:a.org.id,executionId:execution.id,title:'Blocked',status:'BLOCKED'}))});
    await prisma.taskDependency.createMany({data:ids.map(taskId=>({taskId,dependsOnId:parent.id,type:'BLOCKING'}))});
    const future=await prisma.task.create({data:{organizationId:a.org.id,executionId:execution.id,locationId:location.id,teamId:team.id,title:'Future access',status:'BLOCKED',assignments:{create:{memberId:member.id}},dependencies:{create:{dependsOnId:parent.id,type:'BLOCKING'}}}});
    const result=await operationalTick(now,{organizationId:a.org.id,phases:['DEPENDENCIES'],restartDependencies:true});assert.deepEqual(result.failures,[]);assert.equal(result.dependencyMore,false);
    assert.equal(await prisma.task.count({where:{id:{in:ids},status:'AVAILABLE'}}),201);
    assert.equal((await prisma.task.findUniqueOrThrow({where:{id:future.id}})).status,'BLOCKED');
    assert.equal((await nextOperationalRun(a.org.id,'DEPENDENCIES',now,new Date(now.getTime()+3600000),progress,Date.now()+10000)).at.getTime(),startsAt.getTime());
    await operationalTick(new Date(startsAt.getTime()+1),{organizationId:a.org.id,phases:['DEPENDENCIES']});
    assert.equal((await prisma.task.findUniqueOrThrow({where:{id:future.id}})).status,'AVAILABLE');
    await prisma.task.deleteMany({where:{executionId:execution.id}});await prisma.processExecution.delete({where:{id:execution.id}});
  });
  await check('routine catch-up preserves edit bounds, lead time and unique occurrences',async()=>{
    const now=clock(), old=new Date(now.getTime()-3600000), location=await prisma.location.findFirstOrThrow({where:{organizationId:a.org.id}}),team=await prisma.team.findFirstOrThrow({where:{organizationId:a.org.id}});
    const definition=processDefinitionSchema.parse({name:'Catch up',description:'',locationId:location.id,criticality:'MEDIUM',validFrom:'',validUntil:'',schedule:null,tasks:[processTaskSchema.parse({id:'one',title:'Task',instructions:'',teamId:team.id,primaryMemberId:'',required:true,evidenceType:'',dependsOn:[],dependencyType:'BLOCKING',dependencyLogic:'AND',approverIds:[],approvalMode:'SEQUENTIAL'})]});
    const template=await prisma.processTemplate.create({data:{organizationId:a.org.id,name:'Catch up',versions:{create:{version:1,definition}}},include:{versions:true}});
    const p=await prisma.process.create({data:{organizationId:a.org.id,name:'Catch up',locationId:location.id,sourceTemplateVersionId:template.versions[0].id,updatedAt:old}});
    const r=await prisma.routine.create({data:{processId:p.id,startsAt:old,updatedAt:old,recurrenceRule:'FREQ=MINUTELY;INTERVAL=5;BYSECOND=0',timezone:'UTC',generationLeadTime:0}});
    const recoverSince=new Date(now.getTime()-12*60000);
    const scheduled=routineScheduledAt({...r,process:p},undefined,now,true,recoverSince)!; assert.ok(scheduled<new Date(now.getTime()-60000));assert.ok(scheduled>recoverSince);
    const first=await operationalTick(now,{organizationId:a.org.id,phases:['ROUTINES'],recoverSince}); assert.equal(first.generated,1);assert.equal(first.routineMore,true);assert.deepEqual(first.failures,[]);
    const second=await operationalTick(now,{organizationId:a.org.id,phases:['ROUTINES'],recoverSince}); assert.equal(second.generated,1);
    assert.equal(await prisma.processExecution.count({where:{routineId:r.id}}),2);
    await prisma.organization.update({where:{id:a.org.id},data:{status:'SUSPENDED'}});
    const inactive=await generateRoutineExecution(r.id,{userId:'',userName:'Isolated scheduler',userEmail:null,memberId:'',role:'OWNER',organizationId:a.org.id,organizationName:a.org.name,organizationSlug:a.org.slug},now,true,recoverSince);
    assert.ok(inactive.error);assert.equal(await prisma.processExecution.count({where:{routineId:r.id}}),2);
    await prisma.organization.update({where:{id:a.org.id},data:{status:'ACTIVE'}});
    await prisma.task.deleteMany({where:{processId:p.id}});await prisma.processExecution.deleteMany({where:{processId:p.id}});await prisma.process.delete({where:{id:p.id}});await prisma.processTemplate.delete({where:{id:template.id}});
  });
  await check('partial budget does not advance completion; inactive organizations cannot be scheduled',async()=>{
    const now=clock();const next=await nextOperationalRun(a.org.id,'TASKS',now,new Date(now.getTime()+3600000),{...progress,incomplete:true},Date.now()-1);assert.equal(next.complete,false);
    await prisma.organization.update({where:{id:b.org.id},data:{status:'SUSPENDED'}});
    assert.equal((await dueOperationalPhases(clock())).some(r=>r.organizationId===b.org.id),false);assert.equal(await prisma.operationalSignal.count({where:{organizationId:b.org.id}}),0);
  });
  await check('dispatcher reconciles empty organizations then repeated calls become one read',async()=>{
    await clear(); await prisma.organization.update({where:{id:a.org.id},data:{name:'Wake all phases'}});
    await prisma.scheduledJobState.deleteMany({where:{name:'operational'}});
    for(let i=0;i<3;i++) {const result=await runSelectiveOperational(clock(),0);if(!result.skipped)assert.deepEqual(result.result.failures,[]);}
    const start=statements.length; assert.equal((await runSelectiveOperational(clock(),0)).reason,'NO_WORK');assert.equal(statements.length-start,1);
  });
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  for(const organizationId of orgs){await prisma.task.deleteMany({where:{organizationId}});await prisma.processExecution.deleteMany({where:{organizationId}});await prisma.organization.deleteMany({where:{id:organizationId}});}
  await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.scheduledJobState.deleteMany({where:{OR:[{name:'operational'},{name:{startsWith:'operational:blocked-cursor:'}}]}});
  writeFileSync('../selective-verification.json',JSON.stringify({finishedAt:new Date().toISOString(),passed:checks.length,checks,success:!process.exitCode,productionDatabaseContacted:false,externalTransports:false},null,2));
  await prisma.$disconnect();await (globalThis as any).pgPool?.end();
});
