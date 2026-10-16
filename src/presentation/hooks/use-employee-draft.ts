"use client";
import {useEffect,useRef,useState} from 'react';
import {loadEmployeeDraft,saveEmployeeDraft,removeEmployeeDraft,type EmployeeDraft} from '@/presentation/lib/employee-drafts';
export function useEmployeeDraft(scope:string,value:EmployeeDraft,restore:(value:EmployeeDraft)=>void,readOnly:boolean){
 const [ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false);
 const latest=useRef(value),discarded=useRef(false);latest.current=value;
 useEffect(()=>{let active=true;discarded.current=false;setReady(false);setError(null);void (readOnly?removeEmployeeDraft(scope).then(()=>null):loadEmployeeDraft(scope)).then(draft=>{if(active){if(draft)restore(draft);setReady(true);}}).catch(()=>{if(active){setError('O rascunho local está indisponível. Mantenha esta tela aberta até enviar.');setReady(true);}});return ()=>{active=false;};},[scope,readOnly]);
 useEffect(()=>{if(!ready||readOnly||discarded.current)return;let active=true;const save=()=>{if(discarded.current)return;setSaving(true);void saveEmployeeDraft(scope,latest.current).then(()=>{if(active)setError(null);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível salvar o rascunho local.');}).finally(()=>{if(active)setSaving(false);});};const timer=setTimeout(save,300);const background=()=>{if(document.visibilityState==='hidden')save();};document.addEventListener('visibilitychange',background);return ()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',background);};},[scope,ready,readOnly,value.formAnswers,value.evidenceDrafts]);
 useEffect(()=>{const changed=(event:StorageEvent)=>{if(event.key==='marcai-employee-session')window.location.reload();};window.addEventListener('storage',changed);return ()=>window.removeEventListener('storage',changed);},[]);
 return {ready,saving,error,discard:async()=>{discarded.current=true;await removeEmployeeDraft(scope);}};
}
