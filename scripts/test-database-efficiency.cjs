const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const workspace = path.join(root, 'tmp', 'database-efficiency', 'workspace');
const database = 'postgresql://tarefai_test:tarefai_local_only@127.0.0.1:56433/tarefai_efficiency';
const safeKeys = ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA'];
const env = Object.fromEntries(safeKeys.filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
Object.assign(env, { DATABASE_URL: database, DIRECT_URL: database, AUTH_SECRET: 'isolated-tarefai-cost-audit-secret-32-characters', CRON_SECRET: 'isolated-cron-secret', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:31175', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--max-old-space-size=4096', DATABASE_EFFICIENCY_ISOLATED: '1' });
fs.mkdirSync(workspace, { recursive: true });
if (fs.readdirSync(workspace).some(name=>name==='.env'||name.startsWith('.env.'))) throw new Error('The isolated workspace must not contain .env files.');
for (const directory of ['src','scripts','prisma','public']) fs.cpSync(path.join(root,directory),path.join(workspace,directory),{recursive:true});
for (const file of ['package.json','tsconfig.json','next.config.ts','postcss.config.mjs','prisma.config.ts']) fs.copyFileSync(path.join(root,file),path.join(workspace,file));
if (!fs.existsSync(path.join(workspace,'node_modules'))) fs.symlinkSync(path.join(root,'node_modules'),path.join(workspace,'node_modules'),'junction');
const report = { startedAt: new Date().toISOString(), database: 'disposable PostgreSQL 18 on 127.0.0.1:56433', externalCredentialsAvailable: false, checks: [] };
function run(label, args, options={}) {
  const result=spawnSync(process.execPath,args,{cwd:workspace,env,encoding:'utf8',maxBuffer:15*1024*1024,timeout:240000,windowsHide:true,...options});
  fs.writeFileSync(path.join(root,'tmp/database-efficiency',label+'.log'),(result.stdout||'')+(result.stderr||''));
  report.checks.push({name:label,success:result.status===0,exitCode:result.status,...(result.error?{errorCode:result.error.code}: {})});
  console.log(`${label}: ${result.status===0?'PASS':'FAIL'}`);
  if (result.status!==0) throw new Error(`${label} failed; inspect tmp/database-efficiency/${label}.log`);
  return result.stdout;
}
async function main() {
  const client=new Client({connectionString:database,connectionTimeoutMillis:5000});
  await client.connect();
  try {
    const {rows:[server]}=await client.query('SELECT version()');
    if (!server.version.startsWith('PostgreSQL 18.')) throw new Error('Tests require disposable PostgreSQL 18.');
    if (!(await client.query("SELECT to_regclass('public.users') AS relation")).rows[0].relation) {
      const baseline=spawnSync('git',['show','HEAD:prisma/schema.prisma'],{cwd:root,encoding:'utf8',windowsHide:true});
      if (baseline.status!==0) throw new Error('Cannot read the committed baseline schema.');
      fs.writeFileSync(path.join(workspace,'prisma/baseline.prisma'),baseline.stdout);
      const sql=run('baseline-sql',[path.join(root,'node_modules/prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema','prisma/baseline.prisma','--script']);
      await client.query(sql);
      const migration=fs.readFileSync(path.join(root,'prisma/migrations/20261013190000_mobile_employee/migration.sql'),'utf8');
      const triggers=migration.slice(migration.indexOf('CREATE FUNCTION mobile_notification_event()'),migration.indexOf("UPDATE notification_deliveries"));
      if (!triggers.startsWith('CREATE FUNCTION')) throw new Error('Transport trigger extraction failed.');
      await client.query(triggers);
    }
    await client.query(fs.readFileSync(path.join(root,'prisma/migrations/20261021230000_database_efficiency/migration.sql'),'utf8'));
    report.migrationAppliedLocally=true;
  } finally { await client.end(); }
  if (process.argv.includes('--setup')) return;
  const cli=path.join(root,'node_modules/prisma/build/index.js');
  run('generate',[cli,'generate']);
  run('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--incremental','--tsBuildInfoFile','../isolated.tsbuildinfo']);
  if (process.argv.includes('--build')) {
    run('build',[path.join(root,'node_modules/next/dist/bin/next'),'build'],{timeout:600000});
    return;
  }
  for (const script of ['verify-domain-rules.ts','verify-operational-rules.ts','verify-workflow-regressions.ts','verify-task-history.ts','verify-database-efficiency.ts']) {
    run(script.replace('.ts',''),['--import','tsx',path.join(workspace,'scripts',script)]);
  }
  // CLI diff ignores trigger bodies but must find no missing/extra ORM schema objects.
  run('schema-diff',[cli,'migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code']);
}
main().catch(error=>{report.error=error.message;process.exitCode=1;console.error(error.message);}).finally(()=>{
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(root,'tmp/database-efficiency',process.argv.includes('--build')?'build-results.json':'test-results.json'),JSON.stringify(report,null,2));
});
