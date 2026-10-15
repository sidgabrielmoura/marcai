import {validateCronRequest} from '@/infrastructure/security/cron-auth';
import {maintainMobile} from '@/application/mobile/maintenance';
export const runtime='nodejs';
export const maxDuration=30;
async function run(req:Request){
 if(process.env.MOBILE_MAINTENANCE_ENABLED!=='1')return Response.json({error:'Maintenance disabled'},{status:503});
 if(!req.headers.get('authorization')?.startsWith('Bearer '))return Response.json({error:'Unauthorized'},{status:401});
 const auth=validateCronRequest(req);if(!auth.authorized)return Response.json({error:auth.error},{status:auth.status});
 return Response.json(await maintainMobile());
}
export const GET=run;
export const POST=run;
