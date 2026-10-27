import {readEmployeeBoard} from '@/presentation/actions/live-board-actions';
import {LiveEmployeeBoard} from '@/presentation/components/realtime/live-boards';
import {EmployeeShell} from '@/presentation/components/mobile/employee-shell';
import {PageHeader} from '@/presentation/components/shared';
export default async function EmployeeTasksPage({searchParams}:{searchParams:Promise<{tab?:string}>}){
 const data=await readEmployeeBoard();if(!data)return null;
 const {tab}=await searchParams;
 return <EmployeeShell userName={data.userName} orgName={data.orgName} role={data.role}><div className="page-stack"><PageHeader title="Minhas tarefas" subtitle="Acompanhe suas atividades no turno e assuma novas tarefas da equipe."/><LiveEmployeeBoard initial={data} tab={tab}/></div></EmployeeShell>;
}
