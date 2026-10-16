import {getSession} from '@/infrastructure/security/session';
import {taskDetail} from './data';
import type {AuthenticatedContext} from '@/application/security/auth-context';
export async function webTaskDetail(c:AuthenticatedContext,id:string){
 const task=await taskDetail(c,id),session=await getSession();
 return {...task,draftScope:[c.userId,c.organizationId,session?.sessionId??'unavailable',task.id,task.roundId].join(':'),correctionRequested:task.roundId!=='initial',
  dependencies:task.dependencies.map(d=>({...d,dependsOnTask:{id:d.taskId??'',title:d.title,status:d.status??(d.satisfied?'COMPLETED':'BLOCKED')}})),
  occurrences:task.occurrences.map(o=>({...o,type:'IMPEDIMENT',severity:'HIGH'})),
  evidenceRequirements:task.requirements.map(r=>({...r,executionStage:r.stage,submissions:r.submissions.filter(s=>s.roundId===task.roundId).map((s,i)=>({...s,attemptNumber:i+1,storageKey:s.hasFile?s.id:null}))}))};
}
