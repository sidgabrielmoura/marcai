import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { Priority } from "@/domain/types";
import { prisma } from "@/infrastructure/database/prisma";
import { sendWebPushNotification, type SendPushResult } from "@/infrastructure/firebase/firebase-admin";
import { publishRealtimeNotification } from "@/infrastructure/realtime/ably";
import { sendOperationalAlertEmail } from "@/infrastructure/email";
import { eligibleRecipient } from "./recipient";
import { validInstallationSession } from "@/application/mobile/security";
import { notificationTransaction } from "./transaction";
export interface SendNotificationParams {
    organizationId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    priority?: Priority;
    data?: Record<string, unknown>;
    channels?: Array<"INTERNAL" | "EMAIL" | "PUSH">;
    clickAction?: string;
    forcePush?: boolean;
}
export const PUSH_ELIGIBLE_TYPES = new Set([
    "TASK_ASSIGNED",
    "TASK_COMPLETED",
    "TASK_UNBLOCKED",
    "TASK_TOLERANCE_EXCEEDED",
    "APPROVAL_UPDATED",
    "APPROVAL_OVERDUE",
    "TASK_CANCELLED",
    "TASK_TRANSFERRED_OUT",
    "EXECUTION_COMPLETED",
    "TASK_OVERDUE",
    "TASK_EXPIRING_SOON",
    "SLA_BREACH",
    "APPROVAL_REQUESTED",
    "TASK_CORRECTION_REQUESTED",
    "PAUSE_ALERT",
    "CRITICAL_TASK_ALERT",
    "OPERATIONAL_ALERT",
    "VALIDATION_EXCEPTION",
    "IMPEDIMENT_REPORTED",
    "APPROVAL_PENDING",
    "DEADLINE_WARNING",
    "PROCESS_STALLED",
]);
export function isPushEligible(type: string, priority?: string): boolean {
    if (priority === "CRITICAL" || priority === "HIGH") {
        if (PUSH_ELIGIBLE_TYPES.has(type))
            return true;
    }
    return PUSH_ELIGIBLE_TYPES.has(type);
}
export interface DispatchNotificationAsyncParams {
    organizationId: string;
    userIds: string[];
    type: string;
    title: string;
    message: string;
    priority?: Priority | string;
    data?: Record<string, unknown>;
    clickAction?: string;
    forcePush?: boolean;
    forceEmail?: boolean;
}
/** Dispatch only IDs created and committed by the current mutation; never scan the old queue. */
export async function dispatchPersistedNotifications(ids: string[]): Promise<void> {
    const whatsappSent = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = [...new Set(ids.slice(offset, offset + 100))];
        const claimed = await prisma.$queryRaw<Array<{
            id: string;
        }>> `
      UPDATE mobile_push_outbox SET state='IMMEDIATE_PROCESSING',attempts=attempts+1
      WHERE id IN (${Prisma.join(batch)}) AND state='QUEUED' RETURNING id
    `;
        if (!claimed.length)
            continue;
        const notices = await prisma.notification.findMany({
            where: { id: { in: claimed.map(row => row.id) } }, include: { deliveries: true },
        });
        for (const notice of notices) {
            let status = 'FAILED';
            let errors: string[] = [];
            let attempted = 0;
            try {
                if (!await eligibleRecipient(notice)) {
                    status = 'SKIPPED_ACCESS_CHANGED';
                }
                else {
                    const data = (notice.data || {}) as Record<string, string>;
                    const url = data.taskId ? '/tasks/' + encodeURIComponent(data.taskId) : '/notifications';
                    await publishRealtimeNotification({
                        ...notice, data, notificationId: notice.id, changeId: notice.id, clickAction: url,
                    });
                    const pushAllowed = notice.deliveries.some(d => d.channel === 'PUSH') ||
                        (!notice.deliveries.length && isPushEligible(notice.type, notice.priority));
                    if (pushAllowed) {
                        const web = data.testInstallationId ? [] : await prisma.$queryRaw<Array<{
                            token: string;
                            sessionId: string;
                        }>> `
              SELECT t.token,t.session_id::text AS "sessionId" FROM user_device_tokens t
              JOIN web_auth_sessions s ON s.id=t.session_id AND s.user_id=t."userId"
              JOIN users u ON u.id=s.user_id AND u.status='ACTIVE'
              JOIN organization_members m ON m.id=s.member_id AND m."userId"=s.user_id
                AND m."organizationId"=s.organization_id AND m.status='ACTIVE'
              WHERE t."userId"=${notice.userId} AND s.organization_id=${notice.organizationId}
                AND s.revoked_at IS NULL AND s.expires_at>now()
                AND s.credential_version=encode(sha256(convert_to(COALESCE(u."passwordHash",'') || ':' || COALESCE(m."pinHash",''),'UTF8')),'hex')
                AND t."lastUsedAt">now()-interval '45 days'
            `;
                        const native = await prisma.$queryRaw<Array<{
                            id: string;
                            token: string;
                            sessionId: string;
                            addressType: "token" | "fid";
                        }>> `
              SELECT id::text,token,session_id::text AS "sessionId",address_type AS "addressType" FROM mobile_installations
              WHERE user_id=${notice.userId} AND organization_id=${notice.organizationId}
                AND revoked_at IS NULL AND permission IN ('authorized','provisional')
                AND last_sync_at>now()-interval '45 days'
                AND (${data.testInstallationId || null}::text IS NULL OR id::text=${data.testInstallationId || null})
            `;
                        const results: SendPushResult[] = [];
                        const sessions = new Map<string, string[]>();
                        for (const device of web)
                            sessions.set(device.sessionId, [...(sessions.get(device.sessionId) || []), device.token]);
                        for (const [sessionId, tokens] of sessions)
                            results.push(await sendWebPushNotification({
                                tokens, title: 'Tarefaí', body: 'Há uma atualização para você.', platform: 'web',
                                data: { notificationId: notice.id, changeId: notice.id, sessionId }, clickAction: url,
                            }));
                        for (const device of native) {
                            if (!await validInstallationSession(device.sessionId))
                                continue;
                            const result = await sendWebPushNotification({
                                tokens: [device.token], title: notice.title, body: notice.message, platform: 'native', addressType: device.addressType,
                                data: { ...data, notificationId: notice.id, changeId: notice.id, organizationId: notice.organizationId, type: notice.type }, clickAction: url,
                            });
                            results.push(result);
                            await prisma.$executeRaw `INSERT INTO mobile_push_deliveries(notification_id,installation_id,token_hash,state,attempts,accepted_at,error_code)
                VALUES(${notice.id},${device.id},${createHash('sha256').update(device.token).digest('hex')},${result.successCount ? 'PROVIDER_ACCEPTED' : 'TRANSIENT_FAILURE'},1,${result.successCount ? new Date() : null},${result.errors[0] || null})
                ON CONFLICT(notification_id,installation_id) DO NOTHING`;
                        }
                        const accepted = results.reduce((sum, result) => sum + result.successCount, 0);
                        const failed = results.reduce((sum, result) => sum + result.failureCount, 0);
                        attempted = accepted + failed;
                        errors = results.flatMap(result => result.errors);
                        status = !results.length ? 'SKIPPED_NO_DEVICES' : accepted ? failed ? 'PARTIAL_FAILURE' : 'PROVIDER_ACCEPTED' : 'FAILED';
                        const invalid = [...new Set(results.flatMap(result => result.invalidTokens))];
                        if (invalid.length) {
                            await prisma.userDeviceToken.deleteMany({ where: { token: { in: invalid } } });
                            await prisma.$executeRaw `UPDATE mobile_installations SET revoked_at=now() WHERE token IN (${Prisma.join(invalid)})`;
                        }
                    }
                    else
                        status = 'SKIPPED_POLICY';
                    if (notice.priority === 'CRITICAL' || notice.deliveries.some(d => d.channel === 'EMAIL')) {
                        const user = await prisma.user.findUnique({ where: { id: notice.userId }, select: { email: true } });
                        const delivery = notice.deliveries.find(d => d.channel === 'EMAIL');
                        if (user?.email) {
                            const organization = await prisma.organization.findUnique({ where: { id: notice.organizationId }, select: { name: true } });
                            const result = await sendOperationalAlertEmail(user.email, { orgName: organization?.name || 'Tarefaí', title: notice.title, message: notice.message, priority: notice.priority, actionUrl: url, actionLabel: 'Abrir no Tarefaí' });
                            if (delivery)
                                await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: result.success ? 'PROVIDER_ACCEPTED' : 'FAILED', error: result.success ? null : 'email/provider-rejected' } });
                        }
                        else if (delivery)
                            await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'SKIPPED_NO_EMAIL' } });
                    }
                }
            }
            catch (error) {
                errors.push(safePushError(error));
                console.error('[Push] Falha no processamento:', safePushError(error));
            }

            // WhatsApp: Desacoplado de push/email e da elegibilidade do usuário interno, avaliado por organização com fail-safe
            try {
                const data = (notice.data || {}) as Record<string, string>;
                const url = data.taskId ? '/tasks/' + encodeURIComponent(data.taskId) : '/notifications';
                const whatsappKey = JSON.stringify([notice.organizationId, notice.type, notice.title, notice.message, data]);
                if (!whatsappSent.has(whatsappKey)) {
                    whatsappSent.add(whatsappKey);
                    const { registerOperationalAlert } = await import('@/application/whatsapp/alerts');
                    await registerOperationalAlert({
                        organizationId: notice.organizationId,
                        type: notice.type,
                        title: notice.title,
                        message: notice.message,
                        priority: notice.priority,
                        actionUrl: url,
                        taskId: data.taskId,
                        executionId: data.executionId,
                        locationId: data.locationId,
                        milestoneStep: typeof data.milestone === 'number' ? data.milestone : undefined,
                        taskTitle: data.taskTitle,
                    });
                }
            }
            catch (whatsappError) {
                console.warn('[WhatsApp] Falha ao registrar alerta operacional:', whatsappError);
            }
            if (errors.length)
                console.error('[Push] Resultado do provedor:', [...new Set(errors)]);
            const existing = notice.deliveries.find(d => d.channel === 'PUSH');
            const delivery = { status, error: errors.length ? [...new Set(errors)].join(';').slice(0, 500) : null, sentAt: attempted ? new Date() : null, attempts: attempted };
            if (existing)
                await prisma.notificationDelivery.update({ where: { id: existing.id }, data: delivery });
            else
                await prisma.notificationDelivery.create({ data: { notificationId: notice.id, channel: 'PUSH', ...delivery } });
            await prisma.$executeRaw `UPDATE mobile_push_outbox SET state=${status},last_error=${delivery.error} WHERE id=${notice.id}`;
        }
    }
}
function safePushError(error: unknown): string {
    const code = (error as {
        code?: unknown;
    })?.code;
    return typeof code === 'string' && /^[a-zA-Z0-9_/-]{1,100}$/.test(code) ? code : 'push/processing-failed';
}
export async function sendNotification(params: SendNotificationParams) {
    const channels = [...new Set(params.channels || ['INTERNAL', 'PUSH', 'EMAIL'])]
        .filter(channel => channel !== 'PUSH' || params.forcePush !== false);
    if (params.forcePush === true && !channels.includes('PUSH')) channels.push('PUSH');
    return notificationTransaction(tx => tx.notification.create({ data: {
            organizationId: params.organizationId, userId: params.userId, type: params.type, title: params.title, message: params.message,
            priority: params.priority || Priority.MEDIUM, data: params.data as Prisma.InputJsonValue | undefined,
            deliveries: { create: channels.map(channel => ({ channel, status: 'QUEUED' })) },
        }, include: { deliveries: true } }));
}
/** Compatibility entry point: persist once, then deliver after commit. */
export async function dispatchNotificationAsync(params: DispatchNotificationAsyncParams) {
    const channels = ['INTERNAL'];
    if (params.forcePush ?? isPushEligible(params.type)) channels.push('PUSH');
    if (params.forceEmail || params.priority === 'CRITICAL') channels.push('EMAIL');
    await notificationTransaction(async tx => {
        for (const userId of new Set(params.userIds.filter(Boolean))) {
            await tx.notification.create({data: {
                userId, organizationId: params.organizationId, type: params.type, title: params.title, message: params.message,
                priority: (params.priority || Priority.MEDIUM) as Priority, data: params.data as Prisma.InputJsonValue | undefined,
                deliveries: {create: channels.map(channel => ({channel,status:'QUEUED'}))},
            }});
        }
    });
}
