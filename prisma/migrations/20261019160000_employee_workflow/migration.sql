-- Keep manual management blocks separate from dependency and deadline states.
ALTER TABLE "tasks"
  ADD COLUMN "managementBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "managementBlockReason" TEXT;
