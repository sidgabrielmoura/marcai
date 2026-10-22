import {prisma} from '@/infrastructure/database/prisma';
import type {AuthenticatedContext} from '@/application/security/auth-context';
import {readable} from './data';
import {fail} from './http';
export async function resolveDestination(c:AuthenticatedContext,input:{taskId?:string;executionId?:string}){
 const now=new Date();
 if(!input.taskId&&!input.executionId)fail(400,'DESTINATION_INVALID','Informe a tarefa ou execução.');
 const members=await prisma.organizationMember.findMany({where:{userId:c.userId,role:'EMPLOYEE',status:'ACTIVE',organization:{status:'ACTIVE'},user:{status:'ACTIVE'}},select:{id:true,organizationId:true,organization:{select:{name:true,slug:true}},teamMemberships:{where:{team:{status:'ACTIVE'}},select:{teamId:true,team:{select:{organizationId:true}}}},locationAccesses:{where:{location:{status:'ACTIVE'},AND:[{OR:[{startsAt:null},{startsAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}]},select:{locationId:true,location:{select:{organizationId:true}}}}}});
 const contexts=members.map((m):AuthenticatedContext=>({...c,organizationId:m.organizationId,organizationName:m.organization.name,organizationSlug:m.organization.slug,memberId:m.id,role:'EMPLOYEE',scope:{locationIds:m.locationAccesses.filter(l=>l.location.organizationId===m.organizationId).map(l=>l.locationId),teamIds:m.teamMemberships.filter(t=>t.team.organizationId===m.organizationId).map(t=>t.teamId)}}));
 if(contexts.length){
  const visible=input.taskId?await prisma.task.findFirst({where:{id:input.taskId,OR:contexts.map(readable)},select:{organizationId:true}}):await prisma.processExecution.findFirst({where:{id:input.executionId,OR:contexts.map(context=>({organizationId:context.organizationId,tasks:{some:readable(context)}}))},select:{organizationId:true}});
  if(visible)return {...input,organizationId:visible.organizationId};
 }
 fail(404,'DESTINATION_UNAVAILABLE','Recurso removido, transferido ou fora do seu acesso.');
}
