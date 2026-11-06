// Real React components in Chromium, synthetic actions/media, no .env or database.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const dir = path.join(root, 'tmp/mobile-web-parity');
  fs.mkdirSync(dir, { recursive: true });
  require('node:child_process').execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x247B56:s=96x96:d=1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-y',path.join(dir,'fixture.mp4')], {windowsHide:true});
  const image = await require('qrcode').toDataURL('TAREFAI-SYNTHETIC-MEDIA');
  fs.writeFileSync(path.join(dir, 'entry.tsx'), `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {TaskDetailClient} from '../../src/presentation/components/mobile/task-detail-client';
    import {EmployeeTaskDetailDrawer} from '../../src/presentation/components/mobile/task-detail-drawer';
    import {EmployeeTaskForm} from '../../src/presentation/components/mobile/employee-task-form';
    import {EmployeeNoticeList} from '../../src/presentation/components/mobile/employee-notice-list';
    import {EmployeeHistoryFilters,EmployeeNoticeFilters} from '../../src/presentation/components/mobile/employee-filters';
    import {MediaGallery} from '../../src/presentation/components/mobile/media-gallery';
    import {LocationCard} from '../../src/presentation/components/mobile/location-card';
    import {NotificationStatus} from '../../src/presentation/components/mobile/notification-status';
    import LoginPage from '../../src/app/(auth)/login/page';
    const now=new Date();
    window.fixture={calls:[],fail:false,hold:false,completed:0};
    const fields=[{id:'short',question:'Como está o ambiente?',type:'SHORT_TEXT',required:true},{id:'long',question:'Observações da operação',type:'LONG_TEXT'},
      {id:'rating',question:'Avalie a organização',type:'RATING'},{id:'boolean',question:'Equipamento funcionando?',type:'BOOLEAN'},
      {id:'choice',question:'Selecione o turno',type:'MULTIPLE_CHOICE',options:['Manhã','Tarde','Tarde']},{id:'photo',question:'Foto do ambiente',type:'PHOTO'}];
    window.task={id:'synthetic-task',draftScope:'synthetic:user:org:session:task:initial',roundId:'initial',title:'Conferir a abertura da unidade',description:'Confira os ambientes e registre as comprovações.',instructions:'Revise cada item antes de concluir.',
      status:'IN_PROGRESS',priority:'MEDIUM',timezone:'America/Sao_Paulo',deadlineAt:new Date(Date.now()+3600000).toISOString(),locationName:'Unidade Centro',dependencies:[],occurrences:[],
      actions:{complete:{allowed:true,reason:null},evidence:{allowed:true,reason:null}},
      timeline:['TASK_STARTED','TASK_CLAIMED','EVIDENCE_SUBMITTED','TASK_SUBMITTED','TASK_COMPLETED'].map((action,index)=>({id:'event-'+index,action,createdAt:new Date(now.getTime()-index*1000).toISOString()})),
      evidenceRequirements:[{id:'photo-req',type:'PHOTO',required:true,minQuantity:1,submissions:[{id:'accepted',validationStatus:'VALID',attemptNumber:1,value:null,storageKey:'accepted',fileUrl:'https://res.cloudinary.com/synthetic/image/upload/v1/accepted.png',createdAt:now.toISOString()}],
        previousSubmissions:[{id:'rejected',validationStatus:'REJECTED',attemptNumber:1,value:null,fileUrl:'https://res.cloudinary.com/synthetic/image/upload/v1/rejected.png',rejectionReason:'A imagem ficou desfocada.',createdAt:now.toISOString()}]},
        {id:'gps',type:'LOCATION',required:false,minQuantity:1,submissions:[{id:'location',validationStatus:'VALID',attemptNumber:1,value:JSON.stringify({latitude:-23.5505,longitude:-46.6333,accuracy:35}),createdAt:now.toISOString()}]}]};
    const root=createRoot(document.getElementById('root'));
    function App(){const [mode,setMode]=useState(new URLSearchParams(location.search).get('mode')||'task'),[answers,setAnswers]=useState({});
      window.mode=setMode;
      if(mode==='login')return <LoginPage/>;
      if(mode==='drawer')return <EmployeeTaskDetailDrawer taskId={task.id} open onOpenChange={()=>{}}/>;
      if(mode==='form')return <TaskDetailClient key="form" task={{...task,taskType:'FORM',formFields:fields,formAnswers:{}}}/>;
      if(mode==='notices')return <div className="employee-notices"><h1>Avisos</h1><EmployeeNoticeFilters status="all"/><EmployeeNoticeList notifications={[
        {id:'unread',title:'Nova tarefa disponível na sua unidade',message:'Confira a abertura e registre as comprovações antes do prazo.',priority:'MEDIUM',readAt:null,createdAt:now,destination:{taskId:task.id}},
        {id:'read',title:'Correção aprovada',message:'A gestão conferiu as fotos enviadas.',priority:'HIGH',readAt:now,createdAt:new Date(now.getTime()-86400000),destination:{}},
        {id:'old',title:'Um aviso com título longo para verificar a quebra em duas linhas no telefone',message:'Mensagem mais longa para confirmar que os cartões permanecem compactos e não ultrapassam as margens da tela.',priority:'CRITICAL',readAt:null,createdAt:new Date(now.getTime()-86400000*5),destination:{}}
      ]}/><EmployeeHistoryFilters period="30" status="ALL"/></div>;
      if(mode==='status')return <NotificationStatus sessionId="synthetic-session"/>;
      if(mode==='gallery')return <MediaGallery scope="synthetic-scope" items={window.media??[
        {id:'one',kind:'image',status:'VALID',url:'/api/evidence/one',caption:'04/11, 15:20'},
        {id:'two',kind:'image',status:'REJECTED',url:'/api/evidence/two',reason:'A imagem ficou desfocada.'},
        {id:'unavailable',kind:'image',status:'REJECTED',reason:'Sem arquivo disponível.'}
      ]}/>;
      if(mode==='inputs')return <EmployeeTaskForm taskId={task.id} scope={task.draftScope} fields={fields} answers={answers} disabled={false} onChange={(id,value)=>setAnswers(prev=>({...prev,[id]:value}))}/>;
      return <TaskDetailClient task={task} onCompleted={()=>{fixture.completed++}}/>;
    }
    root.render(<App/>);
  `);
  const actions = `
    const ok=async(...args)=>{fixture.calls.push(args);return {success:true}};
    export const markNotificationReadAction=ok,markNotificationReadAndNavigateAction=ok,markAllNotificationsReadAction=ok;
    export const getPushContextAction=async()=>({sessionId:'synthetic-session'}),saveDeviceTokenAction=async(...args)=>{fixture.calls.push(['register',...args]);return {success:true}},sendCurrentSessionPushTestAction=ok;
    export const completeTaskAction=ok,submitEvidenceAction=ok,submitCloudinaryEvidenceAction=ok,registerTaskFormAttachmentAction=ok,uploadEvidenceAction=ok,uploadTaskFormFileAction=ok,claimTaskAction=ok,resumeTaskAction=ok,recordTaskViewAction=ok;
    export const getTaskDetailAction=async()=>({success:true,task:window.task});
    export const loginWithPasswordAction=ok,loginWithPinAction=ok,loginWithMobileSessionAction=ok,generateMobileAuthTokenAction=ok,checkMobileAuthTokenAction=ok,generateWebAuthnAuthentication=ok,verifyWebAuthnAuthentication=ok;
    export const reportImpedimentAction=async(...args)=>{fixture.calls.push(['impediment',...args]);if(fixture.hold)await new Promise(resolve=>fixture.release=resolve);return fixture.fail?{error:'Não foi possível registrar. Tente novamente.'}:{success:true,task:window.task}};
  `;
  const mocks = {
    navigation:`export const useRouter=()=>({push:url=>fixture.calls.push(['navigate',url]),refresh:()=>fixture.calls.push(['refresh'])});`,
    link:`import React from 'react';export default React.forwardRef(function Link({href,children,...props},ref){return <a ref={ref} href={href} {...props}>{children}</a>});`,
    actions,
    draft:`export const useEmployeeDraft=()=>({ready:true,saving:false,error:null,discard:async()=>{}});`,
    receipts:`export const useSubmissionReceipts=()=>async()=> 'synthetic-receipt';`,
    resource:`export const applyTaskResource=()=>true,subscribeTaskResource=()=>()=>{},loadTaskResource=async()=>({task:window.task});`,
    shared:`import React from 'react';export const StatusBadge=({status})=><span>{status}</span>,PriorityBadge=({priority})=><span>{priority}</span>,Modal=()=>null;`,
    messaging:`export const requestPushNotificationToken=async()=> 'synthetic-push-token-long';`,
    upload:`export const uploadDirectToCloudinary=async()=>{throw Error('not used')};`,
  };
  await build({entryPoints:[path.join(dir,'entry.tsx')],bundle:true,outfile:path.join(dir,'bundle.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'synthetic-boundaries',setup(builder){
    builder.onLoad({filter:/mobile[\\/]location-card\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace('new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString()', '"/maplibre-gl-worker.mjs"'),loader:'tsx',resolveDir:path.dirname(args.path)}));
    builder.onResolve({filter:/next\/navigation|next\/link|presentation\/actions\/|use-employee-draft|submission-receipts|realtime\/task-resource|^\.\.\/shared$|firebase-messaging|cloudinary-upload/},args=>{
      const p=args.path;const key=p==='next/navigation'?'navigation':p==='next/link'?'link':p.includes('/actions/')?'actions':p.includes('use-employee-draft')?'draft':p.includes('submission-receipts')?'receipts':p.includes('task-resource')?'resource':p==='../shared'?'shared':p.includes('firebase-messaging')?'messaging':'upload';
      return {path:key,namespace:'mock'};
    });
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:root}));
  }}]});
  const {compile}=require('@tailwindcss/node');
  const compiler=await compile(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{base:path.join(root,'src/app'),onDependency(){}});
  const files=[...fs.readdirSync(path.join(root,'src/presentation/components/mobile')).filter(f=>f.endsWith('.tsx')).map(f=>path.join(root,'src/presentation/components/mobile',f)),...fs.readdirSync(path.join(root,'src/components/ui')).filter(f=>f.endsWith('.tsx')).map(f=>path.join(root,'src/components/ui',f))];
  files.push(path.join(root,'src/app/(auth)/login/page.tsx'));
  const source=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
  const candidates=[...source.matchAll(/(?:"|`)([^"`\n]+)(?:"|`)/g)].flatMap(m=>m[1].split(/\s+/));
  const css=compiler.build(candidates)+fs.readFileSync(path.join(root,'src/app/workspace.css'),'utf8')+fs.readFileSync(path.join(root,'src/app/employee-updates.css'),'utf8');
  fs.writeFileSync(path.join(dir,'styles.css'),css);
  const requests=[];
  const server=http.createServer((request,response)=>{
    requests.push(request.url);
    if(request.url==='/brand-icon-sem-fundo.svg'){response.setHeader('Content-Type','image/svg+xml');response.end(fs.readFileSync(path.join(root,'public/brand-icon-sem-fundo.svg')));return;}
    if(request.url==='/fixture.mp4'){response.setHeader('Content-Type','video/mp4');response.end(fs.readFileSync(path.join(dir,'fixture.mp4')));return;}
    if(['/maplibre-gl-worker.mjs','/maplibre-gl-shared.mjs'].includes(request.url)){response.setHeader('Content-Type','application/javascript');response.end(fs.readFileSync(path.join(root,'node_modules/maplibre-gl/dist',request.url.slice(1))));return;}
    if(request.url.startsWith('/api/evidence/')){response.setHeader('Content-Type','image/png');response.end(Buffer.from(image.split(',')[1],'base64'));return;}
    const file=request.url==='/bundle.js'?'bundle.js':request.url==='/bundle.css'?'bundle.css':request.url==='/styles.css'?'styles.css':null;
    if(file){response.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/css');response.end(fs.readFileSync(path.join(dir,file)));return;}
    response.setHeader('Content-Type','text/html');response.end('<html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;background:#F6F8F6;font-family:Arial,sans-serif}#root{max-width:900px;margin:auto;padding:20px;min-width:0}#root:has(.auth-frame){max-width:none;padding:0}h1{font-size:30px;font-weight:700;margin-bottom:20px}.employee-notices{display:flex;flex-direction:column;gap:16px}</style><div id="root"></div><script src="/bundle.js"></script></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let browser;
  const checks=[];
  try {
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const mapErrors=[];page.on('requestfailed',request=>{if(request.url().includes('openfreemap')||request.url().includes('maplibre'))mapErrors.push({url:request.url(),error:request.failure()?.errorText});});
    await page.route('https://res.cloudinary.com/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from(image.split(',')[1],'base64')}));
    await page.addInitScript(()=>{Object.defineProperty(Notification,'permission',{get:()=>window.pushPermission??'granted'});});
    await page.goto(base+'?mode=login');
    await page.getByRole('button',{name:'PIN',exact:true}).waitFor();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.employee-login-segments [aria-pressed="true"]')).backgroundColor==='rgb(36, 123, 86)');
    await page.getByRole('button',{name:'Senha',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Senha',exact:true}).getAttribute('aria-pressed'),'true');
    checks.push('login real: abas PIN/senha com seleção verde herdada do componente mobile');
    await page.goto(base+'?mode=inputs');
    await page.getByLabel('Como está o ambiente?').fill('Organizado');
    await page.getByRole('button',{name:'4',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'4',exact:true}).getAttribute('aria-pressed'),'true');
    const segments=await page.locator('.employee-segments[data-full]').first().boundingBox();
    const option=await page.getByRole('button',{name:'4',exact:true}).boundingBox();
    assert.ok(option.width>segments.width/6);
    await page.getByRole('button',{name:'Sim',exact:true}).click();
    await page.waitForFunction(()=>getComputedStyle([...document.querySelectorAll('button')].find(node=>node.textContent==='Sim')).backgroundColor==='rgb(36, 123, 86)');
    const color=await page.getByRole('button',{name:'Sim',exact:true}).evaluate(node=>getComputedStyle(node).backgroundColor);
    assert.equal(color,'rgb(36, 123, 86)');
    await page.locator('input[type=file]').setInputFiles({name:'ambiente.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
    await page.getByRole('button',{name:'Foto 1, Não enviada'}).click();
    await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Ampliar foto'}).click();
    assert.equal(await page.locator('.employee-media-zoom img').evaluate(node=>node.style.width),'200%');
    await page.keyboard.press('Escape');checks.push('formulário: texto, nota distribuída, seleção verde, foto e zoom');
    await page.goto(base+'?mode=gallery');
    await page.getByRole('button',{name:'Foto 1, Aceita'}).click();
    await page.locator('.employee-media-zoom img').waitFor();
    await page.getByRole('button',{name:'Próximo arquivo'}).click();await page.getByText('2 de 3').waitFor();
    await page.getByRole('button',{name:'Arquivo anterior'}).click();await page.getByText('1 de 3').waitFor();
    assert.equal(requests.filter(url=>url==='/api/evidence/one').length,1);
    await page.getByRole('button',{name:'Próximo arquivo'}).click();await page.getByRole('button',{name:'Próximo arquivo'}).click();
    await page.getByText('Arquivo indisponível',{exact:true}).waitFor();await page.keyboard.press('Escape');
    checks.push('galeria: navegação, rejeição, arquivo indisponível e uma leitura por arquivo');
    await page.evaluate(async()=>{
      const blob=await fetch('/fixture.mp4').then(response=>response.blob());
      window.media=[{id:'video',kind:'video',status:'DRAFT',file:new File([blob],'video.mp4',{type:'video/mp4'})},{id:'image',kind:'image',status:'VALID',url:'/api/evidence/one'}];window.mode('inputs');
    });
    await page.getByLabel('Como está o ambiente?').waitFor();await page.evaluate(()=>window.mode('gallery'));
    await page.getByRole('button',{name:'Vídeo 1, Não enviada'}).click();await page.locator('.employee-media-stage video').waitFor();
    await page.waitForFunction(()=>document.querySelector('.employee-media-stage video')?.readyState>=1);
    await page.locator('.employee-media-stage video').evaluate(video=>video.play());
    assert.equal(await page.locator('.employee-media-stage video').evaluate(video=>video.paused),false);
    await page.getByRole('button',{name:'Próximo arquivo'}).click();assert.equal(await page.locator('.employee-media-stage video').count(),0);
    await page.keyboard.press('Escape');checks.push('vídeo real: reprodução com controles e interrupção ao trocar de arquivo');
    await page.evaluate(()=>{
      const original=window.fetch.bind(window);
      window.fetch=(url,options)=>String(url)==='/api/evidence/slow'?new Promise((resolve,reject)=>{fixture.slowStarted=true;options.signal.addEventListener('abort',()=>{fixture.slowAborted=true;reject(new DOMException('Context changed','AbortError'));},{once:true});}):original(url,options);
      window.media=[{id:'slow',kind:'image',status:'VALID',url:'/api/evidence/slow'}];window.mode('inputs');
    });
    await page.getByLabel('Como está o ambiente?').waitFor();await page.evaluate(()=>window.mode('gallery'));
    await page.getByRole('button',{name:'Foto 1, Aceita'}).click();await page.waitForFunction(()=>fixture.slowStarted);
    await page.evaluate(()=>window.mode('inputs'));await page.waitForFunction(()=>fixture.slowAborted);
    checks.push('troca de contexto: download pendente é cancelado ao desmontar a galeria');
    await page.goto(base+'?mode=task');
    await page.getByRole('button',{name:'Ver tudo (5)'}).click();assert.equal(await page.locator('.employee-timeline li').count(),5);
    await page.getByRole('button',{name:'Ver menos'}).click();assert.equal(await page.locator('.employee-timeline li').count(),3);
    assert.match(await page.locator('.employee-timeline time').first().textContent(),/\d{2}:\d{2}:\d{2}/);
    await page.getByRole('button',{name:'Não foi possível realizar'}).click();
    const submit=page.getByRole('button',{name:'Registrar e encerrar tarefa'});assert.ok(await submit.isDisabled());
    await page.getByText('Equipamento com defeito',{exact:true}).click();await page.getByLabel('O que impediu a realização?').fill('Motor não liga');
    await page.evaluate(()=>{fixture.fail=true});await submit.click();await page.getByText('Não foi possível registrar. Tente novamente.',{exact:true}).waitFor();
    await page.evaluate(()=>{fixture.fail=false;fixture.hold=true});await submit.click();
    await page.waitForFunction(()=>!!fixture.release);assert.ok(await page.getByRole('button',{name:'Cancelar',exact:true}).isDisabled());
    await page.evaluate(()=>fixture.release());await page.waitForFunction(()=>fixture.completed===1);
    const call=await page.evaluate(()=>fixture.calls.find(c=>c[0]==='impediment'));assert.equal(call[2],'EQUIPAMENTO_QUEBRADO');
    checks.push('tarefa: três eventos/expansão/segundos, impedimento, erro recuperável e bloqueio durante envio');
    await page.goto(base+'?mode=drawer');await page.getByText('Conferir a abertura da unidade',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Ver tudo (5)'}).click();await page.getByRole('button',{name:'Não foi possível realizar'}).click();await page.getByRole('heading',{name:'Registrar impedimento'}).waitFor();
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();checks.push('drawer: mesma linha do tempo, galeria, mapa e folha de impedimento');
    await page.goto(base+'?mode=notices');
    assert.equal(await page.locator('.employee-notice-dot').count(),2);assert.equal(await page.locator('.employee-notice-meta > svg').count(),1);
    assert.ok(await page.getByText('Ontem',{exact:true}).isVisible());checks.push('avisos: compacto, ponto não lido, confirmação de leitura e ontem');
    await page.goto(base+'?mode=status');await page.getByText('Quase pronto',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Tentar conectar de novo'}).click();await page.getByText('Você vai receber os avisos',{exact:true}).waitFor();
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c[0]==='register').length),1);
    await page.evaluate(()=>{window.pushPermission='denied';window.dispatchEvent(new Event('focus'))});await page.getByText('Os avisos estão desativados',{exact:true}).waitFor();
    assert.ok(await page.getByRole('button',{name:'Enviar teste para este aparelho'}).isDisabled());checks.push('estado dos avisos: conectado/bloqueado e foco sem novo registro');
    for(const width of [320,390,1440]) {
      await page.setViewportSize({width,height:844});
      for(const mode of ['inputs','notices','task','status','login']) {
        await page.goto(base+'?mode='+mode);await page.locator('#root > *').first().waitFor();
        if(mode==='task'){
          await page.locator('.employee-location-map [data-map-ready="true"]').waitFor({timeout:30000});
          const center=await page.locator('.employee-location-map').evaluate(node=>{const box=node.getBoundingClientRect(),marker=node.querySelector('.employee-location-marker').getBoundingClientRect();return {mapX:box.x+box.width/2,mapY:box.y+box.height/2,markerX:marker.x+marker.width/2,markerY:marker.y+marker.height/2};});
          assert.ok(Math.abs(center.mapX-center.markerX)<3&&Math.abs(center.mapY-center.markerY)<3,JSON.stringify(center));
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),mode+' overflow at '+width);
        await page.screenshot({path:path.join(dir,mode+'-'+width+'.png'),fullPage:true});
      }
      await page.goto(base+'?mode=task');await page.getByRole('button',{name:'Não foi possível realizar'}).click();
      await page.getByRole('heading',{name:'Registrar impedimento'}).waitFor();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.employee-impediment-sheet')).opacity==='1');
      await page.screenshot({path:path.join(dir,'impediment-'+width+'.png')});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    checks.push('capturas e ausência de overflow: 320, 390 e 1440 px');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({checks,pageErrors:errors,mapErrors,captures:dir},null,2));
    checks.forEach(check=>console.log('PASS: '+check));
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
