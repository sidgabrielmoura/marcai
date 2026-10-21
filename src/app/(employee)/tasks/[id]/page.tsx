import {webTaskDetail} from '@/application/mobile/web-task-contract';
import {getAuthenticatedContext} from '@/application/security/auth-context';
import {EmployeeShell} from '@/presentation/components/mobile/employee-shell';
import {TaskDetailClient} from '@/presentation/components/mobile/task-detail-client';
import {TaskViewTracker} from '@/presentation/components/mobile/task-view-tracker';
import {notFound} from 'next/navigation';
export default async function TaskDetailPage({params}:{params:Promise<{id:string}>}){
 const c=await getAuthenticatedContext();if(!c)return null;
 const {id}=await params;
 let task;try{task=await webTaskDetail(c,id);}catch{notFound();}
 return <EmployeeShell userName={c.userName} orgName={c.organizationName} role={c.role}><TaskViewTracker taskId={task.id}/><TaskDetailClient key={task.id+":"+task.roundId} task={{...task,deadlineAt:task.deadlineAt?new Date(task.deadlineAt):null,slaDueAt:task.slaDueAt?new Date(task.slaDueAt):null,scheduledDate:task.scheduledDate?new Date(task.scheduledDate):null}}/></EmployeeShell>;
}
