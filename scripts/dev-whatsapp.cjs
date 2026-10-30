const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createWebhookProxy } = require('./lib/whatsapp-webhook-proxy.cjs');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'tmp/waha-tunnel');
const stateFile = path.join(folder, 'state.json');
const envFile = path.join(root, '.env.development.local');
const parser = require('dotenv').parse;
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

async function publicProbe(url, path, probes) {
  try {
    const response=await fetch(new URL(path,url),{method:'POST',body:'{}',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(5000)});
    const body=await response.json().catch(()=>null);probes['HTTP_'+response.status]=(probes['HTTP_'+response.status]||0)+1;
    return response.status===401&&body?.error==='Não autorizado.';
  } catch(error) {
    const code=error.cause?.code||error.name;probes[code]=(probes[code]||0)+1;
    if(code!=='ENOTFOUND')return false;
    // Check public DNS without changing the computer's resolver or hosts file.
    const hostname=new URL(url).hostname;
    const dns=await fetch('https://cloudflare-dns.com/dns-query?'+new URLSearchParams({name:hostname,type:'A'}),{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000)}).then(response=>response.json()).catch(()=>null);
    const address=dns?.Answer?.find(answer=>answer.type===1&&/^\d+\.\d+\.\d+\.\d+$/.test(answer.data))?.data;
    probes.publicDnsStatus=dns?.Status??'UNAVAILABLE';
    if(!address)return false;
    return new Promise(resolve=>{
      const request=https.request(new URL(path,url),{method:'POST',headers:{'content-type':'application/json'},timeout:5000,lookup:(_host,options,callback)=>options.all?callback(null,[{address,family:4}]):callback(null,address,4)},response=>{
        const parts=[];response.on('data',chunk=>parts.push(chunk));response.on('end',()=>{probes['HTTPS_'+response.statusCode]=(probes['HTTPS_'+response.statusCode]||0)+1;let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{};resolve(response.statusCode===401&&body?.error==='Não autorizado.');});
      });
      request.on('timeout',()=>request.destroy());request.on('error',()=>resolve(false));request.end('{}');
    });
  }
}

