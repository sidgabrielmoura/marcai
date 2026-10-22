import type { Prisma } from "@prisma/client";
import { randomUUID,createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/infrastructure/database/prisma';
import type { AuthenticatedContext } from '@/application/security/auth-context';
import { readable } from './data';
import { fail } from './http';
import { parseDestination } from './policy';
type Notice = {id:string;type:string;priority:string;title:string;message:string;createdAt:Date;readAt:Date|null;organizationId:string;data:unknown};
export async function projectNotices(c:AuthenticatedContext,items:Notice[]) {
 const destinations=items.map(n=>parseDestination({...n.data as Record<string,unknown>|null,organizationId:n.organizationId,notificationId:n.id}));
 const taskIds=[...new Set(destinations.flatMap(d=>d?.taskId?[d.taskId]:[]))];
 const executionIds=[...new Set(destinations.flatMap(d=>!d?.taskId&&d?.executionId?[d.executionId]:[]))];
 const [tasks,executions]=await Promise.all([
  taskIds.length?prisma.task.findMany({where:{...readable(c),id:{in:taskIds}},select:{id:true}}):[],
  executionIds.length?prisma.processExecution.findMany({where:{id:{in:executionIds},organizationId:c.organizationId,tasks:{some:readable(c)}},select:{id:true}}):[],
 ]);
 const allowedTasks=new Set(tasks.map(t=>t.id)),allowedExecutions=new Set(executions.map(e=>e.id));
 return items.map((n,index)=>{
  const destination=destinations[index];
  const authorized=n.organizationId===c.organizationId&&!!destination&&(destination.taskId?allowedTasks.has(destination.taskId):destination.executionId?allowedExecutions.has(destination.executionId):true);
  return {id:n.id,type:n.type,priority:n.priority,title:authorized?n.title:'Acesso alterado',message:authorized?n.message:'Este recurso foi removido, transferido ou saiu do seu acesso. Confira as orientações da gestão.',createdAt:n.createdAt.toISOString(),readAt:n.readAt?.toISOString()??null,destination:authorized?destination!:{organizationId:n.organizationId,notificationId:n.id}};
 });
}
export async function projectNotice(c:AuthenticatedContext,n:Notice){
 return (await projectNotices(c,[n]))[0]!;
}
export async function notices(c:AuthenticatedContext,filter:string,cursor:string|null) {
 const where:Prisma.NotificationWhereInput={organizationId:c.organizationId,userId:c.userId,...(filter==='unread'?{readAt:null}:filter==='read'?{readAt:{not:null}}:{}),...(cursor?{AND:[notificationCursor(cursor)]}:{})};
 const [items,unreadCount]=await Promise.all([prisma.notification.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:21}),prisma.notification.count({where:{organizationId:c.organizationId,userId:c.userId,readAt:null}})]);
 const projected=await projectNotices(c,items.slice(0,20));
 return {items:projected,nextCursor:items.length>20?Buffer.from(JSON.stringify({date:items[19]!.createdAt.toISOString(),id:items[19]!.id})).toString("base64url"):null,unreadCount};
}
export async function read(c:AuthenticatedContext,id:string|'all') {
 await prisma.notification.updateMany({where:{organizationId:c.organizationId,userId:c.userId,readAt:null,...(id==='all'?{}:{id})},data:{readAt:new Date()}});
 return {unreadCount:await prisma.notification.count({where:{organizationId:c.organizationId,userId:c.userId,readAt:null}})};
}
export async function register(c:AuthenticatedContext,sessionId:string,installationId:string,input:unknown) {
 const b=z.object({installationId:z.string().uuid(),platform:z.enum(['ios','android']),environment:z.enum(['development','preview','production']),token:z.string().min(20).max(4096),addressType:z.enum(["token","fid"]).default("token"),permission:z.enum(['authorized','provisional','denied','notDetermined']),appVersion:z.string().min(1).max(40)}).strict().parse(input);
 if(b.addressType==='fid'&&(process.env.MOBILE_ALLOW_FID!=='1'||!/^[-_a-zA-Z0-9]{22}$/.test(b.token)))fail(400,'FCM_ADDRESS_UNSUPPORTED','Este tipo de inscrição ainda não está habilitado.');
 if(b.installationId!==installationId)fail(403,'INSTALLATION_OWNER','Este aparelho não pertence à sessão.');
 await prisma.$transaction(async tx=>{
 // A token can only have one account owner. Never register a client-provided user ID.
 await tx.$executeRaw`DELETE FROM mobile_installations WHERE token=${b.token} AND id<>${b.installationId}::uuid`;
 await tx.$executeRaw`INSERT INTO mobile_installations(id,user_id,organization_id,session_id,platform,environment,token,address_type,permission,app_version) VALUES(${b.installationId}::uuid,${c.userId},${c.organizationId},${sessionId}::uuid,${b.platform},${b.environment},${b.token},${b.addressType},${b.permission},${b.appVersion}) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,organization_id=excluded.organization_id,session_id=excluded.session_id,platform=excluded.platform,environment=excluded.environment,token=excluded.token,address_type=excluded.address_type,permission=excluded.permission,app_version=excluded.app_version,last_sync_at=now(),revoked_at=NULL`;
 });
 await prisma.$executeRaw`UPDATE mobile_push_outbox o SET state='QUEUED',available_at=now() FROM notifications n WHERE o.id=n.id AND o.state='NO_DEVICE' AND n."userId"=${c.userId} AND n."organizationId"=${c.organizationId} AND n."createdAt">now()-interval '1 hour'`;
 return {registered:['authorized','provisional'].includes(b.permission),lastSyncAt:new Date().toISOString()};
}
export async function installationStatus(c:AuthenticatedContext,id:string) {
 const [i]=await prisma.$queryRaw<Array<{permission:string;last_sync_at:Date;revoked_at:Date|null}>>`SELECT permission,last_sync_at,revoked_at FROM mobile_installations WHERE id=${id}::uuid AND user_id=${c.userId} AND organization_id=${c.organizationId}`;
 return {registered:!!i&&!i.revoked_at&&['authorized','provisional'].includes(i.permission),lastSyncAt:i?.last_sync_at?.toISOString()??null};
}
export async function replay(c:AuthenticatedContext,cursor:string|null) {
 if(cursor!==null&&(!/^\d{1,19}$/.test(cursor)||BigInt(cursor)>BigInt('9223372036854775807')))fail(400,'CURSOR_INVALID','Atualize os dados para continuar.');
 const after=cursor===null?BigInt(0):BigInt(cursor);
 // Use completed transaction IDs, not BIGSERIAL allocation order. A late commit
 // cannot fall behind the client cursor. Long transactions delay this watermark.
 const [watermark]=await prisma.$queryRaw<Array<{value:bigint;floor:string|null}>>`SELECT txid_snapshot_xmin(txid_current_snapshot())-1 AS value,(SELECT cursor FROM mobile_job_cursors WHERE job='events-low-watermark') AS floor`;
 const value=watermark!.value;
 // A missing/invalidated cursor requires a snapshot, not replay of the full history.
 const gap=watermark?.floor!=null&&after<BigInt(watermark.floor);
 const requiresSnapshot=cursor===null||after>value||gap;
 const rows=requiresSnapshot?[]:await prisma.$queryRaw<Array<{id:bigint;task_id:string|null;execution_id:string|null;user_id:string|null;kind:string}>>`SELECT id,task_id,execution_id,user_id,kind FROM mobile_events WHERE organization_id=${c.organizationId} AND transaction_id>${after} AND transaction_id<=${value} AND (user_id IS NULL OR user_id=${c.userId}) ORDER BY transaction_id,id LIMIT 1001`;
 const page=rows.slice(0,1000);
 const taskIds=[...new Set(page.filter(r=>r.task_id&&r.user_id!==c.userId).map(r=>r.task_id!))];
 const executionIds=[...new Set(page.flatMap(r=>r.execution_id?[r.execution_id]:[]))];
 const executionScope:Prisma.TaskWhereInput=c.role==='EMPLOYEE'?{deletedAt:null,teamId:{in:c.scope?.teamIds??[]},OR:[{locationId:null},{locationId:{in:c.scope?.locationIds??[]}}]}:readable(c);
 const [tasks,executions]=await Promise.all([
  taskIds.length?prisma.task.findMany({where:{id:{in:taskIds},organizationId:c.organizationId,deletedAt:null,OR:[readable(c),{executionId:{not:null},teamId:{in:c.scope?.teamIds??[]},OR:[{locationId:null},{locationId:{in:c.scope?.locationIds??[]}}]}]},select:{id:true}}):[],
  executionIds.length?prisma.processExecution.findMany({where:{id:{in:executionIds},organizationId:c.organizationId,tasks:{some:executionScope}},select:{id:true}}):[],
 ]);
 const allowedTasks=new Set(tasks.map(t=>t.id)),allowedExecutions=new Set(executions.map(e=>e.id));
 const events=[];
 for(const r of page){
 if(r.task_id&&r.user_id!==c.userId&&!allowedTasks.has(r.task_id))continue;
 if(r.execution_id&&!allowedExecutions.has(r.execution_id))continue;
 events.push({id:String(r.id),kind:r.kind});
 }
 const scopeVersion=createHash("sha256").update(JSON.stringify({role:c.role,locations:[...(c.scope?.locationIds??[])].sort(),teams:[...(c.scope?.teamIds??[])].sort()})).digest("hex");
 return {events,scopeVersion,nextCursor:String(value),requiresSnapshot:requiresSnapshot||rows.length>1000};
}
export async function acknowledge(c:AuthenticatedContext,installationId:string,input:unknown) {
 const b=z.object({notificationId:z.string().min(1).max(128),state:z.enum(['received','opened'])}).strict().parse(input);
 const n=await prisma.notification.findFirst({where:{id:b.notificationId,userId:c.userId,organizationId:c.organizationId},select:{id:true}});
 if(!n)fail(404,'NOTICE_UNAVAILABLE','Aviso indisponível.');
 if(b.state==='received')await prisma.$executeRaw`UPDATE mobile_push_deliveries SET received_at=COALESCE(received_at,now()) WHERE notification_id=${n.id} AND installation_id=${installationId}`;
 else await prisma.$executeRaw`UPDATE mobile_push_deliveries SET opened_at=COALESCE(opened_at,now()) WHERE notification_id=${n.id} AND installation_id=${installationId}`;
 return {success:true};
}

function notificationCursor(cursor:string):Prisma.NotificationWhereInput{let c:{date:string;id:string};try{c=JSON.parse(Buffer.from(cursor,"base64url").toString());if(!Number.isFinite(Date.parse(c.date))||!/^[a-zA-Z0-9_-]{1,128}$/.test(c.id))throw new Error();}catch{fail(400,"CURSOR_INVALID","Atualize os avisos.");}return {OR:[{createdAt:{lt:new Date(c.date)}},{createdAt:new Date(c.date),id:{lt:c.id}}]};}
