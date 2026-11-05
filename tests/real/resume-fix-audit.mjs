/** Reconcile real native UI actions with saved conversations, journals and immutable sources. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const out=path.resolve('test-results/manual-resume-fixes-2026-11-04');
const vault='/tmp/ia-codex-ux-20261103/vault';
const read=async name=>JSON.parse(await fs.readFile(path.join(out,name),'utf8'));
const actions=m=>(m.agentExecutionSteps??[]).filter(s=>s.type==='action'&&s.status==='success');
const structured=m=>JSON.parse(m.content.slice(m.content.lastIndexOf('{'),m.content.lastIndexOf('}')+1));
await fs.mkdir(path.join(out,'journals'),{recursive:true});
await fs.mkdir(path.join(out,'sources'),{recursive:true});
const journalRoot=path.join(vault,'.obsidian/plugins/intelligence-assistant/data/agent-runs');
const journals=await Promise.all((await fs.readdir(journalRoot)).filter(n=>n.endsWith('.jsonl')).map(async name=>({name,raw:await fs.readFile(path.join(journalRoot,name),'utf8')})));
for(const j of journals)j.events=j.raw.trim().split('\n').map(l=>JSON.parse(l));
const checked=[];
async function audit(label,fixtureName,finalName,stopName,reloadName,total,verifications,stageSizes){
 const fixture=await read(fixtureName),final=await read(finalName),stopped=await read(stopName),reloaded=await read(reloadName);
 assert.deepEqual(stopped,reloaded,'Reload must not mutate or resume a stopped task');
 const users=final.messages.filter(m=>m.role==='user');assert.ok(users.slice(1).every(m=>m.content==='Continue.'));
 const replies=final.messages.filter(m=>m.role==='assistant');assert.deepEqual(replies.map(m=>actions(m).length),stageSizes);
 const calls=replies.flatMap(actions);assert.ok(calls.every(s=>s.toolName==='read_file'));
 const paths=calls.map(s=>s.args.path);assert.deepEqual(paths.slice(0,total),fixture.items.map(i=>i.path));
 assert.ok(paths.slice(total).every(p=>p===fixture.items[0].path),'Verification must not replay the completed intermediate prefix');
 assert.equal(paths.length,total+verifications);
 const task=replies.at(-1).agentTask;assert.equal(task.originalGoal,users[0].content);assert.deepEqual(task.allowedTools,['read_file']);
 assert.equal(task.observations.length,total);assert.equal(task.observations[0].visits,1+verifications);
 assert.ok(task.observations.slice(1).every(o=>o.visits===1));assert.deepEqual(task.pending,[]);
 const stoppedTask=stopped.messages.at(-1).agentTask;assert.equal(stopped.messages.at(-1).stopped,true);
 assert.equal(JSON.parse(stoppedTask.lastObservedRead).path,fixture.items[0].path);
 assert.equal(JSON.parse(stoppedTask.observations.at(-1).arguments).path,fixture.items.at(-1).path);
 const answer=structured(replies.at(-1));assert.equal(answer.firstMarker,fixture.items[0].marker);assert.equal(answer.lastMarker,fixture.items.at(-1).marker);assert.equal(answer.totalItems,total);
 if(label==='C')assert.equal(answer.verificationReads,verifications);
 if(label==='E')assert.notEqual(answer.thisRunReads,stageSizes.at(-1),'Preserve the discovered count-description failure');
 assert.equal(final.config.webSearchEnabled,false);assert.ok(!('thinking' in final.config));assert.ok(!('reasoning_effort' in final.config));
 const matching=[];
 for(const reply of replies){
  const acts=actions(reply);const first=acts[0];
  const found=journals.filter(j=>j.events.some(e=>e.event.type==='tool_started'&&JSON.stringify(e.event.call.arguments)===JSON.stringify(first.args)&&Math.abs(e.at-first.timestamp)<100));
  assert.equal(found.length,1,'Every native action group must match one actual run journal');
  const j=found[0],events=j.events.map(e=>e.event),done=events.filter(e=>e.type==='tool_finished'&&e.ok);
  assert.deepEqual(done.map(e=>({tool:e.call.name,args:e.call.arguments})),acts.map(s=>({tool:s.toolName,args:s.args})));
  const terminal=events.filter(e=>e.type==='run_finished');assert.equal(terminal.length,1);
  assert.equal(terminal[0].reason.kind,reply.stopped?'aborted':'answered');
  await fs.writeFile(path.join(out,'journals',j.name),j.raw);matching.push({file:j.name,successfulReads:done.length,terminal:terminal[0].reason.kind,startedAt:j.events[0].at,finishedAt:j.events.at(-1).at});
 }
 for(const item of fixture.items){const bytes=await fs.readFile(path.join(vault,item.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);const target=path.join(out,'sources',item.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
 checked.push({case:label,status:label==='E'?'execution passed; count description failed':'execution passed',native:true,mocks:false,defaultReasoning:true,uniqueSources:total,deliberateVerificationReads:verifications,actualCalls:paths.length,stages:matching,unchangedSourceHashes:total,unnecessaryIntermediatePrefixReads:0,forbiddenToolCalls:0,reported:answer,stoppedFirstVisits:stoppedTask.observations[0].visits,...(label==='E'?{descriptionFailure:{actualThisRunReads:stageSizes.at(-1),reportedThisRunReads:answer.thisRunReads,actualVerificationReads:verifications,modelVerificationClaim:answer.verificationReads}}:{})});
}
await audit('C','native-fixture.json','native-c-final-conversation.json','native-c-verification-stopped.json','native-c-reloaded-idle.json',40,30,[15,33,22]);
const e=await read('native-e-final-conversation.json');
const es=e.messages.filter(m=>m.role==='assistant').map(m=>actions(m).length);
await audit('E','native-d-fixture.json','native-e-final-conversation.json','native-e-stopped.json','native-e-reloaded-idle.json',12,20,es);
const d=await read('native-d-final-conversation.json');
const dReplies=d.messages.filter(m=>m.role==='assistant');const dAnswer=structured(dReplies.at(-1));
const failedD={case:'D',status:'failed before final counter clarification',actualReads:dReplies.flatMap(actions).length,actualReadsInContinuation:actions(dReplies.at(-1)).length,actualRereads:dReplies.at(-1).agentTask.observations[0].visits-1,reported:dAnswer};
assert.notEqual(failedD.actualReadsInContinuation,dAnswer.thisRunReads);
const scoped=await read('native-c-scope-controls.json');const scopeReply=scoped.messages.at(-1);assert.deepEqual(scopeReply.agentTask.allowedTools,['list_files']);assert.ok(actions(scopeReply).every(s=>s.toolName==='list_files'));assert.equal(scopeReply.agentTask.observations.length,1);
const noTools=await read('native-no-tools-final.json');const nt=noTools.messages.at(-1);assert.deepEqual(nt.agentTask.allowedTools,[]);assert.equal(actions(nt).length,0);assert.ok(nt.content.includes('NO_TOOLS_OK'));
const result={generatedAt:new Date().toISOString(),mocks:false,results:checked,intermediateFailure:failedD,scopeResetControl:'passed: same-conversation distinct task really ran list_files once',noToolsControl:'passed: no tool action',remainingIssue:'RESUME-03: Model descriptions can still double-count host-provided live counters. Final case E actually executed exactly 20 verification re-reads with 13 in the continuation, but claimed 32 and 25 respectively. This is NOT fixed or accepted as accurate output.',initialCaseCNarration:'The initial fix executed correctly but misstated this-continuation counts in prose. D exposed further double-counting and an off-by-one error. Both are preserved. E executes the exact required remaining work, but its count description still contradicts authoritative counters.',limits:['Read-only native sources; no exactly-once mutation guarantee','No process-kill crash recovery test','Native provider requests were not intercepted; default reasoning verified from config and production path, with separate real wire-level controls','Explicit directive grammar is bounded; it is not arbitrary natural-language policy interpretation']};
await fs.writeFile(path.join(out,'native-fix-audit.json'),JSON.stringify(result,null,2));console.log(result);
