"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Ably from "ably";
import {acceptResourceChange,dispatchResourceChange,routeNeedsChange,setResourceContext,subscribeAppliedChanges} from "@/presentation/realtime/resource-events";
import {shareTabTransport} from "@/presentation/realtime/tab-transport";

export interface RealtimeEventHandler {
  (eventType: string, data: any): void;
}

const DOMAIN_EVENT_TYPES = [
  "SYNC_REQUIRED",
  "TASK_STARTED",
  "TASK_COMPLETED",
  "TASK_SUBMITTED",
  "TASK_PAUSED",
  "TASK_RESUMED",
  "TASK_CANCELLED",
  "TASK_ASSIGNED",
  "TASK_TRANSFERRED",
  "EXECUTION_AVAILABLE",
  "EXECUTION_COMPLETED",
  "EXECUTION_CANCELLED",
  "NOTIFICATION_CREATED",
  "TASK_OCCURRENCE_CREATED",
  "MEMBER_AVAILABILITY_CHANGED",
];

/**
 * Hook para escutar eventos em tempo real com Ably (e fallback via SSE).
 * Atualiza automaticamente as rotas e exibe notificações instantaneamente.
 */
export function useRealtimeEvents(onEvent?: RealtimeEventHandler, enabled = true) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let isDisposed = false;
    let ablyClient: Ably.Realtime | null = null;
    let sseSource: EventSource | null = null;
    let sseRetryTimeout: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    const pendingChanges = new Map<string,string[]>();
    let sequence=0;
    const stopApplied=subscribeAppliedChanges(id=>{pendingChanges.delete(id);dirty=pendingChanges.size>0;});
    let sharing: ReturnType<typeof shareTabTransport> | null = null;
    let initializing = false;
    let generation = 0;
    let contextKey: string | null = null;
    let cursor: string | null = null;
    let scopeVersion: string | null = null;
    let sseFailures = 0;
    let sseOpenedAt: number | null = null;
    let unauthorized = false;
    const authorizations = new Set<AbortController>();

    function flushRefresh() {
      refreshTimer = null;
      if (isDisposed || document.hidden || !dirty) return;
      if (refreshingRef.current) { refreshTimer = setTimeout(flushRefresh, 250); return; }
      dirty = false;
      const kinds = [...new Set([...pendingChanges.values()].flat())]; pendingChanges.clear();
      const handled = dispatchResourceChange({kinds});
      if (unauthorized || (!handled && routeNeedsChange(window.location?.pathname ?? '/tasks', kinds))) startTransition(() => router.refresh());
    }

    function queueRefresh(kinds: string[] = ["ALL"],id?:string) {
      pendingChanges.set(id??'local:'+sequence++,kinds);
      dirty = true;
      if (!document.hidden && !refreshTimer) refreshTimer = setTimeout(flushRefresh, 350);
    }

    function checkpoint(payload: any) {
      if (typeof payload?.cursor === "string") cursor = payload.cursor;
      if (typeof payload?.scopeVersion === "string") scopeVersion = payload.scopeVersion;
    }

    function closeSSE() {
      sseSource?.close();
      sseSource = null;
      if (sseRetryTimeout) clearTimeout(sseRetryTimeout);
      sseRetryTimeout = null;
    }

    function handleEvent(eventType: string, payload: any) {
      if (isDisposed || document.hidden) return;
      checkpoint(payload);
      if (handlerRef.current) {
        handlerRef.current(eventType, payload);
      }
      const kinds = eventKinds(eventType,payload);
      sharing?.publish({kinds,changeId:payload?.changeId ?? payload?.notificationId});
      queueRefresh(kinds,payload?.changeId??payload?.notificationId);
    }
    function eventKinds(eventType: string,payload: any): string[] {
      if (Array.isArray(payload?.kinds) && payload.kinds.length && payload.kinds.every((k: string) => ["ALL","TASK_CHANGED","EXECUTION_CHANGED","NOTIFICATIONS_CHANGED"].includes(k))) return payload.kinds;
      if(eventType === 'NOTIFICATION_CREATED') return ['NOTIFICATIONS_CHANGED',...(payload?.data?.taskId?['TASK_CHANGED']:[]),...(payload?.data?.executionId?['EXECUTION_CHANGED']:[])];
      if(eventType.startsWith('TASK_'))return ['TASK_CHANGED'];
      if(eventType.startsWith('EXECUTION_'))return ['EXECUTION_CHANGED'];
      return ['ALL'];
    }

    type Authorization = {protocol:2; tokenRequest:Ably.TokenRequest; scopeVersion:string; contextKey:string};
    async function authorize() {
      const authorization = new AbortController(); authorizations.add(authorization);
      try {
        const response = await fetch('/api/ably/token?protocol=2',{cache:'no-store',signal:authorization.signal});
        if(isDisposed || document.hidden || authorization.signal.aborted)throw Error('Inactive');
        if(!response.ok){
          if(response.status===401||response.status===403){unauthorized=true;sharing?.publish({kinds:['ALL']});closeSSE();queueRefresh();}
          throw Error('Authorization unavailable');
        }
        const value: Authorization | Ably.TokenRequest = await response.json();
        if(isDisposed || document.hidden || authorization.signal.aborted)throw Error('Inactive');
        if('protocol' in value && value.protocol===2){
          if((contextKey && contextKey!==value.contextKey)||(scopeVersion && scopeVersion!==value.scopeVersion)){
            unauthorized=true;sharing?.publish({kinds:['ALL']});closeSSE();queueRefresh();throw Error('Context changed');
          }
          contextKey=value.contextKey;scopeVersion=value.scopeVersion;setResourceContext(contextKey);
          return value;
        }
        return {tokenRequest:value as Ably.TokenRequest};
      } finally {authorizations.delete(authorization);}
    }
    function initAbly() {
      if(isDisposed||document.hidden||unauthorized||ablyClient||sharing||initializing)return;
      initializing=true;
      const currentGeneration=generation;
      void authorize().then(value=>{
        if(isDisposed||document.hidden||generation!==currentGeneration)return;
        const authorizedAt=Date.now();
        const start=()=>{
          if(isDisposed||document.hidden)return ()=>{};
          let stopped=false;
          const waited=Date.now()-authorizedAt;
          void (waited>60000?authorize():Promise.resolve(value)).then(current=>{
            if(stopped||isDisposed||document.hidden)return;
            if(waited>1000)queueRefresh();
            connectAbly(current.tokenRequest);
          }).catch(()=>{if(!stopped)connectSSE();});
          return ()=>{stopped=true;const previous=ablyClient;ablyClient=null;previous?.close();closeSSE();};
        };
        if('contextKey' in value){
          sharing=shareTabTransport(value.contextKey,start,hint=>{
            if(acceptResourceChange(hint.changeId))handleEvent('SYNC_REQUIRED',hint);
          });
        }else start(); // Rolling deployment with an older backend.
      }).catch(()=>{if(!isDisposed&&!document.hidden&&!unauthorized)connectSSE();})
        .finally(()=>{if(generation===currentGeneration)initializing=false;});
    }
    function connectAbly(initial: Ably.TokenRequest) {
      if(ablyClient||isDisposed||document.hidden)return;
      let first: Ably.TokenRequest | null = initial;
      let capability: Record<string,string[]> = JSON.parse(initial.capability||'{}');
      let connectedBefore=false;
      try {
        const client=new Ably.Realtime({autoConnect:false,authCallback:(_,callback)=>{
          if(isDisposed||document.hidden){callback('Inactive',null);return;}
          if(first){const token=first;first=null;callback(null,token);return;}
          void authorize().then(value=>{
            if(ablyClient!==client){callback('Session changed',null);return;}
            capability=JSON.parse(value.tokenRequest.capability||'{}');
            callback(null,value.tokenRequest);
          }).catch(()=>callback('Authorization unavailable',null));
        }});
        ablyClient=client;
        const subscribed=new Set<string>();
        client.connection.on('connected',()=>{
          if(isDisposed||document.hidden||ablyClient!==client)return;
          closeSSE();sseFailures=0;
          if(connectedBefore)queueRefresh();
          connectedBefore=true;
          const clientId=client.auth.clientId||initial.clientId;
          const channels=Object.keys(capability);
          const orgs=new Set(channels.filter(n=>n.startsWith('org:')&&n.endsWith(':notifications')).map(n=>n.slice(4,-14)));
          for(const name of channels){
            if(subscribed.has(name))continue;
            subscribed.add(name);
            const channel=client.channels.get(name);
            let attachedBefore=false;
            channel.on('attached',change=>{
              if(attachedBefore&&change.resumed===false&&ablyClient===client)queueRefresh();
              attachedBefore=true;
            });
            void channel.subscribe(message=>{
              if(ablyClient!==client||isDisposed||document.hidden)return;
              const payload=message.data;
              if(payload?.organizationId&&!orgs.has(payload.organizationId))return;
              if(payload?.userId&&payload.userId!==clientId)return;
              const id=payload?.changeId||payload?.notificationId||message.id;
              if(!acceptResourceChange(id))return;
              const type=message.name==='notification:new'?'NOTIFICATION_CREATED':message.name||'SYNC_REQUIRED';
              handleEvent(type,{...payload,changeId:id});
            }).catch(()=>{subscribed.delete(name);if(ablyClient===client&&!isDisposed)connectSSE();});
          }
        });
        const fallback=()=>{
          if(ablyClient!==client||isDisposed||document.hidden)return;
          if([401,403].includes(client.connection.errorReason?.statusCode??0)){unauthorized=true;closeSSE();queueRefresh();return;}
          connectSSE();
        };
        client.connection.on('failed',fallback);client.connection.on('suspended',fallback);
        client.connect();
      }catch{connectSSE();}
    }

    // 2. Conexão SSE de fallback
    function connectSSE() {
      if (isDisposed || document.hidden || unauthorized || sseSource || sseFailures >= 6) return;
      try {
        const params = new URLSearchParams();
        if (cursor) params.set("cursor", cursor);
        if (scopeVersion) params.set("scopeVersion", scopeVersion);
        sseOpenedAt = null;
        const source = new EventSource(`/api/events?${params}`);
        sseSource = source;
        // Opening HTTP is not recovery. Short, repeatedly failing streams must
        // retain their backoff and eventually stop until online/visibility reset.
        source.onopen = () => { if (sseSource === source) sseOpenedAt = Date.now(); };
        sseSource.addEventListener("checkpoint", ((e: MessageEvent) => {
          try { checkpoint(JSON.parse(e.data)); if (sseOpenedAt !== null && Date.now() - sseOpenedAt >= 10_000) sseFailures = 0; } catch { /* Invalid checkpoint. */ }
        }) as EventListener);
        sseSource.addEventListener("revoked", () => {
          unauthorized = true;
          closeSSE();
          queueRefresh();
        });

        sseSource.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            handleEvent(
              parsed.type || "UNKNOWN",
              parsed.payload !== undefined ? parsed.payload : parsed
            );
          } catch {
            // ignore malformed
          }
        };

        for (const type of DOMAIN_EVENT_TYPES) {
          sseSource.addEventListener(type, ((e: MessageEvent) => {
            try {
              const parsed = JSON.parse(e.data);
              handleEvent(
                type,
                parsed.payload !== undefined ? parsed.payload : parsed
              );
            } catch {
              // ignore
            }
          }) as EventListener);
        }

        sseSource.onerror = () => {
          if (sseSource !== source) return;
          if (sseOpenedAt !== null && Date.now() - sseOpenedAt >= 20_000) sseFailures = 0;
          if (sseSource) {
            sseSource.close();
            sseSource = null;
          }
          if (!isDisposed && !document.hidden && !unauthorized) {
            sseFailures++;
            sseRetryTimeout = setTimeout(() => { sseRetryTimeout = null; connectSSE(); }, Math.min(30_000, 2_000 * 2 ** Math.min(sseFailures, 4)));
          }
        };
      } catch {
        // Fallback silencioso
      }
    }

    function visibilityChanged() {
      if (document.hidden) {
        generation++;initializing=false;
        for (const authorization of authorizations) authorization.abort();
        authorizations.clear();
        sharing?.close(); sharing=null;
        closeSSE();
        const client = ablyClient;
        ablyClient = null;
        client?.close();
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = null;
      } else {
        sseFailures = 0;
        queueRefresh();
        initAbly();
      }
    }

    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("online", visibilityChanged);
    initAbly();

    return () => {
      isDisposed = true;
      stopApplied();
      for (const authorization of authorizations) authorization.abort();
      authorizations.clear();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("online", visibilityChanged);
      sharing?.close(); sharing=null;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (ablyClient) {
        try {
          ablyClient.close();
        } catch {
          // ignore
        }
        ablyClient = null;
      }
      closeSSE();
    };
  }, [router, enabled, startTransition]);
}
