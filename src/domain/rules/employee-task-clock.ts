export type ClockTask={status:string;deadlineAt:string|null;slaDueAt:string|null;startedAt:string|null;toleranceMinutes?:number|null;elapsedSeconds:number|null;timerRunning:boolean;scheduledDate?:string|null};
export function taskClock(task:ClockTask,now:number,snapshotAt:number){
 const scheduled=!!task.scheduledDate&&Date.parse(task.scheduledDate)>now;
 if(scheduled)return {elapsed:null,toleranceExceeded:false,remaining:null,deadlineLabel:'Horário agendado',isScheduled:true};
 const terminal=['COMPLETED','CANCELLED','NOT_COMPLETED','SUBMITTED'].includes(task.status),blocked=task.status==='BLOCKED';
 const deadlines=[task.deadlineAt,task.slaDueAt].filter((v):v is string=>!!v).map(Date.parse).filter(Number.isFinite);
 const dueAt=terminal||blocked||!deadlines.length?null:Math.min(...deadlines);
 const limit=dueAt===null?null:dueAt+(task.toleranceMinutes??20)*60000;
 const toleranceExceeded=limit!==null&&now>limit;
 const running=task.timerRunning&&!terminal&&!blocked;
 const elapsed=!task.startedAt||blocked?null:task.elapsedSeconds===null?null:Math.max(0,task.elapsedSeconds+(running?Math.floor(Math.max(0,Math.min(now,limit??Infinity)-snapshotAt)/1000):0));
 return {elapsed,toleranceExceeded,remaining:dueAt===null?null:Math.ceil((dueAt-now)/1000),deadlineLabel:dueAt!==null&&dueAt===Date.parse(task.slaDueAt??'')?'Limite de SLA':'Prazo final',isScheduled:false};
}
export function formatClock(seconds:number){const total=Math.floor(Math.abs(seconds)),days=Math.floor(total/86400),hours=Math.floor(total/3600)%24,minutes=Math.floor(total/60)%60,rest=total%60;return (days?days+'d ':'')+[hours,minutes,rest].map(v=>String(v).padStart(2,'0')).join(':');}
