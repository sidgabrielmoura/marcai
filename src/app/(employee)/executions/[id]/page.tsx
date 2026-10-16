import {getAuthenticatedContext} from '@/application/security/auth-context';
import {execution} from '@/application/mobile/data';
import {notFound} from 'next/navigation';
import {EmployeeShell} from '@/presentation/components/mobile/employee-shell';
import {ExecutionPageClient} from '@/presentation/components/mobile/execution-page-client';
export default async function ExecutionPage({params}:{params:Promise<{id:string}>}){const c=await getAuthenticatedContext();if(!c)return null;const {id}=await params;try{await execution(c,id);}catch{notFound();}return <EmployeeShell userName={c.userName} orgName={c.organizationName} role={c.role}><ExecutionPageClient id={id}/></EmployeeShell>;}
