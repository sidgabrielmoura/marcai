BEGIN;
CREATE TABLE mobile_sessions (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 member_id text NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
 installation_id uuid NOT NULL, proof text, credential_version text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mobile_sessions_user ON mobile_sessions(user_id);
CREATE TABLE mobile_refresh_tokens (
 hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
 consumed_at timestamptz, request_key uuid, response text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mobile_challenges (
 id uuid PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mobile_job_cursors(job text PRIMARY KEY, cursor text NOT NULL DEFAULT '', touched_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mobile_rate_limits (key text PRIMARY KEY, window_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0);
CREATE TABLE mobile_installations (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 session_id uuid REFERENCES mobile_sessions(id) ON DELETE CASCADE,
 platform text NOT NULL CHECK(platform IN ('ios','android')), environment text NOT NULL,
 token text UNIQUE NOT NULL, address_type text NOT NULL DEFAULT 'token' CHECK(address_type IN ('token','fid')), permission text NOT NULL, app_version text NOT NULL,
 last_sync_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE mobile_requests (
 user_id text NOT NULL, organization_id text NOT NULL, key uuid NOT NULL,
 fingerprint text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, organization_id, key)
);
CREATE TABLE mobile_blobs (
 key uuid PRIMARY KEY, bytes bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mobile_uploads (
 id uuid PRIMARY KEY, user_id text NOT NULL, organization_id text NOT NULL,
 task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, field_id text, requirement_id text,
 round_id text NOT NULL, name text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size > 0 AND size <= 12582912),
 expires_at timestamptz NOT NULL, attachment jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mobile_upload_chunks (
 upload_id uuid NOT NULL REFERENCES mobile_uploads(id) ON DELETE CASCADE,
 part integer NOT NULL CHECK(part>=0 AND part<24), bytes bytea NOT NULL CHECK(octet_length(bytes)<=1048576),
 PRIMARY KEY(upload_id,part)
);
CREATE TABLE mobile_events (
 id bigserial PRIMARY KEY, transaction_id bigint NOT NULL DEFAULT txid_current(),
 organization_id text NOT NULL, user_id text, task_id text, execution_id text,
 kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mobile_events_replay ON mobile_events(organization_id,transaction_id);
CREATE TABLE mobile_push_outbox (
 id text PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'QUEUED', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_id uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), last_error text
);
CREATE INDEX mobile_push_due ON mobile_push_outbox(state,available_at);
CREATE TABLE mobile_push_deliveries (
 notification_id text NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 installation_id text NOT NULL, token_hash text NOT NULL,
 state text NOT NULL DEFAULT 'QUEUED', attempts integer NOT NULL DEFAULT 0,
 provider_id text, error_code text, accepted_at timestamptz, received_at timestamptz, opened_at timestamptz,
 PRIMARY KEY(notification_id,installation_id)
);
CREATE TABLE mobile_alert_cycles (
 task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 cycle text NOT NULL, milestone text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(task_id,cycle,milestone)
);
CREATE FUNCTION mobile_notification_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  INSERT INTO mobile_push_outbox(id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO mobile_events(organization_id,user_id,kind) VALUES(NEW."organizationId",NEW."userId",'NOTIFICATIONS_CHANGED');
 RETURN NEW;
END $$;
CREATE TRIGGER mobile_notification_created AFTER INSERT OR UPDATE OF "readAt" ON notifications FOR EACH ROW EXECUTE FUNCTION mobile_notification_event();
CREATE FUNCTION mobile_task_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO mobile_events(organization_id,task_id,kind) VALUES(COALESCE(NEW."organizationId",OLD."organizationId"),COALESCE(NEW.id,OLD.id),'TASK_CHANGED');
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER mobile_task_changed AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION mobile_task_event();
CREATE FUNCTION mobile_assignment_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text; oid text; uid text;
BEGIN
 tid := COALESCE(NEW."taskId",OLD."taskId");
 SELECT "organizationId" INTO oid FROM tasks WHERE id=tid;
 SELECT "userId" INTO uid FROM organization_members WHERE id=COALESCE(NEW."memberId",OLD."memberId");
 IF oid IS NOT NULL THEN
 INSERT INTO mobile_events(organization_id,user_id,task_id,kind) VALUES(oid,uid,tid,'TASK_CHANGED');
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER mobile_assignment_changed AFTER INSERT OR UPDATE OR DELETE ON task_assignments FOR EACH ROW EXECUTE FUNCTION mobile_assignment_event();
CREATE FUNCTION mobile_execution_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO mobile_events(organization_id,execution_id,kind) VALUES(COALESCE(NEW."organizationId",OLD."organizationId"),COALESCE(NEW.id,OLD.id),'EXECUTION_CHANGED');
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER mobile_execution_changed AFTER INSERT OR UPDATE OR DELETE ON process_executions FOR EACH ROW EXECUTE FUNCTION mobile_execution_event();
CREATE FUNCTION mobile_evidence_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text; oid text;
BEGIN
 SELECT r."taskId",t."organizationId" INTO tid,oid FROM task_evidence_requirements r JOIN tasks t ON t.id=r."taskId" WHERE r.id=COALESCE(NEW."requirementId",OLD."requirementId");
 IF oid IS NOT NULL THEN INSERT INTO mobile_events(organization_id,task_id,kind) VALUES(oid,tid,'TASK_CHANGED'); END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER mobile_evidence_changed AFTER INSERT OR UPDATE OR DELETE ON evidence_submissions FOR EACH ROW EXECUTE FUNCTION mobile_evidence_event();
CREATE FUNCTION mobile_approval_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text; oid text;
BEGIN
 SELECT w."taskId",t."organizationId" INTO tid,oid FROM approval_workflows w JOIN tasks t ON t.id=w."taskId" WHERE w.id=COALESCE(NEW."workflowId",OLD."workflowId");
 IF oid IS NOT NULL THEN INSERT INTO mobile_events(organization_id,task_id,kind) VALUES(oid,tid,'TASK_CHANGED'); END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER mobile_approval_changed AFTER INSERT OR UPDATE OR DELETE ON approval_steps FOR EACH ROW EXECUTE FUNCTION mobile_approval_event();
UPDATE notification_deliveries SET status='LEGACY_PROVIDER_ACCEPTED_SOME' WHERE channel='PUSH' AND status='DELIVERED';
UPDATE notification_deliveries SET status='LEGACY_UNVERIFIED' WHERE channel='PUSH' AND status='SENT';
COMMIT;
