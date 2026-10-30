import { notificationTransaction } from "@/infrastructure/notifications/transaction";
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedContext } from '@/application/security/auth-context';
import { fail } from './http';
export async function idempotent<T>(req:Request|null,c:AuthenticatedContext,input:unknown,work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T> {
 if(!req)return notificationTransaction(work,{timeout:30000});
 const key=z.string().uuid().safeParse(req.headers.get('idempotency-key'));
 if(!key.success)fail(400,'IDEMPOTENCY_REQUIRED','A operação exige um identificador único.');
 const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return notificationTransaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'mobile-request:'+c.userId+':'+c.organizationId+':'+key.data}))`;
 const [receipt]=await tx.$queryRaw<Array<{fingerprint:string;response:T}>>`SELECT fingerprint,response FROM mobile_requests WHERE user_id=${c.userId} AND organization_id=${c.organizationId} AND key=${key.data}::uuid`;
 if(receipt){if(receipt.fingerprint!==fingerprint)fail(409,'IDEMPOTENCY_CONFLICT','Este envio já foi usado para outros dados.');return receipt.response;}
 const response=await work(tx);
 if(response&&typeof response==="object"&&"error" in response&&response.error&&!("committed" in response&&response.committed))return response;
 await tx.$executeRaw`INSERT INTO mobile_requests(user_id,organization_id,key,fingerprint,response) VALUES(${c.userId},${c.organizationId},${key.data}::uuid,${fingerprint},${JSON.stringify(response)}::jsonb)`;
 return response;
 },{timeout:30000});
}
