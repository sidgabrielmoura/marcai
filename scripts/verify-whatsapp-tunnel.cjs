const assert=require('node:assert/strict');
const http=require('node:http');
const{createHmac}=require('node:crypto');
const{createWebhookProxy}=require('./lib/whatsapp-webhook-proxy.cjs');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
async function main(){
 let received;
 const upstream=http.createServer((request,response)=>{
  const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{received={body:Buffer.concat(chunks),headers:request.headers,path:request.url};response.writeHead(202);response.end();});
 });
 const upstreamPort=await listen(upstream),proxy=createWebhookProxy('http://127.0.0.1:'+upstreamPort),port=await listen(proxy);
 try{
  const route='http://127.0.0.1:'+port+'/api/whatsapp/webhooks/INSTANCE-synthetic';
  const body=Buffer.from('{ "event": "session.status", "label": "ação" }\n');
  const signature=createHmac('sha512','synthetic-only').update(body).digest('hex');
  const valid=await fetch(route,{method:'POST',body,headers:{'x-webhook-hmac':signature,'x-webhook-hmac-algorithm':'sha512'}});assert.equal(valid.status,202);
  assert.deepEqual(received.body,body);assert.equal(received.headers['x-webhook-hmac'],signature);assert.equal(received.headers['x-webhook-hmac-algorithm'],'sha512');
  received=null;
  for(const[method,path]of[['GET','/api/whatsapp/webhooks/INSTANCE-synthetic'],['POST','/management/settings'],['POST','/api/mobile/v1/auth'],['POST','/api/whatsapp/webhooks/INSTANCE-synthetic?unexpected=1']]){
   const rejected=await fetch('http://127.0.0.1:'+port+path,{method,...(method==='POST'?{body:'{}'}:{})});assert.equal(rejected.status,404);assert.equal(received,null);
  }
  const large=await fetch(route,{method:'POST',body:Buffer.alloc(262145)});assert.equal(large.status,413);assert.equal(received,null);
  console.log('PASS: only POST webhooks forwarded, raw UTF-8 body and HMAC preserved, other routes blocked, body limited to 256 KiB');
 }finally{proxy.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(resolve=>proxy.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);}
}
main().catch(error=>{console.error(error);process.exitCode=1});
