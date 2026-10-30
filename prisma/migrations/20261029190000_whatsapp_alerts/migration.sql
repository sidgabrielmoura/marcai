-- CreateTable
CREATE TABLE "whatsapp_alert_occurrences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "taskId" TEXT,
    "executionId" TEXT,
    "incidentKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "priority" TEXT,
    "milestoneStep" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMPTZ(6),
    "repeatInterval" INTEGER NOT NULL DEFAULT 0,
    "repeatCount" INTEGER NOT NULL DEFAULT 0,
    "nextRepeatAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_alert_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_alert_deliveries" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "instanceId" TEXT,
    "session" TEXT,
    "recipientPhone" TEXT NOT NULL,
    "recipientName" TEXT,
    "chatId" TEXT,
    "round" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "suppressionReason" TEXT,
    "scheduledFor" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "readAt" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "providerMessageIdHash" TEXT,
    "providerAck" INTEGER,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_alert_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_alert_occurrences_organizationId_status_nextRepeat_idx" ON "whatsapp_alert_occurrences"("organizationId", "status", "nextRepeatAt");

-- CreateIndex
CREATE INDEX "whatsapp_alert_occurrences_taskId_status_idx" ON "whatsapp_alert_occurrences"("taskId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_alert_occurrences_organizationId_incidentKey_key" ON "whatsapp_alert_occurrences"("organizationId", "incidentKey");

-- CreateIndex
CREATE INDEX "whatsapp_alert_deliveries_organizationId_status_scheduledFo_idx" ON "whatsapp_alert_deliveries"("organizationId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "whatsapp_alert_deliveries_providerMessageIdHash_idx" ON "whatsapp_alert_deliveries"("providerMessageIdHash");

-- CreateIndex
CREATE INDEX "whatsapp_alert_deliveries_status_leaseUntil_idx" ON "whatsapp_alert_deliveries"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_alert_deliveries_occurrenceId_recipientPhone_round_key" ON "whatsapp_alert_deliveries"("occurrenceId", "recipientPhone", "round");

-- AddForeignKey
ALTER TABLE "whatsapp_alert_occurrences" ADD CONSTRAINT "whatsapp_alert_occurrences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_alert_occurrences" ADD CONSTRAINT "whatsapp_alert_occurrences_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_alert_occurrences" ADD CONSTRAINT "whatsapp_alert_occurrences_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_alert_deliveries" ADD CONSTRAINT "whatsapp_alert_deliveries_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "whatsapp_alert_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_alert_deliveries" ADD CONSTRAINT "whatsapp_alert_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_alert_deliveries" ADD CONSTRAINT "whatsapp_alert_deliveries_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_alert_deliveries" ADD CONSTRAINT "whatsapp_alert_deliveries_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
