import {readOverviewBoard} from '@/presentation/actions/live-board-actions';
import {LiveOverviewBoard} from '@/presentation/components/realtime/live-boards';
import {ManagementShell} from '@/presentation/components/mobile/management-shell';
export default async function ManagementOverviewPage(){
 const data=await readOverviewBoard();if(!data)return null;
 return <ManagementShell userName={data.userName} orgName={data.orgName} role={data.role} initialSubscriptionNotice={data.subscriptionNotice}><LiveOverviewBoard initial={data}/></ManagementShell>;
}
