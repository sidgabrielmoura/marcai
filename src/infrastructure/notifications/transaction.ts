import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/infrastructure/database/prisma";
/** Capture only notices created by this transaction; rollback never dispatches. */
export async function notificationTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: {
    timeout?: number;
    maxWait?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
}): Promise<T> {
    const ids: string[] = [];
    const result = await prisma.$transaction(async (tx) => {
        const notifications = new Proxy(tx.notification, {
            get(target, property) {
                if (property === "create")
                    return async (args: Prisma.NotificationCreateArgs) => {
                        const row = await target.create(args);
                        ids.push(row.id);
                        return row;
                    };
                if (property === "createMany")
                    return async (args: Prisma.NotificationCreateManyArgs) => {
                        const rows = await target.createManyAndReturn({ ...args, select: { id: true } });
                        ids.push(...rows.map(row => row.id));
                        return { count: rows.length };
                    };
                const value = Reflect.get(target, property);
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
        return work(new Proxy(tx, { get(target, property) {
                if (property === "notification")
                    return notifications;
                const value = Reflect.get(target, property);
                return typeof value === "function" ? value.bind(target) : value;
            } }));
    }, options);
    if (ids.length) {
        const dispatch = async () => {
            try {
                const { dispatchPersistedNotifications } = await import("./notification-service");
                await dispatchPersistedNotifications(ids);
            }
            catch {
                // Notification transport must never turn a committed mutation into a failure.
                console.error("[Push] Falha ao processar notificações confirmadas.");
            }
        };
        // CLI callers have no Next request lifecycle; they await the same work.
        let scheduled = false;
        try {
            after(dispatch);
            scheduled = true;
        }
        catch { /* No request scope. */ }
        if (!scheduled)
            await dispatch();
    }
    return result;
}
