"use client";
import {useRouter} from 'next/navigation';
import {EmployeeProcessDetailDrawer} from './process-detail-drawer';
export function ExecutionPageClient({id}:{id:string}){const router=useRouter();return <EmployeeProcessDetailDrawer executionId={id} open onOpenChange={open=>{if(!open)router.push('/tasks');}}/>;}
