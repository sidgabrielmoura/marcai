-- Apply through the existing deployment's migration procedure, before the code.
-- No data deletion, extension installation or PostgreSQL memory changes.
SET lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS scheduled_job_states (
  name text PRIMARY KEY, "leaseToken" text, "leaseUntil" timestamptz,
  "lastStartedAt" timestamptz, "lastCompletedAt" timestamptz, "lastSuccessAt" timestamptz,
  "nextAttemptAt" timestamptz, failures integer NOT NULL DEFAULT 0, cursor text,
  "lastResult" jsonb, "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "scheduled_job_states_nextAttemptAt_idx" ON scheduled_job_states("nextAttemptAt");
CREATE INDEX IF NOT EXISTS process_executions_routine_latest_idx ON process_executions("routineId", "scheduledAt" DESC);
CREATE INDEX IF NOT EXISTS process_executions_due_idx ON process_executions(status, "availableAt", id);
CREATE INDEX IF NOT EXISTS tasks_sla_work_idx ON tasks(status, "slaDueAt", id);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON notifications("organizationId", "userId", "readAt", "createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS activity_logs_action_entity_idx ON activity_logs(action, "entityId");
CREATE INDEX IF NOT EXISTS activity_logs_entity_latest_idx ON activity_logs("organizationId", "entityType", "entityId", "createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS mobile_events_replay_cursor_idx ON mobile_events(organization_id, transaction_id, id);
CREATE INDEX IF NOT EXISTS mobile_events_retention_idx ON mobile_events(created_at, id);
RESET lock_timeout;