async function main() {
  if (process.argv.includes('--stop')) {
    const state = JSON.parse(read(stateFile) || '{}');
    if (!state.controlPort || !state.controlKey) throw new Error('NO_ACTIVE_TUNNEL');
    const response = await fetch(`http://127.0.0.1:${state.controlPort}/stop`, { method: 'POST', headers: { 'x-control-key': state.controlKey }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('TUNNEL_STOP_FAILED');
    console.log('Túnel local encerrado.'); return;
  }
  const env = Object.assign({}, parser(read(path.join(root,'.env'))), parser(read(path.join(root,'.env.local'))), parser(read(envFile)), process.env);
  if (env.NODE_ENV === 'production') throw new Error('DEVELOPMENT_ONLY');
  const origin = new URL(env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000');
  if (!['127.0.0.1','localhost','[::1]'].includes(origin.hostname) || origin.protocol !== 'http:') throw new Error('LOCAL_ORIGIN_REQUIRED');
  const oldState = JSON.parse(read(stateFile) || '{}');
  if (oldState.pid) {
    let running = false; try { process.kill(oldState.pid, 0); running = true; } catch {}
    if (running) throw new Error('TUNNEL_ALREADY_RUNNING');
  }
  const probePath = '/api/whatsapp/webhooks/INSTANCE-LOCAL-READINESS';
  const local = await fetch(new URL(probePath,origin), { method:'POST',body:'{}',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000) });
  const localBody = await local.json().catch(()=>null);
  if (local.status !== 401 || localBody?.error !== 'Não autorizado.') throw new Error('START_NEXT_DEV_FIRST');
  const binary = env.CLOUDFLARED_PATH || path.join(folder,'bin',process.platform==='win32'?'cloudflared.exe':'cloudflared');
  if (!fs.existsSync(binary)) throw new Error('CLOUDFLARED_REQUIRED');
  fs.mkdirSync(folder,{recursive:true});
  const proxy = createWebhookProxy(origin.origin);
  const proxyPort = await listen(proxy);
  const proxyCheck = await fetch(`http://127.0.0.1:${proxyPort}${probePath}`, {method:'POST',body:'{}',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(10000)});
  const proxyBody = await proxyCheck.json().catch(()=>null);
  if(proxyCheck.status!==401||proxyBody?.error!=='Não autorizado.'){proxy.closeAllConnections();proxy.close();throw new Error('LOCAL_PROXY_UNREACHABLE');}
  const controlKey = randomBytes(32).toString('hex');
  let assignedOrigin, child, closing = false;
  const originalLine = read(envFile).match(/^BASE_URL\s*=.*$/m)?.[0];
  const rewriteBase = value => {
    let content = read(envFile);
    const line = value === undefined ? originalLine || '' : 'BASE_URL='+JSON.stringify(value);
    if (/^BASE_URL\s*=.*$/m.test(content)) content=content.replace(/^BASE_URL\s*=.*$/m,line);
    else if(line) content=content.trimEnd()+'\n'+line+'\n';
    fs.writeFileSync(envFile,content);
  };
  const cleanup = () => {
    if(closing)return;closing=true;
    if(assignedOrigin&&parser(read(envFile)).BASE_URL===assignedOrigin)rewriteBase(undefined);
    if(child&&!child.killed)child.kill();
    proxy.closeAllConnections();proxy.close();control.close();
    if(JSON.parse(read(stateFile)||'{}').pid===process.pid)fs.unlinkSync(stateFile);
  };
  const control=http.createServer((request,response)=>{
    if(request.method!=='POST'||request.url!=='/stop'||request.headers['x-control-key']!==controlKey){response.writeHead(404);response.end();return;}
    response.end('ok');setTimeout(()=>{cleanup();process.exit(0)},50);
  });
  const controlPort=await listen(control);
  const safeEnv=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
  child=spawn(binary,['tunnel','--no-autoupdate','--protocol','http2','--url',`http://127.0.0.1:${proxyPort}`],{cwd:folder,env:safeEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
  fs.writeFileSync(stateFile,JSON.stringify({pid:process.pid,childPid:child.pid,proxyPort,controlPort,controlKey}));
  process.on('SIGINT',()=>{cleanup();process.exit(0)});process.on('SIGTERM',()=>{cleanup();process.exit(0)});
  let buffer='';
  let connectorRegistered=false;
  const hostname=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('TUNNEL_START_TIMEOUT')),60000);
    function consume(chunk){buffer=(buffer+chunk.toString()).slice(-32768);if(buffer.includes('Registered tunnel connection'))connectorRegistered=true;const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match){clearTimeout(timeout);resolve(match[0]);}}
    child.stdout.on('data',consume);child.stderr.on('data',consume);
    child.once('error',()=>{clearTimeout(timeout);reject(new Error('TUNNEL_START_FAILED'))});
    child.once('exit',()=>{clearTimeout(timeout);if(!closing){reject(new Error('TUNNEL_CLOSED'));cleanup();process.exitCode=1;}});
  });
  try {
    const publicOrigin=await hostname;
    let ready=false;
    const probes={};
    for(let attempt=0;attempt<30;attempt++){
      if(await publicProbe(publicOrigin,probePath,probes)){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!ready){console.error({code:'TUNNEL_CALLBACK_UNREACHABLE',connectorRegistered,probes});throw new Error('TUNNEL_CALLBACK_UNREACHABLE');}
    assignedOrigin=publicOrigin;rewriteBase(publicOrigin);
    console.log(JSON.stringify({ready:true,webhooksOnly:true,localOverride:'.env.development.local',pid:process.pid}));
  } catch(error){cleanup();throw error;}
}
module.exports={publicProbe};
if(require.main===module)main().catch(error=>{console.error({code:/^[A-Z_]+$/.test(error.message)?error.message:'LOCAL_TUNNEL_FAILED'});process.exitCode=1});
