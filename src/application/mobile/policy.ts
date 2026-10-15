type DeadlineTask={deadlineAt?:string|null;slaDueAt?:string|null;scheduledDate?:string|null;toleranceMinutes?:number|null;status:string;endedAt?:string|null;timezone?:string;isUnassigned?:boolean};
const instant=(v?:string|null)=>v==null?null:Number.isFinite(Date.parse(v))?Date.parse(v):null;
export function deadline(t:DeadlineTask,now:number) {
 const values=[instant(t.deadlineAt),instant(t.slaDueAt)].filter((v):v is number=>v!==null);
 const dueAt=values.length?Math.min(...values):null,limitAt=dueAt===null?null:dueAt+(t.toleranceMinutes??20)*60000,scheduled=instant(t.scheduledDate);
 const reference=['COMPLETED','CANCELLED','NOT_COMPLETED'].includes(t.status)?instant(t.endedAt)??now:now;
 return {dueAt,limitAt,scheduled:scheduled!==null&&scheduled>now,phase:scheduled!==null&&scheduled>now?'SCHEDULED':dueAt===null?'NONE':reference<=dueAt?'ON_TIME':reference<=limitAt!?'TOLERANCE':'EXCEEDED'};
}
export function dayKey(value:number,timezone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export function columnFor(t:DeadlineTask,now:number){
 if(t.status==='COMPLETED')return 'completed';
 const d=deadline(t,now);
 if(d.scheduled&&Date.parse(t.scheduledDate!)-now>=86400000)return 'upcoming';
 if(t.isUnassigned)return 'unassigned';
 if(!d.scheduled&&d.dueAt!==null&&now>d.dueAt)return 'overdue';
 if(!t.scheduledDate&&d.dueAt!==null&&dayKey(d.dueAt,t.timezone??'America/Sao_Paulo')>dayKey(now,t.timezone??'America/Sao_Paulo'))return 'upcoming';
 return 'today';
}
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
export function parseDestination(data:Record<string,unknown>|null) {
 if(!data||!id(data.organizationId))return null;
 if(data.taskId!=null&&!id(data.taskId)||data.executionId!=null&&!id(data.executionId)||data.notificationId!=null&&!id(data.notificationId))return null;
 return {organizationId:data.organizationId,...(id(data.taskId)?{taskId:data.taskId}:{}),...(id(data.executionId)?{executionId:data.executionId}:{}),...(id(data.notificationId)?{notificationId:data.notificationId}:{})};
}
export function retryDelay(attempt:number,random:()=>number=Math.random){return Math.min(3600000,1000*2**Math.min(attempt,12))*(0.75+random()*0.5);}
