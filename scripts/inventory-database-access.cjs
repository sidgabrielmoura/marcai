const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
const calls=[];
const routes=[];
const methods=new Set(['findMany','findFirst','findUnique','count','aggregate','groupBy','$queryRaw','$executeRaw','create','createMany','update','updateMany','upsert','delete','deleteMany']);
function walk(directory) {
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory()) {if(!['generated','node_modules'].includes(entry.name))walk(absolute);continue;}
    if(!/\.tsx?$/.test(entry.name)||/\.test\.|\.d\.ts$/.test(entry.name))continue;
    const file=path.relative(root,absolute).replaceAll('\\','/');
    const source=ts.createSourceFile(file,fs.readFileSync(absolute,'utf8'),ts.ScriptTarget.Latest,true);
    if(file.startsWith('src/app/api/')&&entry.name==='route.ts')routes.push(file);
    function visit(node) {
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)) {
        const method=node.expression.name.text, receiver=node.expression.expression.getText(source);
        if(methods.has(method)&&/\b(prisma|tx|db)\b/.test(receiver)) {
          const first=node.arguments[0];
          const properties=first&&ts.isObjectLiteralExpression(first)?first.properties.map(property=>property.name?.getText(source)):[];
          calls.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,method,receiver,bounded:method==='findMany'?properties.includes('take'):null,projection:properties.includes('select')?'select':properties.includes('include')?'include':'scalar/indirect'});
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
}
walk(path.join(root,'src'));
const output=path.join(root,'docs/audits/database-efficiency');fs.mkdirSync(output,{recursive:true});
const report={generatedAt:new Date().toISOString(),scope:'Static inventory; dynamic spreads/helpers/raw tagged templates require manual review, and a missing take is not itself a defect.',routes:routes.sort(),calls};
fs.writeFileSync(path.join(output,'inventory.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({routes:routes.length,callSites:calls.length,findMany:calls.filter(c=>c.method==='findMany').length,findManyWithoutLiteralTake:calls.filter(c=>c.method==='findMany'&&!c.bounded).length}));
