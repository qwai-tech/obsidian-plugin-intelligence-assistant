/** Fail closed on stale, skipped, partial, or artifact-mismatched real release evidence. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const latest=async()=>JSON.parse(await fs.readFile('tests/e2e/reports/real-release/latest.json','utf8')).dir;
const dir=path.resolve(process.argv[2]||await latest());
const read=async file=>JSON.parse(await fs.readFile(path.join(dir,file),'utf8'));
const run=await read('run.json'),result=await read('runner-result.json');
if(run.preflight)throw Error('A diagnostic preflight is not a complete release gate');
if(result.exitCode!==0)throw Error('The real release runner did not succeed');
if(run.mocks!==false||run.defaultReasoning!==true)throw Error('Release mode must use a real service and default reasoning');
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(run.gitCommit!==head)throw Error('Evidence belongs to a different source commit');
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw Error('Tracked source or test files changed during the gate');
const provenance=await read('artifact-provenance.json');if(provenance.mode!=='production'||provenance.gitCommit!==head)throw Error('Production build provenance does not match');
for(const [file,expected] of Object.entries(provenance.inputs))if(createHash('sha256').update(await fs.readFile(file)).digest('hex')!==expected)throw Error(`Build input changed after verification: ${file}`);
for(const [name,expected] of Object.entries(run.artifacts)){
 for(const file of [name,path.join(dir,'bundle',name)])if(createHash('sha256').update(await fs.readFile(file)).digest('hex')!==expected)throw Error(`Tested asset changed: ${name}`);
}
const expected={
 'Release real chat':'real-chat',
 'Release real agent':'real-agent',
 'Release large agentic task':'large-task',
 'Release single long-running large task':'long-task',
};
const reports=await fs.readdir(path.join(dir,'junit'));const found=new Set();
for(const name of reports.filter(n=>n.endsWith('.xml'))){
 const full=path.join(dir,'junit',name);if((await fs.stat(full)).mtimeMs<run.startedAt-1000)throw Error('Stale JUnit report');
 const xml=await fs.readFile(full,'utf8');
 if(/<(?:skipped|failure|error)\b/.test(xml))throw Error(`Release tests failed or skipped: ${name}`);
 for(const match of xml.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g)){
  const suite=/\bname="([^"]+)"/.exec(match[1])?.[1];if(!Object.hasOwn(expected,suite||''))continue;
  if(found.has(suite))throw Error(`Duplicate release suite evidence: ${suite}`);
  if(!/<testcase\b/.test(match[2]))throw Error(`Empty release suite: ${suite}`);
  for(const key of ['failures','errors','skipped'])if(Number(new RegExp(`\\b${key}="(\\d+)"`).exec(match[1])?.[1]||0)!==0)throw Error(`Nonzero ${key}: ${suite}`);
  found.add(suite);
 }
}
const cases=[];
for(const [suite,id] of Object.entries(expected)){
 if(!found.has(suite))throw Error(`Missing successful real release evidence: ${suite}`);
 const evidence=await read(`cases/${id}/case.json`);if(!evidence.passed||evidence.suite!==suite||evidence.capturedAt<run.startedAt)throw Error(`Invalid case evidence: ${id}`);
 if(JSON.stringify(evidence.installedHashes)!==JSON.stringify(run.artifacts))throw Error(`Running Obsidian used different assets: ${id}`);
 const conversation=await read(`cases/${id}/conversation.json`);const assistant=conversation.messages.filter(m=>m.role==='assistant').at(-1);if(!assistant?.content||assistant.stopped)throw Error(`No finished real assistant response: ${id}`);
 if(id!=='real-chat'&&assistant.agentTask?.lastRun?.outcome!=='answered')throw Error(`Agent did not finish its run: ${id}`);
 if(id==='real-chat'&&!(assistant.tokenUsage?.totalTokens>0))throw Error('Real chat did not record actual usage');
 if(id==='real-agent'&&!conversation.messages.flatMap(m=>m.agentExecutionSteps||[]).some(s=>s.type==='action'&&s.status==='success'&&s.toolName==='read_file'))throw Error('No actual successful Agent read');
 if(id==='large-task'){
  const product=await read(`cases/${id}/products.json`);for(const name of ['alpha.md','beta.md','gamma.md','index.md'])if(!product.files.some(f=>f.path===name))throw Error(`Missing linked-note artifact: ${name}`);
 }
 if(id==='long-task'){
  if(!assistant.content.includes('RELEASE_LONG_TASK_DONE'))throw Error('Long task did not report completion');
  const product=await read(`cases/${id}/products.json`),m=product.metrics;
  if(!m.completed||m.clock!=='agent-journal'||m.execution?.outcome!=='answered'||m.elapsedMin<run.workload.minutes||m.expectedNotes!==run.workload.notes||m.minimumWords!==run.workload.words)throw Error('Long run did not fulfill its original target');
  if(m.execution.successfulChecks<run.workload.notes)throw Error('Long task did not use the real per-note measurement tool');
  const index=product.files.find(f=>f.path==='index.md');if(!index)throw Error('Long-task index is missing');
  const notes=product.files.filter(f=>/^note_\d+\.md$/.test(f.path));if(notes.length!==run.workload.notes)throw Error('Long task is incomplete');
  for(let i=1;i<=run.workload.notes;i++){const stem=`note_${String(i).padStart(3,'0')}`,file=notes.find(f=>f.path===stem+'.md');if(!file||file.words<run.workload.words||!new RegExp(`\\[\\[${stem}(?:\\.md)?(?:\\|[^\\]]*)?\\]\\]`).test(index.content))throw Error(`Long artifact/word/link check failed: ${stem}`);}
 }
 cases.push({suite,id,status:'passed'});
}
let requests=[],preflights=[];
if(run.serviceAudit){
 const lines=(await fs.readFile(run.serviceAudit,'utf8')).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));const observed=lines.filter(r=>r.startedAt>=run.startedAt&&r.startedAt<=result.finishedAt);
 // Browser CORS probes carry no Authorization and may receive 401 before the
 // production transport falls back to Obsidian's native HTTP implementation.
 // Preserve every probe, but validate actual application requests separately.
 preflights=observed.filter(r=>r.method==='OPTIONS');requests=observed.filter(r=>r.method!=='OPTIONS');
 if(!requests.length||requests.some(r=>r.status<200||r.status>=300||r.aborted||r.thinkingOverridePresent||r.reasoningEffortOverridePresent))throw Error('Real service audit contains failed/aborted/non-default-reasoning calls');
 await fs.writeFile(path.join(dir,'service-audit.json'),JSON.stringify(observed,null,2));
}
await fs.writeFile(path.join(dir,'verification.json'),JSON.stringify({status:'passed',runId:run.runId,gitCommit:head,version:run.version,artifacts:run.artifacts,cases,realServiceRequests:requests.length,browserPreflightRequests:preflights.length,defaultReasoning:true,mocks:false,verifiedAt:Date.now()},null,2));
console.log(JSON.stringify({status:'passed',runId:run.runId,cases:cases.length,realServiceRequests:requests.length,artifactBound:true,published:false}));
