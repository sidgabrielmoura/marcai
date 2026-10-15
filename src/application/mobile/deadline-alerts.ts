import {getEvidenceRound} from "@/application/tasks/evidence-round";
import {prisma} from '@/infrastructure/database/prisma';
import {lockTask} from '@/application/tasks/task-lock';
import {notifyTaskAssignees,notifyManagers} from '@/application/tasks/notify-managers';
export async function deadlineAlerts(budgetMs=12000){
 const deadlineAt=Date.now()+budgetMs;
 const [saved]=await prisma.$queryRaw<Array<{cursor:string}>>`SELECT cursor FROM mobile_job_cursors WHERE job='deadlines'`;
 const now=new Date();
 let cursor=saved?.cursor??"";
 let generated=0;
 while(Date.now()<deadlineAt){
 const tasks=await prisma.task.findMany({where:{id:{gt:cursor},deletedAt:null,organization:{status:'ACTIVE'},status:{in:['AVAILABLE','IN_PROGRESS','PAUSED','NEEDS_CORRECTION']},OR:[{deadlineAt:{lte:new Date(now.getTime()+30*60000)}},{slaDueAt:{lte:new Date(now.getTime()+30*60000)}}]},select:{id:true,organizationId:true},orderBy:{id:'asc'},take:200});
 if(!tasks.length){cursor="";break;}
 for(const row of tasks){if(Date.now()>=deadlineAt)break;await prisma.$transaction(async tx=>{
 await lockTask(tx,row.organizationId,row.id);
 const t=await tx.task.findUnique({where:{id:row.id},include:{assignments:{where:{removedAt:null}},evidenceRequirements:true,organization:{select:{settings:true}}}});
 if(!t||t.deletedAt||!['AVAILABLE','IN_PROGRESS','PAUSED','NEEDS_CORRECTION'].includes(t.status)||t.scheduledDate&&t.scheduledDate>now)return;
 const due=[t.deadlineAt?.getTime(),t.slaDueAt?.getTime()].filter((v):v is number=>v!==undefined);if(!due.length)return;
 const at=Math.min(...due),limit=at+(t.toleranceMinutes??20)*60000;
 const round=await getEvidenceRound(tx,t.organizationId,t.id);
 const cycle=JSON.stringify({roundId:round?.id??"initial",deadline:t.deadlineAt,sla:t.slaDueAt,tolerance:t.toleranceMinutes,assignees:t.assignments.map(a=>a.memberId+':'+a.assignedAt.toISOString()).sort()});
 const elapsed=Math.floor((now.getTime()-at)/60000);
 const settings=t.organization.settings as {delayMilestones?:number[]}|null;
 const milestones=[0,...(settings?.delayMilestones??[15,30,60,120])].filter(m=>Number.isFinite(m)&&m>=0).sort((a,b)=>a-b);
 const milestone=now.getTime()>limit?'tolerance':elapsed>=0?String(milestones.filter(m=>m<=elapsed).at(-1)):t.slaDueAt&&t.slaDueAt.getTime()-now.getTime()<=30*60000?'warning':null;
 if(milestone===null)return;
 const inserted=await tx.$executeRaw`INSERT INTO mobile_alert_cycles(task_id,cycle,milestone) VALUES(${t.id},${cycle},${milestone}) ON CONFLICT DO NOTHING`;
 if(!inserted)return;
 const type=milestone==='warning'?'TASK_EXPIRING_SOON':milestone==='tolerance'?'TASK_TOLERANCE_EXCEEDED':'TASK_OVERDUE';
 const title=milestone==='warning'?'Prazo se aproximando':milestone==='tolerance'?'Tolerância encerrada':'Tarefa atrasada';
 await notifyTaskAssignees(tx,t,title,'Confira a tarefa e as orientações da gestão.',{type,priority:'HIGH',data:{taskId:t.id,cycle,milestone}});
 if(milestone!=='warning')await notifyManagers(tx,t,title,'Uma tarefa precisa de acompanhamento.',{type,priority:'HIGH',data:{taskId:t.id,cycle,milestone}});
 await tx.activityLog.create({data:{organizationId:t.organizationId,entityType:'TASK',entityId:t.id,action:type,metadata:{cycle,milestone}}});generated++;
 });cursor=row.id;}
 }
 await prisma.$executeRaw`INSERT INTO mobile_job_cursors(job,cursor) VALUES('deadlines',${cursor}) ON CONFLICT(job) DO UPDATE SET cursor=excluded.cursor,touched_at=now()`;
 return {generated,cursor};
}
