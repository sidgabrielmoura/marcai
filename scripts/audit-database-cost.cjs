// Opt-in, bounded production diagnostics. No application rows, secrets or SQL
// parameters are exported. Every statement runs in a read-only transaction.
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  if (!process.argv.includes('--read-only')) throw new Error('Pass --read-only to inspect the configured database.');
  require('dotenv').config({ quiet: true });
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, application_name: 'tarefai-cost-audit-read-only' });
  const report = { collectedAt: new Date().toISOString(), readOnly: true, results: {}, unavailable: [] };
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const queries = {
      database: `SELECT current_setting('server_version') AS version, pg_database_size(current_database()) AS bytes, pg_postmaster_start_time() AS started_at`,
      stats: `SELECT stats_reset, xact_commit, xact_rollback, blks_read, blks_hit, temp_files, temp_bytes, deadlocks FROM pg_stat_database WHERE datname=current_database()`,
      tables: `SELECT relname, n_live_tup, n_dead_tup, seq_scan, idx_scan, last_autoanalyze, last_autovacuum, pg_total_relation_size(relid) AS bytes FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 40`,
      indexes: `SELECT relname, indexrelname, idx_scan, pg_relation_size(indexrelid) AS bytes FROM pg_stat_user_indexes ORDER BY pg_relation_size(indexrelid) DESC LIMIT 60`,
      activity: `SELECT application_name, state, wait_event_type, count(*)::int AS connections, max(extract(epoch FROM now()-xact_start))::int AS oldest_transaction_seconds FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY application_name,state,wait_event_type`,
      settings: `SELECT name, setting, reset_val, unit FROM pg_settings WHERE name IN ('max_connections','shared_buffers','work_mem','idle_in_transaction_session_timeout','statement_timeout') ORDER BY name`,
      extensions: `SELECT extname, extversion FROM pg_extension ORDER BY extname`,
      activity24h: `SELECT action, count(*)::int AS events FROM activity_logs WHERE "createdAt">now()-interval '24 hours' GROUP BY action ORDER BY events DESC LIMIT 30`,
      taskStates: `SELECT status, count(*)::int AS records FROM tasks GROUP BY status ORDER BY records DESC`,
      mobileEvents: `SELECT count(*)::int AS records, count(*) FILTER(WHERE created_at>now()-interval '1 hour')::int AS last_hour FROM mobile_events`,
      outboxStates: `SELECT state,count(*)::int AS records FROM mobile_push_outbox GROUP BY state`,
      uploadStorage: `SELECT count(*)::int AS uploads,count(*) FILTER(WHERE expires_at<now() AND attachment IS NULL)::int AS expired_incomplete,count(*) FILTER(WHERE attachment IS NOT NULL)::int AS finalized FROM mobile_uploads`,
      statements: `SELECT queryid::text, calls, round(total_exec_time::numeric,2) AS total_ms, round(mean_exec_time::numeric,2) AS mean_ms, rows, shared_blks_hit, shared_blks_read, temp_blks_written, regexp_replace(regexp_replace(left(query,2000), '''([^'']|'''')*''', '?', 'g'), '\\m[0-9]+\\M', '?', 'g') AS shape FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT ILIKE '%pg_stat_statements%' ORDER BY total_exec_time DESC LIMIT 25`,
      statementWindow: `SELECT stats_reset FROM pg_stat_statements_info`,
    };
    for (const [name, sql] of Object.entries(queries)) {
      await client.query('SAVEPOINT audit_section');
      try { report.results[name] = (await client.query(sql)).rows; }
      catch (error) { await client.query('ROLLBACK TO SAVEPOINT audit_section'); report.unavailable.push({ section: name, code: error.code }); }
      await client.query('RELEASE SAVEPOINT audit_section');
    }
    await client.query('ROLLBACK');
  } finally { await client.end(); }
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex !== -1) {
    const destination = path.resolve(process.argv[outputIndex + 1]);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ collectedAt: report.collectedAt, readOnly: true, sections: Object.keys(report.results), unavailable: report.unavailable, output: destination }));
  } else console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(JSON.stringify({ error: 'Read-only audit failed', code: error.code || error.name })); process.exitCode=1; });
