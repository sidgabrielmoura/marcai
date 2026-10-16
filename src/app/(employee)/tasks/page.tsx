import {getAuthenticatedContext} from '@/application/security/auth-context';
import {listTasks} from '@/application/mobile/data';
import {EmployeeShell} from '@/presentation/components/mobile/employee-shell';
import {PageHeader} from '@/presentation/components/shared';
import {EmployeeKanbanBoard,type EmployeeTask,type ColumnId} from '@/presentation/components/mobile/employee-kanban-board';
export default async function EmployeeTasksPage({searchParams}:{searchParams:Promise<{tab?:string}>}){
 const c=await getAuthenticatedContext();if(!c)return null;
 const params=await searchParams,now=new Date();
 const items=new Map<string,Awaited<ReturnType<typeof listTasks>>['items'][number]>();let cursor:string|null=null;
 do{const page=await listTasks(c,cursor,'','all',now);for(const t of page.items)items.set(t.id,t);cursor=page.nextCursor;}while(cursor);
 const tasks:EmployeeTask[]=[...items.values()].map(t=>({...t,column:t.column as ColumnId,completedAt:t.status==='COMPLETED'?t.endedAt:null,evidenceCount:t.requirements.length,hasRequiredEvidence:t.requirements.some(r=>r.required),hasImpediment:t.occurrences.length>0,slaExceeded:!!t.slaDueAt&&Date.parse(t.slaDueAt)<now.getTime(),delayMinutes:t.slaDueAt?Math.max(0,Math.floor((now.getTime()-Date.parse(t.slaDueAt))/60000)):0}));
 const columns=['today','overdue','unassigned','completed','upcoming'];
 const initialColumn:ColumnId=columns.includes(params.tab??'')?params.tab as ColumnId:tasks.some(t=>t.column==='today')?'today':tasks.some(t=>t.column==='overdue')?'overdue':tasks.some(t=>t.isUnassigned)?'unassigned':'today';
 return <EmployeeShell userName={c.userName} orgName={c.organizationName} role={c.role}><div className="page-stack"><PageHeader title="Minhas tarefas" subtitle="Acompanhe suas atividades no turno e assuma novas tarefas da equipe."/><EmployeeKanbanBoard tasks={tasks} initialColumn={initialColumn} snapshotAt={now.getTime()}/></div></EmployeeShell>;
}
