-- Additive scheduling metadata. No domain row or existing event is deleted.
CREATE TABLE IF NOT EXISTS operational_agenda (
 organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('ROUTINES','EXECUTIONS','DEPENDENCIES','TASKS','APPROVALS','REPORTS')),
 next_run_at timestamptz NOT NULL, revision bigint NOT NULL DEFAULT 0,
 failures integer NOT NULL DEFAULT 0, last_completed_at timestamptz,
 PRIMARY KEY(organization_id,phase)
);
CREATE INDEX IF NOT EXISTS operational_agenda_due_idx ON operational_agenda(next_run_at,organization_id,phase);
CREATE TABLE IF NOT EXISTS operational_signals (
 id bigserial PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('ROUTINES','EXECUTIONS','DEPENDENCIES','TASKS','APPROVALS','REPORTS')), transaction_id bigint NOT NULL DEFAULT txid_current(),
 available_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT operational_signals_transaction_key UNIQUE(organization_id,phase,transaction_id)
);
CREATE INDEX IF NOT EXISTS operational_signals_due_idx ON operational_signals(available_at,id);
CREATE INDEX IF NOT EXISTS operational_signals_phase_idx ON operational_signals(organization_id,phase,available_at,id);

-- Append per transaction instead of locking shared agenda rows while domain
-- transactions hold task/execution locks. Rollback removes its signals too.
CREATE OR REPLACE FUNCTION operational_signal_org(oid text, phases text[]) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO operational_signals(organization_id,phase)
 SELECT o.id,p FROM organizations o CROSS JOIN unnest(phases) p
 WHERE o.id=oid AND o.status='ACTIVE'
 ON CONFLICT(organization_id,phase,transaction_id) DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION operational_signal_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE value jsonb; oid text; old_value jsonb; new_value jsonb;
BEGIN
 old_value:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 new_value:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' AND (old_value-'updatedAt') IS NOT DISTINCT FROM (new_value-'updatedAt') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='activity_logs' AND COALESCE(new_value->>'action','') NOT IN ('TASK_EXPIRING_SOON','APPROVAL_DEADLINE_EXCEEDED') AND COALESCE(old_value->>'action','') NOT IN ('TASK_EXPIRING_SOON','APPROVAL_DEADLINE_EXCEEDED') THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_NAME='task_occurrences' AND NOT (
   COALESCE(new_value->>'type','')='SLA_BREACH' OR COALESCE(old_value->>'type','')='SLA_BREACH' OR
   COALESCE(new_value->>'category','')='UNASSIGNED_TIMEOUT' OR COALESCE(old_value->>'category','')='UNASSIGNED_TIMEOUT'
 ) THEN RETURN COALESCE(NEW,OLD); END IF;
 FOR value IN SELECT v FROM (VALUES(old_value),(new_value)) rows(v) WHERE v IS NOT NULL LOOP
  oid:=NULL;
  CASE TG_ARGV[0]
   WHEN 'direct' THEN oid:=value->>'organizationId';
   WHEN 'organization' THEN oid:=value->>'id';
   WHEN 'process' THEN SELECT "organizationId" INTO oid FROM processes WHERE id=value->>'processId';
   WHEN 'routine' THEN SELECT p."organizationId" INTO oid FROM routines r JOIN processes p ON p.id=r."processId" WHERE r.id=value->>'routineId';
   WHEN 'task' THEN SELECT "organizationId" INTO oid FROM tasks WHERE id=value->>'taskId';
   WHEN 'workflow' THEN SELECT t."organizationId" INTO oid FROM approval_workflows w JOIN tasks t ON t.id=w."taskId" WHERE w.id=value->>'workflowId';
   WHEN 'member' THEN SELECT "organizationId" INTO oid FROM organization_members WHERE id=value->>'memberId';
   WHEN 'team-member' THEN SELECT "organizationId" INTO oid FROM organization_members WHERE id=value->>'organizationMemberId';
  END CASE;
  IF oid IS NOT NULL THEN
   PERFORM operational_signal_org(oid,string_to_array(TG_ARGV[1],','));
  END IF;
 END LOOP;
 IF TG_TABLE_NAME='organizations' AND TG_OP='UPDATE' AND new_value->>'status'<>'ACTIVE' THEN
  DELETE FROM operational_agenda WHERE organization_id=new_value->>'id';
  DELETE FROM operational_signals WHERE organization_id=new_value->>'id';
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;

DROP TRIGGER IF EXISTS operational_signal ON organizations;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON organizations FOR EACH ROW EXECUTE FUNCTION operational_signal_change('organization','ROUTINES,EXECUTIONS,DEPENDENCIES,TASKS,APPROVALS,REPORTS');

