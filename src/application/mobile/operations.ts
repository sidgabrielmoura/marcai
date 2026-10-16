import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { getAuthenticatedContext } from '@/application/security/auth-context';
import { eligibleMember,taskScope } from '@/application/security/operational-scope';
import { lockTask } from '@/application/tasks/task-lock';
import { synchronizeExecution } from '@/application/tasks/synchronize-execution';
import { notifyManagers } from '@/application/tasks/notify-managers';
import { canReportImpediment } from '@/domain/rules/task-rules';
import { z } from 'zod';
import { fail } from './http';
import { idempotent } from './idempotency';
import { includeTask,dependencies,operationGuard } from './data';
export async function operate(req:Request|null,taskId:string,action:string,input:unknown) {
 const c=(await getAuthenticatedContext(false))!;
 return idempotent(req,c,{taskId,action,input},async tx=>{
 await lockTask(tx,c.organizationId,taskId);
 const task=await tx.task.findFirst({where:{id:taskId,organizationId:c.organizationId,deletedAt:null},include:includeTask});
 if(!task)fail(404,'TASK_UNAVAILABLE','Tarefa indisponível.');
 const now=new Date(),assigned=task.assignments.some(a=>a.memberId===c.memberId);
 if(!await eligibleMember(c.organizationId,c.memberId,task.locationId,task.teamId,tx,now))fail(403,'ACCESS_CHANGED','Seu acesso à equipe ou unidade mudou.');
 if(action==='claim'){
 if(!task.teamId||task.assignments.some(a=>a.type==='PRIMARY'))fail(409,'ALREADY_CLAIMED','Outra pessoa já assumiu esta tarefa. Atualize o quadro.');
 const guard=operationGuard(task,now,true);if(!guard.allowed)fail(409,guard.code!,guard.reason!);
 await tx.taskAssignment.create({data:{taskId,memberId:c.memberId,type:'PRIMARY',assignedBy:c.memberId}});
 await tx.task.update({where:{id:taskId},data:{status:'IN_PROGRESS',startedAt:task.startedAt??now,slaDueAt:task.slaDueAt??(task.slaDurationMinutes?new Date(now.getTime()+task.slaDurationMinutes*60000):null)}});
 await tx.taskExecutionSession.create({data:{taskId,memberId:c.memberId,startedAt:now}});
 await notifyManagers(tx,task,'Tarefa assumida',task.title,{type:'TASK_CLAIMED',priority:'LOW',excludeUserId:c.userId});
 }else{
 if(!assigned)fail(403,'NOT_ASSIGNED','Esta tarefa não está atribuída a você.');
 if(action==='resume'){
 fail(409,'RESUME_UNAVAILABLE','Tarefas não podem ser pausadas.');
 }else if(action==='impediment'){
 const b=z.object({category:z.enum(['MATERIAL_FALTANTE','EQUIPAMENTO_QUEBRADO','ACESSO_BLOQUEADO','OUTROS']),reason:z.string().trim().min(3).max(1000)}).strict().parse(input);
 const check=canReportImpediment(task.status);if(!check.allowed||task.status==='SUBMITTED')fail(409,'TASK_STATE',check.reason??'Aguardando revisão.');
 await tx.taskExecutionSession.updateMany({where:{taskId,endedAt:null},data:{endedAt:now}});
 await tx.taskPause.updateMany({where:{session:{taskId},endedAt:null},data:{endedAt:now}});
 await tx.taskOccurrence.create({data:{taskId,type:'IMPEDIMENT',category:b.category,reason:b.reason,severity:'HIGH',createdBy:c.memberId}});
 await tx.task.update({where:{id:taskId},data:{status:'NOT_COMPLETED'}});
 await notifyManagers(tx,task,'Impedimento operacional',task.title+': '+b.reason,{type:'OPERATIONAL_ALERT',priority:'HIGH'});
 }else fail(404,'ACTION_UNKNOWN','Ação indisponível.');
 }
 await tx.activityLog.create({data:{organizationId:c.organizationId,actorId:c.memberId,entityType:'TASK',entityId:taskId,action:action==='claim'?'TASK_CLAIMED':'TASK_IMPEDIMENT_REPORTED'}});
 await synchronizeExecution(tx,c.organizationId,task.executionId);
 return {success:true};
 });
}
