import {validInstallationSession} from './security';
import {getEvidenceRound} from "@/application/tasks/evidence-round";
import {randomUUID,createHash} from 'node:crypto';
import {prisma} from '@/infrastructure/database/prisma';
import {getFirebaseAdminMessaging} from '@/infrastructure/firebase/firebase-admin';
import {isPushEligible} from '@/infrastructure/notifications/notification-service';
import {retryDelay,parseDestination} from './policy';
import {eligibleMember} from '@/application/security/operational-scope';
type Installation={id:string;session_id:string;address_type:"token"|"fid";token:string;platform:string;environment:string;permission:string};
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const invalidToken=(code:string)=>['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code);
async function eligibleRecipient(n:{userId:string;organizationId:string;type:string;data:unknown}) {
 const m=await prisma.organizationMember.findFirst({where:{userId:n.userId,organizationId:n.organizationId,status:'ACTIVE',user:{status:'ACTIVE'},organization:{status:'ACTIVE'}},include:{locationAccesses:{where:{location:{organizationId:n.organizationId,status:"ACTIVE"}}},teamMemberships:{where:{team:{organizationId:n.organizationId,status:"ACTIVE"}}}}});
 if(!m)return false;
 const d=n.data as {taskId?:string;executionId?:string;cycle?:string}|null;
 if(!d?.taskId){if(d?.executionId){const e=await prisma.processExecution.findFirst({where:{id:d.executionId,organizationId:n.organizationId},include:{tasks:{where:{deletedAt:null},include:{assignments:{where:{removedAt:null}}}}}});if(!e||n.type==="EXECUTION_COMPLETED"&&e.status!=="COMPLETED")return false;if(["OWNER","ADMIN"].includes(m.role))return true;return e.tasks.some(t=>m.role==="MANAGER"?!!t.teamId&&!!t.locationId&&m.teamMemberships.some(tm=>tm.teamId===t.teamId)&&m.locationAccesses.some(la=>la.locationId===t.locationId&&(!la.startsAt||la.startsAt<=new Date())&&(!la.expiresAt||la.expiresAt>new Date())):t.assignments.some(a=>a.memberId===m.id)&&(!t.teamId||m.teamMemberships.some(tm=>tm.teamId===t.teamId))&&(!t.locationId||m.locationAccesses.some(la=>la.locationId===t.locationId&&(!la.startsAt||la.startsAt<=new Date())&&(!la.expiresAt||la.expiresAt>new Date()))));}return true;}
 const task=await prisma.task.findFirst({where:{id:d.taskId,organizationId:n.organizationId},include:{assignments:{where:{removedAt:null}}}});
 if(!task)return false;
 if(['TASK_CANCELLED','TASK_TRANSFERRED_OUT'].includes(n.type))return true;
 if(task.deletedAt||["COMPLETED","CANCELLED","NOT_COMPLETED"].includes(task.status)&&!["APPROVAL_UPDATED","TASK_COMPLETED"].includes(n.type))return false;
 if(n.type==="APPROVAL_REQUESTED"&&task.status!=="SUBMITTED")return false;
 if(d.cycle){const round=await getEvidenceRound(prisma,n.organizationId,task.id);const cycle=JSON.stringify({roundId:round?.id??"initial",deadline:task.deadlineAt,sla:task.slaDueAt,tolerance:task.toleranceMinutes,assignees:task.assignments.map(a=>a.memberId+":"+a.assignedAt.toISOString()).sort()});if(cycle!==d.cycle)return false;}
 if(n.type==='TASK_CORRECTION_REQUESTED'&&task.status!=='NEEDS_CORRECTION')return false;
 if(n.type==='TASK_UNBLOCKED'){const due=[task.deadlineAt?.getTime(),task.slaDueAt?.getTime()].filter((d):d is number=>d!==undefined);if(task.status==='BLOCKED'||task.scheduledDate&&task.scheduledDate>new Date()||due.length&&Date.now()>Math.min(...due)+(task.toleranceMinutes??20)*60000)return false;}
 if(['OWNER','ADMIN'].includes(m.role))return true;
 if(m.role==='MANAGER')return !!task.locationId&&!!task.teamId&&m.teamMemberships.some(t=>t.teamId===task.teamId)&&m.locationAccesses.some(l=>l.locationId===task.locationId&&(!l.startsAt||l.startsAt<=new Date())&&(!l.expiresAt||l.expiresAt>new Date()));
 if(m.role==='EMPLOYEE')return task.assignments.some(a=>a.memberId===m.id)&&!!await eligibleMember(n.organizationId,m.id,task.locationId,task.teamId);
 return false;
}
export async function processPushBatch(deadlineAt=Date.now()+35000) {
 const lease=randomUUID();
 const rows=await prisma.$queryRaw<Array<{id:string;attempts:number}>>`WITH picked AS (
 SELECT id FROM mobile_push_outbox WHERE (state='QUEUED' AND available_at<=now()) OR (state='PROCESSING' AND lease_until<now()) ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED
 ) UPDATE mobile_push_outbox o SET state='PROCESSING',lease_id=${lease}::uuid,lease_until=now()+interval '90 seconds',attempts=o.attempts+1 FROM picked WHERE o.id=picked.id RETURNING o.id,o.attempts`;
 let accepted=0,failed=0,skipped=0;
 for(const job of rows){
 if(Date.now()>deadlineAt){await prisma.$executeRaw`UPDATE mobile_push_outbox SET state='QUEUED',attempts=GREATEST(0,attempts-1),lease_id=NULL,lease_until=NULL WHERE id=${job.id} AND lease_id=${lease}::uuid`;continue;}
 try{
 const n=await prisma.notification.findUnique({where:{id:job.id},include:{deliveries:true}});
 const ttl=3600;
 if(!n||n.deliveries.length>0&&!n.deliveries.some(d=>d.channel==='PUSH')||!isPushEligible(n.type,n.priority)||n.type==='PAUSE_ALERT'||Date.now()-n.createdAt.getTime()>ttl*1000||!await eligibleRecipient(n)){
 await finish(job.id,lease,'SKIPPED',null);skipped++;continue;
 }
 const native=await prisma.$queryRaw<Installation[]>`SELECT id::text,session_id::text,address_type,token,platform,environment,permission FROM mobile_installations WHERE user_id=${n.userId} AND organization_id=${n.organizationId} AND revoked_at IS NULL AND permission IN ('authorized','provisional') AND (environment=${process.env.MOBILE_PUSH_ENVIRONMENT??'production'} OR environment IN ('preview','production','development')) AND last_sync_at>now()-interval '45 days'`;
 const web=await prisma.userDeviceToken.findMany({where:{userId:n.userId,lastUsedAt:{gte:new Date(Date.now()-45*86400000)}},select:{id:true,token:true}});
 const test=(n.data as {testInstallationId?:string}|null)?.testInstallationId;
 const devices=[...native.filter(d=>!test||d.id===test),...(!test?web:[]).map(d=>({id:'web:'+d.id,token:d.token,platform:'web',environment:'production',permission:'authorized'}))];
 if(!devices.length){await finish(job.id,lease,'NO_DEVICE',null);skipped++;continue;}
 let transient=false,yielded=false;
 for(const device of devices){
 if(Date.now()>deadlineAt){yielded=true;break;}
 if(device.platform!=='web'&&'session_id' in device&&typeof device.session_id==='string'&&!await validInstallationSession(device.session_id))continue;
 const prior=await prisma.$queryRaw<Array<{state:string}>>`SELECT state FROM mobile_push_deliveries WHERE notification_id=${n.id} AND installation_id=${device.id}`;
 if(prior.some(p=>['PROVIDER_ACCEPTED','PERMANENT_FAILURE'].includes(p.state)))continue;
 await prisma.$executeRaw`INSERT INTO mobile_push_deliveries(notification_id,installation_id,token_hash,attempts) VALUES(${n.id},${device.id},${hash(device.token)},1) ON CONFLICT(notification_id,installation_id) DO UPDATE SET attempts=mobile_push_deliveries.attempts+1,state='QUEUED',token_hash=excluded.token_hash`;
 const d=parseDestination({...n.data as Record<string,unknown>,organizationId:n.organizationId,notificationId:n.id})??{organizationId:n.organizationId,notificationId:n.id};
 const data=Object.fromEntries(Object.entries({...d,type:n.type,title:n.title,message:n.message}).map(([k,v])=>[k,String(v)]));
 const remaining=Math.max(1,ttl-Math.floor((Date.now()-n.createdAt.getTime())/1000));
 try{
 const providerId=await getFirebaseAdminMessaging().send({
 ...('address_type' in device&&device.address_type==='fid'?{fid:device.token}:{token:device.token}),notification:{title:n.title||'Tarefaí',body:n.message||'Há uma atualização para você. Toque para conferir.'},data,
 android:{priority:['HIGH','CRITICAL'].includes(n.priority)?'high':'normal',ttl:remaining*1000,notification:{channelId:'marcai-operational',icon:'ic_stat_marcai',tag:n.id}},
 apns:{headers:{'apns-push-type':'alert','apns-priority':'10','apns-expiration':String(Math.floor(Date.now()/1000)+remaining)},payload:{aps:{sound:'default'}}},
 webpush:{headers:{TTL:String(remaining)},notification:{tag:n.id},fcmOptions:{link:(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://tarefai.com.br')+(d.taskId?'/tasks/'+d.taskId:'/notifications')}}
 });
 await prisma.$executeRaw`UPDATE mobile_push_deliveries SET state='PROVIDER_ACCEPTED',provider_id=${providerId},accepted_at=now(),error_code=NULL WHERE notification_id=${n.id} AND installation_id=${device.id}`;accepted++;
 }catch(e){
 const code=String((e as {code?:string}).code??'provider/unavailable');
 const permanent=invalidToken(code)||['messaging/invalid-argument','messaging/mismatched-credential'].includes(code);
 await prisma.$executeRaw`UPDATE mobile_push_deliveries SET state=${permanent?'PERMANENT_FAILURE':'TRANSIENT_FAILURE'},error_code=${code.slice(0,100)} WHERE notification_id=${n.id} AND installation_id=${device.id}`;
 if(invalidToken(code)){
 if(device.platform==='web')await prisma.userDeviceToken.deleteMany({where:{token:device.token}});
 else await prisma.$executeRaw`UPDATE mobile_installations SET revoked_at=now() WHERE id=${device.id}::uuid AND token=${device.token}`;
 }
 transient ||= !permanent;failed++;
 }
 }
 if(yielded){await prisma.$executeRaw`UPDATE mobile_push_outbox SET state='QUEUED',attempts=GREATEST(0,attempts-1),lease_id=NULL,lease_until=NULL WHERE id=${job.id} AND lease_id=${lease}::uuid`;}else if(transient&&job.attempts<8){
 await prisma.$executeRaw`UPDATE mobile_push_outbox SET state='QUEUED',available_at=${new Date(Date.now()+retryDelay(job.attempts))},lease_id=NULL,lease_until=NULL WHERE id=${job.id} AND lease_id=${lease}::uuid`;
 }else await finish(job.id,lease,transient?'DEAD_LETTER':'PROCESSED',transient?'Retries exhausted':null);
 }catch{
 if(job.attempts>=8)await finish(job.id,lease,'DEAD_LETTER','worker/error');
 else await prisma.$executeRaw`UPDATE mobile_push_outbox SET state='QUEUED',available_at=${new Date(Date.now()+retryDelay(job.attempts))},lease_id=NULL,lease_until=NULL,last_error='worker/error' WHERE id=${job.id} AND lease_id=${lease}::uuid`;
 failed++;
 }
 }
 return {jobs:rows.length,accepted,failed,skipped};
}
async function finish(id:string,lease:string,state:string,error:string|null) {
 await prisma.$executeRaw`UPDATE mobile_push_outbox SET state=${state},last_error=${error},lease_id=NULL,lease_until=NULL WHERE id=${id} AND lease_id=${lease}::uuid`;
}
export async function pushMetrics(){
 const states=await prisma.$queryRaw<Array<{state:string;count:bigint}>>`SELECT state,count(*) FROM mobile_push_outbox GROUP BY state`;
 const [age]=await prisma.$queryRaw<Array<{seconds:number|null}>>`SELECT extract(epoch from now()-min(created_at))::float AS seconds FROM mobile_push_outbox WHERE state IN ('QUEUED','PROCESSING')`;
 const platforms=await prisma.$queryRaw<Array<{platform:string;state:string;count:bigint}>>`SELECT COALESCE(i.platform,'web') AS platform,d.state,count(*) FROM mobile_push_deliveries d LEFT JOIN mobile_installations i ON i.id::text=d.installation_id GROUP BY COALESCE(i.platform,'web'),d.state`;
 return {states:states.map(s=>({...s,count:Number(s.count)})),oldestQueueSeconds:age?.seconds??0,platforms:platforms.map(s=>({...s,count:Number(s.count)}))};
}
