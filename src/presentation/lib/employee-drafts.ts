"use client";
import type {EvidenceDraft} from '@/presentation/components/mobile/task-evidence-item';
export type EmployeeDraft={formAnswers:Record<string,unknown>;evidenceDrafts:Record<string,EvidenceDraft>};
type RecordValue={expiresAt:number;iv:Uint8Array<ArrayBuffer>;cipher:ArrayBuffer};
const prefix='marcai-draft-key:',database='marcai-employee-drafts',versions=new Map<string,number>(),queues=new Map<string,Promise<unknown>>();let epoch=0;
async function open(){return new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open(database,1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function stored<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await open();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction('drafts',mode),request=work(tx.objectStore('drafts'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function storageId(scope:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope))),b=>b.toString(16).padStart(2,'0')).join('');}
function base64(bytes:Uint8Array){let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result);}
function bytes(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function key(id:string,create:boolean){let raw=sessionStorage.getItem(prefix+id);if(!raw&&create){raw=base64(crypto.getRandomValues(new Uint8Array(32)));sessionStorage.setItem(prefix+id,raw);}return raw?crypto.subtle.importKey('raw',bytes(raw),{name:'AES-GCM'},false,['encrypt','decrypt']):null;}
async function pack(value:unknown,budget:{bytes:number}):Promise<unknown>{
 if(value instanceof File){budget.bytes+=value.size;if(budget.bytes>64*1024*1024)throw new Error('O rascunho excede o espaço disponível. Envie os arquivos antes de sair.');return {__marcaiFile:true,name:value.name,mime:value.type,data:base64(new Uint8Array(await value.arrayBuffer()))};}
 if(Array.isArray(value))return Promise.all(value.map(v=>pack(v,budget)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).filter(([,v])=>typeof v!=='function').map(async([k,v])=>[k,await pack(v,budget)])));
 return value;
}
function unpack(value:any):any{if(value?.__marcaiFile===true)return new File([bytes(value.data)],value.name,{type:value.mime});if(Array.isArray(value))return value.map(unpack);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpack(v)]));return value;}
export async function loadEmployeeDraft(scope:string):Promise<EmployeeDraft|null>{
 const id=await storageId(scope),record=await stored<RecordValue|undefined>('readonly',s=>s.get(id));if(!record)return null;
 const secret=await key(id,false);if(record.expiresAt<=Date.now()||!secret){await stored('readwrite',s=>s.delete(id));return null;}
 try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:new TextEncoder().encode(scope)},secret,record.cipher);const value=unpack(JSON.parse(new TextDecoder().decode(plain))) as EmployeeDraft;
 for(const draft of Object.values(value.evidenceDrafts??{}))if(draft.signed&&draft.file)draft.getSignatureBlob=async()=>draft.file;
 return value;
 }catch{await stored('readwrite',s=>s.delete(id));return null;}
}
export function saveEmployeeDraft(scope:string,value:EmployeeDraft){
 const started=epoch,version=versions.get(scope)??0;
 const captured=Promise.all(Object.entries(value.evidenceDrafts).map(async([id,draft])=>{const blob=draft.signed&&draft.getSignatureBlob?await draft.getSignatureBlob():null;return [id,{...draft,...(blob?{file:new File([blob],'assinatura.png',{type:'image/png'})}:{})}];}));
 const task=(queues.get(scope)??Promise.resolve()).catch(()=>{}).then(async()=>{
  const id=await storageId(scope),secret=await key(id,true);if(!secret)return;
  const evidenceDrafts=Object.fromEntries(await captured);
  const plain=new TextEncoder().encode(JSON.stringify(await pack({...value,evidenceDrafts},{bytes:0}))),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(scope)},secret,plain);
  if(started!==epoch||version!==(versions.get(scope)??0))return;
  await stored('readwrite',s=>{if(started!==epoch||version!==(versions.get(scope)??0))throw new Error('O contexto mudou.');return s.put({expiresAt:Date.now()+86400000,iv,cipher},id);});
 });
 queues.set(scope,task);void task.finally(()=>{if(queues.get(scope)===task)queues.delete(scope);}).catch(()=>{});return task;
}
export async function removeEmployeeDraft(scope:string){versions.set(scope,(versions.get(scope)??0)+1);await queues.get(scope)?.catch(()=>{});const id=await storageId(scope);await stored('readwrite',s=>s.delete(id));sessionStorage.removeItem(prefix+id);}
export async function clearEmployeeDrafts(){epoch++;await Promise.allSettled([...queues.values()]);for(let i=sessionStorage.length-1;i>=0;i--){const k=sessionStorage.key(i);if(k?.startsWith(prefix))sessionStorage.removeItem(k);}localStorage.setItem('marcai-employee-session',String(Date.now()));await stored('readwrite',s=>s.clear());}
