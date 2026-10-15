import { canStartTask } from "@/domain/rules/task-rules";
import { evaluateEarlyExecution, type EarlyExecutionPolicy } from "@/domain/rules/early-execution";
import type { Prisma } from '@prisma/client';
import { prisma } from '@/infrastructure/database/prisma';
import type { AuthenticatedContext } from '@/application/security/auth-context';
import { taskScope } from '@/application/security/operational-scope';
import { evaluateTaskDependencies } from '@/domain/rules/dependency-rules';
import { effectiveWorkSeconds } from '@/domain/rules/execution-state';
import { getEvidenceRound,evidenceInRound } from '@/application/tasks/evidence-round';
import { fail } from './http';
import { columnFor,deadline,dayKey } from './policy';
export const includeTask={
 organization:{select:{settings:true}},location:true,process:{select:{name:true}},execution:{select:{id:true,status:true,availableAt:true,process:{select:{name:true}}}},
 assignments:{where:{removedAt:null},select:{memberId:true,type:true,member:{select:{organizationId:true,user:{select:{name:true}}}}}},
 approvalWorkflow:{include:{steps:{include:{decisions:{select:{id:true,decision:true,note:true,createdAt:true}}}}}},
 sessions:{include:{pauses:true}},
 evidenceRequirements:{include:{submissions:{orderBy:{createdAt:'asc' as const}}}},
 dependencies:{include:{dependsOnTask:{include:{approvalWorkflow:true}}}},
 occurrences:{where:{type:{not:'PAUSE_ALERT'}},orderBy:{createdAt:'desc' as const},take:50}
} as const;
export type LoadedTask=Prisma.TaskGetPayload<{include:typeof includeTask}>;
export function readable(c:AuthenticatedContext):Prisma.TaskWhereInput {
 return {organizationId:c.organizationId,deletedAt:null,OR:[taskScope(c),{
 status:{notIn:['COMPLETED','CANCELLED','NOT_COMPLETED']},teamId:{in:c.scope?.teamIds??[]},
 OR:[{locationId:null},{locationId:{in:c.scope?.locationIds??[]}}],
 assignments:{none:{type:'PRIMARY',removedAt:null}}
 }]};
}
export function dependencies(task:LoadedTask) {
 return evaluateTaskDependencies(task.dependencies.map(d=>({dependsOnTaskId:d.dependsOnId,dependsOnStatus:d.dependsOnTask.status,dependsOnApprovalStatus:d.dependsOnTask.approvalWorkflow?.status,type:d.type,logic:d.logic})));
}
const permit=(code:string|null=null,reason:string|null=null)=>({allowed:!code,code,reason});
export function operationGuard(task:LoadedTask,now:Date,assigned:boolean) {
 const d=deadline({...task,deadlineAt:task.deadlineAt?.toISOString(),slaDueAt:task.slaDueAt?.toISOString(),scheduledDate:task.scheduledDate?.toISOString()},now.getTime());
 if(!assigned)return permit('NOT_ASSIGNED','Assuma a tarefa antes de registrar a entrega.');
 if(task.status==='BLOCKED')return permit('DEPENDENCY','Aguarde a liberação das etapas anteriores.');
 if(!['AVAILABLE','IN_PROGRESS','PAUSED','NEEDS_CORRECTION'].includes(task.status))return permit('TASK_STATE',task.status==='SUBMITTED'?'Aguardando aprovação.':'Esta tarefa está encerrada ou indisponível.');
 if(dependencies(task).isBlocked)return permit('DEPENDENCY','Aguarde a conclusão das etapas anteriores.');
 if(d.scheduled)return permit('SCHEDULED','Aguarde o horário agendado.');
 if(d.phase==='EXCEEDED')return permit('TOLERANCE_EXCEEDED','A tolerância terminou. Aguarde atuação da gestão.');
 return permit();
}
export async function project(task:LoadedTask,c:AuthenticatedContext,detail=false,now=new Date()) {
 const round=await getEvidenceRound(prisma,c.organizationId,task.id);
 const assigned=task.assignments.some(a=>a.memberId===c.memberId);
 const unassigned=!task.assignments.some(a=>a.type==='PRIMARY');
 const pausedAt=task.status==='PAUSED'?task.sessions.flatMap(s=>s.pauses.filter(p=>!p.endedAt).map(p=>p.startedAt)).sort((a,b)=>b.getTime()-a.getTime())[0]??task.updatedAt:null;
 const ended=task.completedAt??task.cancelledAt??(['NOT_COMPLETED','SUBMITTED'].includes(task.status)?task.updatedAt:pausedAt);
 const terminal=['COMPLETED','CANCELLED','NOT_COMPLETED','SUBMITTED'].includes(task.status);
 const due=[task.deadlineAt?.getTime(),task.slaDueAt?.getTime()].filter((v):v is number=>v!==undefined);
 const limit=due.length?Math.min(...due)+(task.toleranceMinutes??20)*60000:null;
 const future=!!task.scheduledDate&&task.scheduledDate>now;
 const start=task.startedAt?Math.max(task.startedAt.getTime(),task.scheduledDate?.getTime()??0):null;
 const elapsed=start===null||future||task.status==='BLOCKED'?null:Math.max(0,Math.floor((Math.min(ended?.getTime()??now.getTime(),limit??Infinity)-start)/1000));
 const guard=operationGuard(task,now,assigned);
 const settings=task.organization.settings as {earlyExecutionPolicy?:EarlyExecutionPolicy;earlyExecutionWindowMinutes?:number}|null;
 const early=evaluateEarlyExecution({policy:settings?.earlyExecutionPolicy??"NOT_ALLOWED",scheduledOrAvailableAt:task.execution?.availableAt??task.scheduledDate??new Date(0),currentTime:now,windowMinutes:settings?.earlyExecutionWindowMinutes??60});
 const startCheck=canStartTask(task.status,dependencies(task).isBlocked);
 const dep=dependencies(task);
 const claim=unassigned&&!dep.isBlocked&&task.status!=='BLOCKED'&&!future&&!terminal;
 const requirements=task.evidenceRequirements.map(r=>{
 const current=evidenceInRound(r.submissions,round),validCount=current.filter(s=>s.validationStatus==='VALID').length,rejectedCount=current.filter(s=>s.validationStatus==='REJECTED').length;
 return {id:r.id,type:r.type,required:r.required,minQuantity:r.minQuantity,maxQuantity:r.maxQuantity,stage:r.executionStage,validCount,rejectedCount,waived:rejectedCount>=3&&validCount<r.minQuantity,
 submissions:detail?r.submissions.map(s=>({id:s.id,value:s.storageKey?null:s.value,hasFile:!!s.storageKey,validationStatus:s.validationStatus,rejectionReason:s.rejectionReason,createdAt:s.createdAt.toISOString(),roundId:s.createdAt>=(round?.createdAt??new Date(0))?round?.id??'initial':'previous'})):[]};
 });
 const correctionLog=detail&&round?await prisma.activityLog.findFirst({where:{id:round.id,organizationId:c.organizationId,entityType:'TASK',entityId:task.id},select:{metadata:true}}):null;
 const correctionMeta=correctionLog?.metadata as {note?:unknown;reason?:unknown}|null;
 const correctionNote=correctionMeta?.note??correctionMeta?.reason;
 const taskDto={id:task.id,snapshotAt:now.toISOString(),version:task.updatedAt.toISOString(),organizationId:task.organizationId,executionId:task.executionId,origin:task.origin,title:task.title,
 description:detail?task.description:null,instructions:detail?task.instructions:null,status:task.status,taskType:task.taskType,priority:task.priority,required:task.required,
 processName:task.process?.name??task.execution?.process.name??null,locationName:task.location?.name??null,timezone:task.location?.timezone??'America/Sao_Paulo',
 deadlineAt:task.deadlineAt?.toISOString()??null,slaDueAt:task.slaDueAt?.toISOString()??null,scheduledDate:task.scheduledDate?.toISOString()??null,toleranceMinutes:task.toleranceMinutes??20,
 startedAt:task.startedAt?.toISOString()??null,endedAt:ended?.toISOString()??null,elapsedSeconds:elapsed,workSeconds:effectiveWorkSeconds(task.sessions,ended??now),
 timerRunning:!future&&!terminal&&task.status!=='PAUSED'&&task.status!=='BLOCKED'&&!!start&&(limit===null||now.getTime()<=limit),isUnassigned:unassigned,requiresApproval:!!task.approvalWorkflow,assignmentType:task.assignments.find(a=>a.memberId===c.memberId)?.type??null,assignedNames:task.assignments.filter(a=>a.member.organizationId===c.organizationId).map(a=>a.member.user.name),
 roundId:round?.id??'initial',formFields:detail?task.formFields??[]:[],formAnswers:detail?task.formAnswers??{}:{},requirements,
 actions:{start:{...(assigned&&startCheck.allowed&&(early.allowed||early.requireJustification)&&requirements.filter(r=>r.required&&r.stage==="START").every(r=>r.validCount>=r.minQuantity||r.waived)?permit():permit("START_UNAVAILABLE",startCheck.reason??early.reason??"Registre as evidências de início.")),requiresJustification:!!early.requireJustification},claim:claim?permit():permit('CLAIM_UNAVAILABLE',future?'Aguarde o horário agendado.':'Esta tarefa não está disponível para assumir.'),complete:guard,evidence:guard,
 resume:assigned&&task.status==='PAUSED'?permit():permit('RESUME_UNAVAILABLE','Retomar é exclusivo de tarefas pausadas antigas.'),
 impediment:assigned&&!['COMPLETED','CANCELLED','NOT_COMPLETED','SUBMITTED'].includes(task.status)?permit():permit('IMPEDIMENT_UNAVAILABLE','Esta tarefa não pode ser encerrada com impedimento.')},
 dependencies:detail?await Promise.all(task.dependencies.map(async d=>{
 const visible=await prisma.task.findFirst({where:{...readable(c),id:d.dependsOnId},select:{id:true}});
 return {id:d.id,type:d.type,logic:d.logic,satisfied:d.type==='INFORMATIVE'||d.dependsOnTask.status==='COMPLETED'&&(d.type!=='APPROVAL_CONDITION'||d.dependsOnTask.approvalWorkflow?.status==='APPROVED'),title:visible?d.dependsOnTask.title:'Etapa anterior fora do seu acesso'};
 })):[],
 occurrences:detail?task.occurrences.map(o=>({id:o.id,reason:o.reason,category:o.category,createdAt:o.createdAt.toISOString()})):[],
 correctionReason:typeof correctionNote==='string'?correctionNote.slice(0,1000):null,
 approvalHistory:detail?(task.approvalWorkflow?.steps??[]).flatMap(step=>step.decisions.map(d=>({id:d.id,sequence:step.sequence,decision:d.decision,note:d.note,createdAt:d.createdAt.toISOString()}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[],
 timeline:detail?await prisma.activityLog.findMany({where:{organizationId:c.organizationId,entityType:'TASK',entityId:task.id,action:{in:['TASK_STARTED','TASK_CLAIMED','TASK_COMPLETED','TASK_SUBMITTED','TASK_CORRECTION_REQUESTED','APPROVAL_REJECTED','TASK_CANCELLED','TASK_IMPEDIMENT_REPORTED','EVIDENCE_SUBMITTED','EVIDENCE_VALIDATION_FAILED']}},select:{id:true,action:true,createdAt:true},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100}):[]};
 return {...taskDto,column:columnFor(taskDto,now.getTime())};
}
export async function taskDetail(c:AuthenticatedContext,id:string) {
 const t=await prisma.task.findFirst({where:{...readable(c),id},include:includeTask});
 if(!t)fail(404,'TASK_UNAVAILABLE','Tarefa removida, transferida ou fora do seu acesso.');
 return project(t,c,true);
}
export async function listTasks(c:AuthenticatedContext,cursor:string|null,search="",type="all") {
 const now=new Date();
 const cohort:Prisma.TaskWhereInput={AND:[readable(c),{OR:[{status:{notIn:["COMPLETED","CANCELLED","NOT_COMPLETED"]}},{status:"COMPLETED",completedAt:{gte:new Date(now.getTime()-27*3600000)}}]},...(type!=="all"?[{taskType:type==="form"?"FORM":"STANDARD"}]:[]),...(search?[{OR:[{title:{contains:search,mode:"insensitive" as const}},{location:{name:{contains:search,mode:"insensitive" as const}}},{process:{name:{contains:search,mode:"insensitive" as const}}},{execution:{process:{name:{contains:search,mode:"insensitive" as const}}}}]}]:[])]};
 const rows=await prisma.task.findMany({where:{...cohort,...(cursor?{AND:[...(cohort.AND as Prisma.TaskWhereInput[]),cursorWhere(cursor)]}:{})},include:includeTask,orderBy:[{priority:"desc"},{deadlineAt:"asc"},{id:"asc"}],take:101});
 const page=rows.slice(0,100);
 const projected=await Promise.all(page.filter(t=>t.status!=='COMPLETED'||!!t.completedAt&&dayKey(t.completedAt.getTime(),t.location?.timezone??'America/Sao_Paulo')===dayKey(now.getTime(),t.location?.timezone??'America/Sao_Paulo')).map(t=>project(t,c,false,now)));
 const board=await boardCounts(c,cohort,now);
 return {items:projected.map(t=>t.origin==="PROCESS"&&t.executionId?{...t,column:board.columns["execution:"+t.executionId]??t.column}:t),counts:board.counts,nextCursor:rows.length>100?encodeCursor(page.at(-1)!):null};
}
export async function history(c:AuthenticatedContext,period:number,status:string,cursor:string|null) {
 const rows=await prisma.task.findMany({where:{...taskScope(c),deletedAt:null,status:status==='ALL'?{in:['COMPLETED','CANCELLED','NOT_COMPLETED']}:status as 'COMPLETED',updatedAt:{gte:new Date(Date.now()-period*86400000)},...(cursor?{AND:[historyCursor(cursor)]}:{})},include:includeTask,orderBy:[{updatedAt:"desc"},{id:"desc"}],take:21});
 return {items:await Promise.all(rows.slice(0,20).map(t=>project(t,c))),nextCursor:rows.length>20?Buffer.from(JSON.stringify({date:rows[19]!.updatedAt.toISOString(),id:rows[19]!.id})).toString("base64url"):null};
}
export async function execution(c:AuthenticatedContext,id:string) {
 const e=await prisma.processExecution.findFirst({where:{id,organizationId:c.organizationId,tasks:{some:readable(c)}},include:{process:{select:{name:true}},tasks:{where:{deletedAt:null},select:{id:true,required:true,status:true,approvalWorkflow:{select:{status:true}}}}}});
 if(!e)fail(404,'EXECUTION_UNAVAILABLE','Execução indisponível no seu acesso.');
 const visible=await prisma.task.findMany({where:{...readable(c),executionId:id},include:includeTask,orderBy:[{definitionOrder:'asc'},{id:'asc'}]});
 const required=e.tasks.filter(t=>t.required),done=(t:typeof required[number])=>t.status==='COMPLETED'&&(!t.approvalWorkflow||t.approvalWorkflow.status==='APPROVED');
 return {id:e.id,name:e.process.name,status:e.status,requiredTotal:required.length,requiredCompleted:required.filter(done).length,personalTotal:visible.length,personalCompleted:visible.filter(done).length,hasHiddenSteps:visible.length<e.tasks.length,visibleTasks:await Promise.all(visible.map(t=>project(t,c,true)))};
}

async function boardCounts(c:AuthenticatedContext,where:Prisma.TaskWhereInput,now:Date){
 const rows=await prisma.task.findMany({where,select:{id:true,origin:true,executionId:true,status:true,deadlineAt:true,slaDueAt:true,toleranceMinutes:true,scheduledDate:true,completedAt:true,location:{select:{timezone:true}},assignments:{where:{removedAt:null},select:{type:true}}},orderBy:{id:"asc"}});
 const groups=new Map<string,string[]>();
 for(const t of rows){const timezone=t.location?.timezone??"America/Sao_Paulo";if(t.status==="COMPLETED"&&(!t.completedAt||dayKey(t.completedAt.getTime(),timezone)!==dayKey(now.getTime(),timezone)))continue;const column=columnFor({status:t.status,deadlineAt:t.deadlineAt?.toISOString(),slaDueAt:t.slaDueAt?.toISOString(),scheduledDate:t.scheduledDate?.toISOString(),toleranceMinutes:t.toleranceMinutes,isUnassigned:!t.assignments.some(a=>a.type==="PRIMARY"),timezone},now.getTime());const key=t.origin==="PROCESS"&&t.executionId?"execution:"+t.executionId:"task:"+t.id;groups.set(key,[...(groups.get(key)??[]),column]);}
 const counts:Record<string,number>={today:0,overdue:0,unassigned:0,completed:0,upcoming:0},columns:Record<string,string>={};for(const [key,cols] of groups.entries()){const active=cols.filter(c=>c!=="completed");const chosen=active.includes("today")?"today":active.includes("overdue")?"overdue":active[0]??cols[0]!;counts[chosen]++;columns[key]=chosen;}return {counts,columns};
}
export async function searchTasks(c:AuthenticatedContext,term:string){const rows=await prisma.task.findMany({where:{AND:[readable(c),{OR:[{title:{contains:term,mode:"insensitive" as const}},{location:{name:{contains:term,mode:"insensitive" as const}}},{process:{name:{contains:term,mode:"insensitive" as const}}}]}]},include:includeTask,orderBy:[{updatedAt:"desc"},{id:"desc"}],take:20});return Promise.all(rows.map(t=>project(t,c)));}

function encodeCursor(t:{id:string;priority:string;deadlineAt:Date|null}){return Buffer.from(JSON.stringify({id:t.id,priority:t.priority,date:t.deadlineAt?.toISOString()??null})).toString("base64url");}
function cursorWhere(cursor:string):Prisma.TaskWhereInput{let parsed:{id:string;priority:"LOW"|"MEDIUM"|"HIGH"|"CRITICAL";date:string|null};try{parsed=JSON.parse(Buffer.from(cursor,"base64url").toString("utf8"));if(!["LOW","MEDIUM","HIGH","CRITICAL"].includes(parsed.priority)||!/^[a-zA-Z0-9_-]{1,128}$/.test(parsed.id)||parsed.date!==null&&!Number.isFinite(Date.parse(parsed.date)))throw new Error();}catch{fail(400,"CURSOR_INVALID","Atualize a lista para continuar.");}return {OR:[{priority:{in:(["LOW","MEDIUM","HIGH","CRITICAL"] as Array<"LOW"|"MEDIUM"|"HIGH"|"CRITICAL">).slice(0,["LOW","MEDIUM","HIGH","CRITICAL"].indexOf(parsed.priority))}},...(parsed.date?[{priority:parsed.priority,deadlineAt:{gt:new Date(parsed.date)}},{priority:parsed.priority,deadlineAt:null},{priority:parsed.priority,deadlineAt:new Date(parsed.date),id:{gt:parsed.id}}]:[{priority:parsed.priority,deadlineAt:null,id:{gt:parsed.id}}])]};}

function historyCursor(cursor:string):Prisma.TaskWhereInput{let c:{date:string;id:string};try{c=JSON.parse(Buffer.from(cursor,"base64url").toString());if(!Number.isFinite(Date.parse(c.date))||!/^[a-zA-Z0-9_-]{1,128}$/.test(c.id))throw new Error();}catch{fail(400,"CURSOR_INVALID","Atualize o histórico.");}return {OR:[{updatedAt:{lt:new Date(c.date)}},{updatedAt:new Date(c.date),id:{lt:c.id}}]};}
