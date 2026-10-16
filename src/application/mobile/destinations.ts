import {prisma} from '@/infrastructure/database/prisma';
import type {AuthenticatedContext} from '@/application/security/auth-context';
import {readable} from './data';
import {fail} from './http';
export async function resolveDestination(c:AuthenticatedContext,input:{taskId?:string;executionId?:string}){
 const now=new Date();
 const members=await prisma.organizationMember.findMany({where:{userId:c.userId,role:'EMPLOYEE',status:'ACTIVE',organization:{status:'ACTIVE'},user:{status:'ACTIVE'}},include:{organization:true,teamMemberships:{where:{team:{status:'ACTIVE'}}},locationAccesses:{where:{location:{status:'ACTIVE'},AND:[{OR:[{startsAt:null},{startsAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}]}}}});
 for(const m of members){
  const context:AuthenticatedContext={...c,organizationId:m.organizationId,organizationName:m.organization.name,organizationSlug:m.organization.slug,memberId:m.id,role:'EMPLOYEE',scope:{locationIds:m.locationAccesses.map(l=>l.locationId),teamIds:m.teamMemberships.map(t=>t.teamId)}};
  const visible=input.taskId?await prisma.task.findFirst({where:{...readable(context),id:input.taskId},select:{id:true}}):await prisma.processExecution.findFirst({where:{id:input.executionId,organizationId:m.organizationId,tasks:{some:readable(context)}},select:{id:true}});
  if(visible)return {...input,organizationId:m.organizationId};
 }
 fail(404,'DESTINATION_UNAVAILABLE','Recurso removido, transferido ou fora do seu acesso.');
}
