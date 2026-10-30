import { prisma } from "@/infrastructure/database/prisma";

/** @deprecated Delivery is now targeted to notices committed by notificationTransaction. */
export async function processPushBatch(_deadlineAt?: number) {
  return { jobs: 0, accepted: 0, failed: 0, skipped: 0, status: "DEPRECATED" };
}

export async function pushMetrics(){
 const states=await prisma.$queryRaw<Array<{state:string;count:bigint}>>`SELECT state,count(*) FROM mobile_push_outbox GROUP BY state`;
 const [age]=await prisma.$queryRaw<Array<{seconds:number|null}>>`SELECT extract(epoch from now()-min(created_at))::float AS seconds FROM mobile_push_outbox WHERE state IN ('QUEUED','PROCESSING')`;
 const platforms=await prisma.$queryRaw<Array<{platform:string;state:string;count:bigint}>>`SELECT COALESCE(i.platform,'web') AS platform,d.state,count(*) FROM mobile_push_deliveries d LEFT JOIN mobile_installations i ON i.id::text=d.installation_id GROUP BY COALESCE(i.platform,'web'),d.state`;
 return {states:states.map(s=>({...s,count:Number(s.count)})),oldestQueueSeconds:age?.seconds??0,platforms:platforms.map(s=>({...s,count:Number(s.count)}))};
}
