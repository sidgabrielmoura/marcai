"use client";
import {useEffect,useState} from 'react';
import {Drawer,DrawerContent,DrawerHeader,DrawerTitle,DrawerDescription} from '@/components/ui/drawer';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {getTaskDetailAction,type TaskDetailResult} from '@/presentation/actions/task-actions';
import {TaskDetailClient} from './task-detail-client';
export function EmployeeTaskDetailDrawer({taskId,open,onOpenChange,onTaskUpdated}:{taskId:string|null;open:boolean;onOpenChange:(open:boolean)=>void;onTaskUpdated?:()=>void}){
 const [task,setTask]=useState<TaskDetailResult|null>(null),[error,setError]=useState<string|null>(null),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setTask(null);setError(null);if(open&&taskId)void getTaskDetailAction(taskId).then(result=>{if(active){setTask(result.task??null);setError(result.error??null);}}).catch(()=>{if(active)setError('Não foi possível carregar a tarefa.');});return ()=>{active=false;};},[open,taskId,retry]);
 return <Drawer open={open} onOpenChange={onOpenChange}><DrawerContent><DrawerHeader><DrawerTitle>Detalhe da tarefa</DrawerTitle><DrawerDescription>Confira as orientações e registre sua entrega.</DrawerDescription></DrawerHeader><div className="overflow-y-auto min-h-0 pb-6">{error?<div role="alert"><p>{error}</p><Button onClick={()=>setRetry(v=>v+1)}>Tentar novamente</Button></div>:task?<TaskDetailClient key={task.id+':'+task.roundId} embedded task={{...task,deadlineAt:task.deadlineAt?new Date(task.deadlineAt):null,slaDueAt:task.slaDueAt?new Date(task.slaDueAt):null,scheduledDate:task.scheduledDate?new Date(task.scheduledDate):null}} onCompleted={()=>{onTaskUpdated?.();onOpenChange(false);}}/>:<Spinner/>}</div><Button variant="outline" onClick={()=>onOpenChange(false)}>Fechar</Button></DrawerContent></Drawer>;
}
