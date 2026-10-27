import {readManagementBoard} from '@/presentation/actions/live-board-actions';
import {LiveManagementBoard} from '@/presentation/components/realtime/live-boards';
import {ManagementShell} from '@/presentation/components/mobile/management-shell';
export default async function ManagementTasksPage(){
 const data=await readManagementBoard();if(!data)return null;
 return <ManagementShell userName={data.userName} orgName={data.orgName} role={data.role}><LiveManagementBoard initial={data}/></ManagementShell>;
}
