"use client";
import {useRef} from 'react';
async function fingerprint(value:unknown):Promise<unknown>{
 if(value instanceof File){const bytes=await value.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return {name:value.name,mime:value.type,sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')};}
 if(Array.isArray(value))return Promise.all(value.map(fingerprint));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await fingerprint(v)])));
 return value;
}
export function useSubmissionReceipts(scope:string){
 const entries=useRef({scope,keys:new Map<string,string>()});
 if(entries.current.scope!==scope)entries.current={scope,keys:new Map()};
 return async(operation:string,input:unknown)=>{
  const current=entries.current,key=operation+':'+JSON.stringify(await fingerprint(input));
  if(current!==entries.current)throw new Error('O contexto mudou. Atualize a tarefa.');
  if(!current.keys.has(key))current.keys.set(key,crypto.randomUUID());
  return current.keys.get(key)!;
 };
}
