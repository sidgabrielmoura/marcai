import { EventEmitter } from "node:events";

export type DomainEventType =
  | "TASK_STARTED"
  | "TASK_COMPLETED"
  | "TASK_PAUSED"
  | "TASK_RESUMED"
  | "TASK_CANCELLED"
  | "TASK_ASSIGNED"
  | "TASK_TRANSFERRED"
  | "EXECUTION_AVAILABLE"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_CANCELLED"
  | "NOTIFICATION_CREATED"
  | "TASK_OCCURRENCE_CREATED"
  | "MEMBER_AVAILABILITY_CHANGED";

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  type: DomainEventType;
  organizationId: string;
  timestamp: string;
  payload: T;
}

class OperationalEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Aumenta o limite para múltiplos clientes conectados via SSE
    this.emitter.setMaxListeners(200);
  }

  /**
   * Publica um evento no barramento (Item 36).
   * Notifica assinantes da organização correspondente.
   */
  public publish<T = Record<string, unknown>>(
    type: DomainEventType,
    organizationId: string,
    payload: T
  ): void {
    const event: DomainEvent<T> = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      organizationId,
      timestamp: new Date().toISOString(),
      payload,
    };

    // Emite para o canal específico da organização e canal global
    this.emitter.emit(`org:${organizationId}`, event);
    this.emitter.emit("all", event);
  }

  /**
   * Assina eventos de uma organização específica.
   * Retorna função de cancelamento (unsubscribe).
   */
  public subscribe(
    organizationId: string,
    listener: (event: DomainEvent) => void
  ): () => void {
    const channel = `org:${organizationId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }
}

// Singleton isolado em memória (Item 36)
const globalForEvents = globalThis as unknown as { operationalEventBus?: OperationalEventBus };

export const eventBus = globalForEvents.operationalEventBus ?? new OperationalEventBus();

if (process.env.NODE_ENV !== "production") {
  globalForEvents.operationalEventBus = eventBus;
}
