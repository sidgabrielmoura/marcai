import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedContext } from '@/application/security/auth-context';
import { prisma } from '@/infrastructure/database/prisma';
import { taskScope } from '@/application/security/operational-scope';
import { lockTask } from '@/application/tasks/task-lock';
import { getEvidenceRound } from '@/application/tasks/evidence-round';
import { storeEvidence,inspectEvidenceFile,readEvidence,removeEvidence } from '@/infrastructure/storage/evidence-storage';
import { includeTask,operationGuard } from './data';
import { fail } from './http';
import { idempotent } from './idempotency';
type Upload={id:string;user_id:string;organization_id:string;task_id:string;field_id:string|null;requirement_id:string|null;round_id:string;name:string;mime:string;size:number;expires_at:Date;attachment:Record<string,unknown>|null};
const uuid=z.string().uuid();
export async function mutable(tx:Prisma.TransactionClient,c:AuthenticatedContext,id:string) {
 const task=await tx.task.findFirst({where:{...taskScope(c),id,deletedAt:null},include:includeTask});
 if(!task)fail(404,'TASK_UNAVAILABLE','Tarefa indisponível no seu acesso.');
 const guard=operationGuard(task,new Date(),true);
 if(!guard.allowed)fail(409,guard.code!,guard.reason!);
 return task;
}
export async function createUpload(req:Request,c:AuthenticatedContext,taskId:string,input:unknown) {
 const b=z.object({roundId:z.string().min(1).max(128).optional(),fieldId:z.string().max(100).optional(),requirementId:z.string().max(128).optional(),name:z.string().min(1).max(200),mime:z.enum(['image/jpeg','image/png','image/webp','video/mp4','application/pdf']),size:z.number().int().positive().max(12*1024*1024)}).strict().refine(v=>!!v.fieldId!==!!v.requirementId).parse(input);
 return idempotent(req,c,{taskId,upload:b},async tx=>{
 await lockTask(tx,c.organizationId,taskId); const task=await mutable(tx,c,taskId);
 if(b.fieldId){const fields=task.formFields as Array<{id:string;type:string}>;if(!Array.isArray(fields)||!fields.some(f=>f.id===b.fieldId&&['PHOTO','VIDEO','FILE'].includes(f.type)))fail(400,'FORM_FIELD','Este campo não aceita arquivo.');}
 if(b.requirementId&&!task.evidenceRequirements.some(r=>r.id===b.requirementId))fail(400,'REQUIREMENT','Comprovação desconhecida.');
 if(b.requirementId&&b.size>10*1024*1024)fail(413,'FILE_LIMIT','A comprovação deve ter até 10 MB.');
 const round=await getEvidenceRound(tx,c.organizationId,taskId),id=randomUUID();
 if(b.roundId&&b.roundId!==(round?.id??'initial'))fail(409,'ROUND_CHANGED','A rodada mudou. Atualize a tarefa antes de enviar arquivos.');
 await tx.$executeRaw`INSERT INTO mobile_uploads(id,user_id,organization_id,task_id,field_id,requirement_id,round_id,name,mime,size,expires_at) VALUES(${id}::uuid,${c.userId},${c.organizationId},${taskId},${b.fieldId??null},${b.requirementId??null},${round?.id??'initial'},${b.name},${b.mime},${b.size},now()+interval '24 hours')`;
 return {uploadId:id,chunkSize:1048576};
 });
}
export async function ownedUpload(c:AuthenticatedContext,id:string,tx:Prisma.TransactionClient=prisma) {
 uuid.parse(id);
 const [u]=await tx.$queryRaw<Upload[]>`SELECT * FROM mobile_uploads WHERE id=${id}::uuid AND user_id=${c.userId} AND organization_id=${c.organizationId} AND expires_at>now()`;
 if(!u)fail(404,'UPLOAD_EXPIRED','O envio expirou. Selecione o arquivo novamente.');
 return u;
}
export async function chunk(c:AuthenticatedContext,id:string,part:number,bytes:Buffer) {
 const u=await ownedUpload(c,id);
 if(u.attachment)fail(409,'UPLOAD_FINISHED','Este envio já foi finalizado.');
 if(!Number.isInteger(part)||part<0||part>=Math.ceil(u.size/1048576)||bytes.length!==Math.min(1048576,u.size-part*1048576))fail(400,'CHUNK_INVALID','Parte de arquivo inválida.');
 await prisma.$transaction(async tx=>{
 await lockTask(tx,c.organizationId,u.task_id);await mutable(tx,c,u.task_id);
 const round=await getEvidenceRound(tx,c.organizationId,u.task_id);if((round?.id??'initial')!==u.round_id)fail(409,'ROUND_CHANGED','A rodada mudou. Revise o envio.');
 const [old]=await tx.$queryRaw<Array<{bytes:Uint8Array}>>`SELECT bytes FROM mobile_upload_chunks WHERE upload_id=${id}::uuid AND part=${part}`;
 if(old&&!Buffer.from(old.bytes).equals(bytes))fail(409,'CHUNK_CONFLICT','Esta parte já contém outros dados.');
 await tx.$executeRaw`INSERT INTO mobile_upload_chunks(upload_id,part,bytes) VALUES(${id}::uuid,${part},${bytes}) ON CONFLICT DO NOTHING`;
 });
 return {part};
}
export async function assemble(c:AuthenticatedContext,id:string,tx:Prisma.TransactionClient=prisma) {
 const u=await ownedUpload(c,id,tx);
 const rows=await tx.$queryRaw<Array<{part:number;bytes:Buffer}>>`SELECT part,bytes FROM mobile_upload_chunks WHERE upload_id=${id}::uuid ORDER BY part`;
 if(rows.length!==Math.ceil(u.size/1048576)||rows.some((r,i)=>r.part!==i))fail(409,'UPLOAD_INCOMPLETE','O envio ainda não terminou. Tente continuar.');
 const bytes=Buffer.concat(rows.map(r=>r.bytes));
 if(bytes.length!==u.size)fail(400,'FILE_SIZE','O tamanho do arquivo mudou.');
 return {upload:u,bytes};
}
export async function finalizeForm(req:Request,c:AuthenticatedContext,id:string) {
 const u=await ownedUpload(c,id);
 return idempotent(req,c,{finalize:id},async tx=>{
 await lockTask(tx,c.organizationId,u.task_id); const task=await mutable(tx,c,u.task_id);
 const round=await getEvidenceRound(tx,c.organizationId,u.task_id);
 if((round?.id??'initial')!==u.round_id)fail(409,'ROUND_CHANGED','A correção abriu uma nova rodada. Revise suas respostas.');
 if(!u.field_id)fail(400,'FORM_FIELD','Este envio não pertence ao questionário.');
 if(u.attachment)return u.attachment;
 const {bytes}=await assemble(c,id,tx);
 const field=(task.formFields as Array<{id:string;type:string}>).find(f=>f.id===u.field_id)!;
 // Form files keep their 12 MB product limit; inspect the actual content as evidence does.
 const error=inspectEvidenceFile(bytes,field.type,u.name,u.mime,12*1024*1024);
 if(error)fail(400,'FILE_CONTENT',error);
 const storageKey=await storeEvidence(bytes,tx);
 const attachment={storageKey,fileName:u.name,fileSize:u.size,mimeType:u.mime};
 await tx.$executeRaw`UPDATE mobile_uploads SET attachment=${JSON.stringify(attachment)}::jsonb WHERE id=${id}::uuid`;
 await tx.$executeRaw`DELETE FROM mobile_upload_chunks WHERE upload_id=${id}::uuid`;
 const guard=operationGuard(task,new Date(),true);if(!guard.allowed){await removeEvidence(storageKey,tx);fail(409,guard.code!,guard.reason!);}
 return attachment;
 });
}
export async function verifyFormAttachments(tx:Prisma.TransactionClient,c:AuthenticatedContext,task:{id:string;formFields:Prisma.JsonValue;formAnswers:Prisma.JsonValue},answers:Record<string,unknown>|undefined) {
 const fields=Array.isArray(task.formFields)?task.formFields as unknown as Array<{id:string;type:string;required:boolean}>:[];
 const round=await getEvidenceRound(tx,c.organizationId,task.id);
 for(const [fieldId,answer] of Object.entries(answers??{})){
 const f=fields.find(f=>f.id===fieldId);if(!f)fail(400,'FORM_FIELD','Pergunta inexistente.');
 if(!['PHOTO','VIDEO','FILE'].includes(f.type))continue;
 if(answer==null||answer===''){if(f.required)fail(400,'FORM_REQUIRED','Adicione o anexo obrigatório.');continue;}
 const file=z.object({storageKey:uuid,fileName:z.string(),fileSize:z.number(),mimeType:z.string()}).strict().parse(answer);
 const [owned]=await tx.$queryRaw<Array<{attachment:Record<string,unknown>}>>`SELECT attachment FROM mobile_uploads WHERE task_id=${task.id} AND user_id=${c.userId} AND organization_id=${c.organizationId} AND field_id=${fieldId} AND round_id=${round?.id??'initial'} AND attachment->>'storageKey'=${file.storageKey}`;
 if(!owned||JSON.stringify(owned.attachment.storageKey)!==JSON.stringify(file.storageKey))fail(403,'ATTACHMENT_OWNER','Este arquivo não pertence a esta pergunta e rodada.');
 if(owned.attachment.mimeType!==file.mimeType||owned.attachment.fileSize!==file.fileSize||owned.attachment.fileName!==file.fileName)fail(400,'ATTACHMENT_METADATA','O anexo foi alterado.');
 }
}
