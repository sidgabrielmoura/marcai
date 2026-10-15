import {validateCronRequest} from '@/infrastructure/security/cron-auth';
import {processPushBatch,pushMetrics} from '@/application/mobile/push-worker';
import {deadlineAlerts} from '@/application/mobile/deadline-alerts';
export const runtime='nodejs';
export const maxDuration=60;
async function run(req:Request){
 if(process.env.MOBILE_OUTBOX_ENABLED!=='1')return Response.json({error:'Outbox disabled'},{status:503});
 // Header authentication only; do not accept cron secrets in URLs.
 if(!req.headers.get('authorization')?.startsWith('Bearer '))return Response.json({error:'Unauthorized'},{status:401});
 const auth=validateCronRequest(req);if(!auth.authorized)return Response.json({error:auth.error},{status:auth.status});
 const alerts=await deadlineAlerts();
 const dispatch=await processPushBatch();
 return Response.json({alerts,dispatch,metrics:await pushMetrics()});
}
export const GET=run;
export const POST=run;
