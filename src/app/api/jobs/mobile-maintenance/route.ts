import {validateCronRequest} from '@/infrastructure/security/cron-auth';
import {maintainMobile} from '@/application/mobile/maintenance';
export const runtime='nodejs';
export const maxDuration=30;
async function run(req:Request){
  const auth = validateCronRequest(req);
  if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
  if (process.env.MOBILE_MAINTENANCE_ENABLED !== '1') return Response.json({ error: 'Maintenance disabled' }, { status: 503 });
 return Response.json(await maintainMobile());
}
export const GET=run;
export const POST=run;
