export const OPERATIONAL_PHASES = ['ROUTINES', 'EXECUTIONS', 'DEPENDENCIES', 'TASKS', 'APPROVALS', 'REPORTS'] as const;
export type OperationalPhase = typeof OPERATIONAL_PHASES[number];
export type OperationalOptions = {
    organizationId?: string;
    phases?: readonly OperationalPhase[];
    stopAt?: number;
    // A durable cursor bounds automatic catch-up to the last successful cycle.
    recoverSince?: Date;
    restartDependencies?: boolean;
};
