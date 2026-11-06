"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { requestPushNotificationToken } from "@/infrastructure/firebase/firebase-messaging";
import { getPushContextAction, saveDeviceTokenAction } from "@/presentation/actions/push-notification-actions";
export type PushPermissionStatus = "default" | "granted" | "denied" | "unsupported";
const registrations = new Map<string, Promise<boolean>>();
const registeredSessions = new Set<string>();
const registrationTimes = new Map<string, string>();
export function usePushNotifications(sessionId?: string) {
    const [permission, setPermission] = useState<PushPermissionStatus>("default");
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(!!sessionId && registeredSessions.has(sessionId));
    const [error, setError] = useState<string | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(sessionId ? registrationTimes.get(sessionId) ?? null : null);
    const mounted = useRef(true);
    const currentSession = useRef(sessionId);
    currentSession.current = sessionId;
    useEffect(() => {
        mounted.current = true;
        setIsSubscribed(!!sessionId && registeredSessions.has(sessionId));
        setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
        setLastSyncAt(sessionId ? registrationTimes.get(sessionId) ?? null : null);
        const registered = (event: Event) => {
            const next = (event as CustomEvent<string>).detail;
            if (!sessionId || next === sessionId) {
                setIsSubscribed(true);
                setLastSyncAt(registrationTimes.get(next) ?? null);
            }
        };
        window.addEventListener('tarefai:push-registered', registered);
        return () => { mounted.current = false; window.removeEventListener('tarefai:push-registered', registered); };
    }, [sessionId]);
    const subscribe = useCallback(async () => {
        const isCurrent = () => mounted.current && currentSession.current === sessionId;
        setIsSubscribing(true);
        setError(null);
        try {
            // Run the permission prompt directly from the user's click, before network work.
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                await Notification.requestPermission();
            }
            const context = await getPushContextAction();
            if (!context || sessionId && context.sessionId !== sessionId)
                throw new Error('A sessão mudou. Entre novamente.');
            let registration = registrations.get(context.sessionId);
            if (!registration) {
                registration = (async () => {
                    const token = await requestPushNotificationToken();
                    if (!token)
                        throw new Error('Não foi possível ativar as notificações. Confira a permissão e tente novamente.');
                    const result = await saveDeviceTokenAction(token, navigator.userAgent, context.sessionId);
                    if (!result.success)
                        throw new Error(result.error || 'Falha ao registrar notificações.');
                    registeredSessions.add(context.sessionId);
                    registrationTimes.set(context.sessionId, new Date().toISOString());
                    if (registrationTimes.size > 10) registrationTimes.delete(registrationTimes.keys().next().value!);
                    if (registeredSessions.size > 10)
                        registeredSessions.delete(registeredSessions.values().next().value!);
                    window.dispatchEvent(new CustomEvent('tarefai:push-registered', { detail: context.sessionId }));
                    return true;
                })();
                registrations.set(context.sessionId, registration);
            }
            try {
                await registration;
            }
            finally {
                if (registrations.get(context.sessionId) === registration)
                    registrations.delete(context.sessionId);
            }
            if (!isCurrent()) return false;
            setIsSubscribed(true);
            return true;
        }
        catch (error) {
            if (isCurrent()) {
                setIsSubscribed(false);
                setError(error instanceof Error ? error.message : 'Falha ao ativar notificações.');
            }
            return false;
        }
        finally {
            if (isCurrent()) {
                setIsSubscribing(false);
                if (typeof Notification !== 'undefined')
                    setPermission(Notification.permission);
            }
        }
    }, [sessionId]);
    // Checking local permission on focus does not register the device again or read SQL.
    const refresh = useCallback(() => {
        const next = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
        setPermission(next);
        if (next !== 'granted') setIsSubscribed(false);
    }, []);
    return { permission, isSubscribed, isSubscribing, error, subscribe, refresh, lastSyncAt, isSupported: permission !== 'unsupported' };
}
