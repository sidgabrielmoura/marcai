import {getAuthenticatedContext} from '@/application/security/auth-context';
import {replay} from '@/application/mobile/notifications';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(req:Request) {
 const context=await getAuthenticatedContext(false);
 if(!context)return new Response(null,{status:401});
 const encoder=new TextEncoder(),abort=new AbortController();
 req.signal.addEventListener('abort',()=>abort.abort(),{once:true});
 let scopeVersion:string|null=null;
 let cursor=new URL(req.url).searchParams.get('cursor'),closed=false;
 const stream=new ReadableStream({async start(out){
 const started=Date.now();
 try{while(!abort.signal.aborted&&Date.now()-started<25000){
 const current=await getAuthenticatedContext(false);
 if(!current||current.organizationId!==context.organizationId)break;
 const result=await replay(current,cursor);cursor=result.nextCursor;
 if(result.events.length||result.requiresSnapshot||scopeVersion!==result.scopeVersion)out.enqueue(encoder.encode('event: SYNC_REQUIRED\ndata: '+JSON.stringify({type:'SYNC_REQUIRED',payload:{cursor,requiresSnapshot:result.requiresSnapshot}})+'\n\n'));
 else out.enqueue(encoder.encode(': keepalive\n\n'));
 scopeVersion=result.scopeVersion;
 await new Promise(resolve=>setTimeout(resolve,2000));
 }}finally{if(!closed){closed=true;try{out.close();}catch{}}}
 },cancel(){closed=true;abort.abort();}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'}});
}
