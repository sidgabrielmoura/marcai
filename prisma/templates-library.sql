-- Additive upgrade for existing installations without a Prisma migration baseline.
-- Apply with: npx prisma db execute --file prisma/templates-library.sql
BEGIN;
CREATE TABLE IF NOT EXISTS "reusable_process_templates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "jobKey" TEXT NOT NULL DEFAULT 'CUSTOM',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "draftDefinition" JSONB NOT NULL,
  "draftRevision" INTEGER NOT NULL DEFAULT 1,
  "publishedVersionId" TEXT UNIQUE,
  "sourceMetadata" JSONB,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reusable_process_templates_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reusable_process_templates_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','ARCHIVED'))
);
CREATE TABLE IF NOT EXISTS "reusable_process_template_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "definition" JSONB NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reusable_process_template_versions_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "reusable_process_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE ("templateId","version")
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reusable_process_templates_publishedVersionId_fkey') THEN
    ALTER TABLE "reusable_process_templates" ADD CONSTRAINT "reusable_process_templates_publishedVersionId_fkey"
      FOREIGN KEY ("publishedVersionId") REFERENCES "reusable_process_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "reusable_process_templates_organizationId_status_jobKey_idx"
  ON "reusable_process_templates"("organizationId","status","jobKey");
CREATE INDEX IF NOT EXISTS "reusable_process_templates_organizationId_updatedAt_idx"
  ON "reusable_process_templates"("organizationId","updatedAt");
ALTER TABLE "processes" ADD COLUMN IF NOT EXISTS "originReusableTemplateVersionId" TEXT;
ALTER TABLE "processes" ADD COLUMN IF NOT EXISTS "templateOriginSnapshot" JSONB;
ALTER TABLE "processes" ADD COLUMN IF NOT EXISTS "creationRequestId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='processes_originReusableTemplateVersionId_fkey') THEN
    ALTER TABLE "processes" ADD CONSTRAINT "processes_originReusableTemplateVersionId_fkey"
      FOREIGN KEY ("originReusableTemplateVersionId") REFERENCES "reusable_process_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "processes_organizationId_creationRequestId_key"
  ON "processes"("organizationId","creationRequestId");
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "definitionTaskId" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "definitionOrder" INTEGER;
COMMIT;