DROP TRIGGER IF EXISTS operational_signal ON processes;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON processes FOR EACH ROW EXECUTE FUNCTION operational_signal_change('direct','ROUTINES,EXECUTIONS,DEPENDENCIES,TASKS');

DROP TRIGGER IF EXISTS operational_signal ON routines;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON routines FOR EACH ROW EXECUTE FUNCTION operational_signal_change('process','ROUTINES');

DROP TRIGGER IF EXISTS operational_signal ON routine_exceptions;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON routine_exceptions FOR EACH ROW EXECUTE FUNCTION operational_signal_change('routine','ROUTINES');

DROP TRIGGER IF EXISTS operational_signal ON process_executions;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON process_executions FOR EACH ROW EXECUTE FUNCTION operational_signal_change('direct','ROUTINES,EXECUTIONS,DEPENDENCIES,TASKS');

DROP TRIGGER IF EXISTS operational_signal ON tasks;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION operational_signal_change('direct','TASKS,DEPENDENCIES');

DROP TRIGGER IF EXISTS operational_signal ON task_assignments;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON task_assignments FOR EACH ROW EXECUTE FUNCTION operational_signal_change('task','TASKS,DEPENDENCIES');

DROP TRIGGER IF EXISTS operational_signal ON task_dependencies;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON task_dependencies FOR EACH ROW EXECUTE FUNCTION operational_signal_change('task','DEPENDENCIES,TASKS');

DROP TRIGGER IF EXISTS operational_signal ON task_occurrences;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON task_occurrences FOR EACH ROW EXECUTE FUNCTION operational_signal_change('task','TASKS');

DROP TRIGGER IF EXISTS operational_signal ON approval_workflows;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON approval_workflows FOR EACH ROW EXECUTE FUNCTION operational_signal_change('task','ROUTINES,DEPENDENCIES,TASKS,APPROVALS');

DROP TRIGGER IF EXISTS operational_signal ON approval_steps;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON approval_steps FOR EACH ROW EXECUTE FUNCTION operational_signal_change('workflow','APPROVALS,DEPENDENCIES,TASKS');

DROP TRIGGER IF EXISTS operational_signal ON scheduled_reports;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON scheduled_reports FOR EACH ROW EXECUTE FUNCTION operational_signal_change('direct','REPORTS');

DROP TRIGGER IF EXISTS operational_signal ON organization_members;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON organization_members FOR EACH ROW EXECUTE FUNCTION operational_signal_change('direct','ROUTINES,DEPENDENCIES,TASKS,APPROVALS');

DROP TRIGGER IF EXISTS operational_signal ON member_location_accesses;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON member_location_accesses FOR EACH ROW EXECUTE FUNCTION operational_signal_change('member','ROUTINES,DEPENDENCIES,TASKS');

DROP TRIGGER IF EXISTS operational_signal ON team_members;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON team_members FOR EACH ROW EXECUTE FUNCTION operational_signal_change('team-member','ROUTINES,DEPENDENCIES,TASKS');

DROP TRIGGER IF EXISTS operational_signal ON locations;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON locations FOR EACH ROW EXECUTE FUNCTION operational_signal_change('direct','ROUTINES,EXECUTIONS,DEPENDENCIES,TASKS');

DROP TRIGGER IF EXISTS operational_signal ON teams;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON teams FOR EACH ROW EXECUTE FUNCTION operational_signal_change('direct','ROUTINES,DEPENDENCIES,TASKS');

DROP TRIGGER IF EXISTS operational_signal ON activity_logs;
CREATE TRIGGER operational_signal AFTER INSERT OR UPDATE OR DELETE ON activity_logs FOR EACH ROW EXECUTE FUNCTION operational_signal_change('direct','TASKS,APPROVALS');

CREATE OR REPLACE FUNCTION operational_user_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid text;
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status THEN
  FOR oid IN SELECT DISTINCT "organizationId" FROM organization_members WHERE "userId"=NEW.id ORDER BY "organizationId" LOOP
   PERFORM operational_signal_org(oid,ARRAY['ROUTINES','DEPENDENCIES','TASKS','APPROVALS']);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS operational_user_signal ON users;
CREATE TRIGGER operational_user_signal AFTER UPDATE OF status ON users FOR EACH ROW EXECUTE FUNCTION operational_user_change();

-- Bootstrap metadata only. Reapplying does not reset completed scheduling state.
INSERT INTO operational_agenda(organization_id,phase,next_run_at)
SELECT o.id,p,now() FROM organizations o CROSS JOIN unnest(ARRAY['ROUTINES','EXECUTIONS','DEPENDENCIES','TASKS','APPROVALS','REPORTS']) p
WHERE o.status='ACTIVE' ON CONFLICT(organization_id,phase) DO NOTHING;
