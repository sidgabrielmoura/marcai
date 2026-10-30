import { getSession } from "@/infrastructure/security/session";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { projectNotice } from "@/application/mobile/notifications";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const url = new URL(request.url);
  const session = await getSession();
  if (!session?.sessionId || session.sessionId !== url.searchParams.get("sessionId")) {
    return new Response(null, {status:401,headers});
  }
  const id = url.searchParams.get("notificationId") || "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return new Response(null,{status:400,headers});
  const context = await getAuthenticatedContext(false);
  if (!context) return new Response(null,{status:401,headers});
  const notice = await prisma.notification.findFirst({where:{id,userId:context.userId,organizationId:context.organizationId},
    select:{id:true,type:true,priority:true,title:true,message:true,createdAt:true,readAt:true,organizationId:true,data:true}});
  if (!notice) return new Response(null,{status:404,headers});
  const projected = await projectNotice(context,notice);
  const destination = projected.destination;
  return Response.json({title:projected.title,body:projected.message,
    url:destination.taskId ? `/tasks/${encodeURIComponent(destination.taskId)}` : destination.executionId ? `/executions/${encodeURIComponent(destination.executionId)}` : "/notifications",
    notificationId:id,sessionId:session.sessionId}, {headers});
}
