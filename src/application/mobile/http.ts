import { randomUUID } from 'node:crypto';
export class MobileError extends Error {
 constructor(public status:number, public code:string, message:string) { super(message); }
}
export function fail(status:number,code:string,message:string):never { throw new MobileError(status,code,message); }
export function json(data:unknown,status=200) { return Response.json({data,serverNow:new Date().toISOString(),requestId:randomUUID()},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}); }
export function failure(e:unknown) {
 if(e instanceof MobileError)return Response.json({error:{code:e.code,message:e.message},serverNow:new Date().toISOString(),requestId:randomUUID()},{status:e.status,headers:{'Cache-Control':'no-store'}});
 return Response.json({error:{code:'SERVER_ERROR',message:'Não foi possível continuar. Tente novamente.'},serverNow:new Date().toISOString(),requestId:randomUUID()},{status:500});
}
