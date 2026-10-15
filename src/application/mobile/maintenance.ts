import {prisma} from '@/infrastructure/database/prisma';
// Operational records are untouched. Only expired transport/security auxiliaries
// and provably unreferenced media are eligible; batches stay bounded.
export async function maintainMobile(){
 return prisma.$transaction(async tx=>{
 const requests=await tx.$executeRaw`DELETE FROM mobile_requests WHERE ctid IN (SELECT ctid FROM mobile_requests WHERE created_at<now()-interval '30 days' ORDER BY created_at LIMIT 500)`;
 const challenges=await tx.$executeRaw`DELETE FROM mobile_challenges WHERE id IN (SELECT id FROM mobile_challenges WHERE expires_at<now()-interval '1 day' LIMIT 500)`;
 const limits=await tx.$executeRaw`DELETE FROM mobile_rate_limits WHERE key IN (SELECT key FROM mobile_rate_limits WHERE window_at<now()-interval '1 day' LIMIT 500)`;
 const retrySecrets=await tx.$executeRaw`UPDATE mobile_refresh_tokens SET response=NULL WHERE hash IN (SELECT hash FROM mobile_refresh_tokens WHERE consumed_at<now()-interval '15 minutes' AND response IS NOT NULL LIMIT 500)`;
 const sessions=await tx.$executeRaw`DELETE FROM mobile_sessions WHERE id IN (SELECT id FROM mobile_sessions WHERE expires_at<now()-interval '7 days' LIMIT 100)`;
 // Completed attachment ledgers remain until the task's own retention purge.
 const uploads=await tx.$executeRaw`DELETE FROM mobile_uploads WHERE id IN (SELECT id FROM mobile_uploads WHERE expires_at<now() AND attachment IS NULL LIMIT 25)`;
 const events=await tx.$queryRaw<Array<{transaction_id:bigint}>>`DELETE FROM mobile_events WHERE id IN (SELECT id FROM mobile_events WHERE created_at<now()-interval '7 days' ORDER BY id LIMIT 1000) RETURNING transaction_id`;
 if(events.length){
 const floor=events.reduce((max,e)=>e.transaction_id>max?e.transaction_id:max,BigInt(0));
 await tx.$executeRaw`INSERT INTO mobile_job_cursors(job,cursor) VALUES('events-low-watermark',${String(floor)}) ON CONFLICT(job) DO UPDATE SET cursor=GREATEST(mobile_job_cursors.cursor::bigint,excluded.cursor::bigint)::text,touched_at=now()`;
 }
 const blobs=await tx.$executeRaw`DELETE FROM mobile_blobs b WHERE b.key IN (
 SELECT candidate.key FROM mobile_blobs candidate WHERE candidate.created_at<now()-interval '1 day'
 AND NOT EXISTS(SELECT 1 FROM evidence_submissions e WHERE e."storageKey"=candidate.key::text)
 AND NOT EXISTS(SELECT 1 FROM mobile_uploads u WHERE u.attachment->>'storageKey'=candidate.key::text)
 AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t."formAnswers" IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(t."formAnswers")='object' THEN t."formAnswers" ELSE '{}'::jsonb END) a WHERE a.value->>'storageKey'=candidate.key::text))
 LIMIT 25)`;
 return {requests,challenges,limits,retrySecrets,sessions,uploads,events:events.length,blobs};
 },{timeout:20000});
}
