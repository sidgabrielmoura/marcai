ALTER TABLE whatsapp_instances
  ADD COLUMN "connectedPhone" text,
  ADD COLUMN "connectedName" text,
  ADD COLUMN "statusEventAt" timestamptz(6),
  ADD COLUMN revision integer NOT NULL DEFAULT 0,
  ADD COLUMN "operationToken" uuid,
  ADD COLUMN "operationUntil" timestamptz(6),
  ADD COLUMN "configHash" text;
CREATE TABLE whatsapp_webhook_events (
  id text PRIMARY KEY,
  "instanceId" text NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE ON UPDATE CASCADE,
  event text NOT NULL,
  "occurredAt" timestamptz(6) NOT NULL,
  data jsonb NOT NULL,
  "publishedAt" timestamptz(6),
  "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "whatsapp_webhook_events_instanceId_publishedAt_createdAt_idx"
  ON whatsapp_webhook_events("instanceId","publishedAt","createdAt");
CREATE INDEX "whatsapp_webhook_events_createdAt_idx" ON whatsapp_webhook_events("createdAt");
