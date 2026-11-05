/** Independently reconcile saved native reports with actual journals and source hashes. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out=path.resolve('test-results/execution-counts-2026-11-05');
const read=async name=>JSON.parse(await fs.readFile(path.join(out,name),'utf8'));
const vault='/tmp/ia-codex-ux-20261103/vault';
const journalRoot=path.join(vault,'.obsidian/plugins/intelligence-assistant/data/agent-runs');
const actions=m=>(m.agentExecutionSteps??[]).filter(s=>s.type==='action');
const reads=m=>actions(m).filter(s=>s.status==='success'&&s.toolName==='read_file');
const value=m=>JSON.parse(m.content.slice(m.content.lastIndexOf('{'),m.content.lastIndexOf('}')+1));
await fs.mkdir(path.join(out,'journals'),{recursive:true});
await fs.mkdir(path.join(out,'sources'),{recursive:true});
async function journal(reply){
 const id=reply.agentTask.lastRun.id;
 const raw=await fs.readFile(path.join(journalRoot,id+'.jsonl'),'utf8');
 const entries=raw.trim().split('\n').map(l=>JSON.parse(l));const events=entries.map(e=>e.event);
 const actual=events.filter(e=>e.type==='tool_finished'&&e.ok);
 assert.deepEqual(actual.map(e=>({name:e.call.name,args:e.call.arguments})),reads(reply).map(s=>({name:s.toolName,args:s.args})));
 assert.equal(actual.length,reply.agentTask.lastRun.successfulReadFileCalls);
 const terminal=events.filter(e=>e.type==='run_finished');assert.equal(terminal.length,1);assert.equal(terminal[0].reason.kind,reply.agentTask.lastRun.outcome);
 await fs.writeFile(path.join(out,'journals',id+'.jsonl'),raw);
 return {id,actualReads:actual.length,outcome:terminal[0].reason.kind,startedAt:entries[0].at,endedAt:entries.at(-1).at,countGuardRejections:events.filter(e=>e.type==='guard_triggered'&&e.guard==='execution-counts').length};
}
const fixture=await read('native-fixture.json');
const b=await read('native-b-final-conversation.json');
const bReplies=b.messages.filter(m=>m.role==='assistant');assert.deepEqual(bReplies.map(m=>reads(m).length),[50,10,0]);
assert.ok(b.messages.filter(m=>m.role==='user').slice(1).every(m=>m.content==='Continue.'));
assert.deepEqual(await read('native-b-budget.json'),await read('native-b-reloaded-budget.json'));
const bAll=bReplies.flatMap(reads);assert.ok(bReplies.flatMap(actions).every(s=>s.status==='success'&&s.toolName==='read_file'));
assert.deepEqual(bAll.slice(0,40).map(s=>s.args.path),fixture.items.map(i=>i.path));assert.ok(bAll.slice(40).every(s=>s.args.path===fixture.items[0].path));assert.equal(bAll.length,60);
for(const [reply,expected] of [[bReplies[1],10],[bReplies[2],0]]){
 const answer=value(reply);assert.equal(answer.thisRunReads,expected);assert.equal(answer.verificationReads,20);assert.equal(answer.totalItems,40);assert.equal(answer.firstMarker,fixture.items[0].marker);assert.equal(answer.lastMarker,fixture.items.at(-1).marker);
 assert.deepEqual(reply.agentTask.allowedTools,['read_file']);assert.equal(reply.agentTask.observations[0].visits,21);assert.ok(reply.agentTask.observations.slice(1).every(o=>o.visits===1));
 assert.ok(!/(?:withdrawn|retracted|not supported)/i.test(reply.content));
}
assert.match(bReplies[1].content,/50 successful/);assert.match(bReplies[2].content,/10 successful/);
const bJournals=await Promise.all(bReplies.map(journal));
const c=await read('native-c-final-conversation.json');const cReplies=c.messages.filter(m=>m.role==='assistant');assert.deepEqual(cReplies.map(m=>reads(m).length),[12,9]);
assert.equal(cReplies[0].stopped,true);assert.deepEqual(await read('native-c-stopped.json'),await read('native-c-reloaded-idle.json'));
assert.equal(c.messages.filter(m=>m.role==='user')[1].content,'Continue.');
assert.ok(cReplies.flatMap(actions).every(s=>s.status==='success'&&s.toolName==='read_file'&&s.args.path===fixture.items[0].path));
const cAnswer=value(cReplies[1]);assert.equal(cAnswer.thisRunReads,9);assert.equal(cAnswer.verificationReads,20);assert.equal(cAnswer.totalItems,1);assert.equal(cAnswer.firstMarker,fixture.items[0].marker);
assert.equal(cReplies[1].agentTask.observations.length,1);assert.equal(cReplies[1].agentTask.observations[0].visits,21);assert.deepEqual(cReplies[1].agentTask.pending,[]);
assert.match(cReplies[1].content,/12 successful/);assert.match(cReplies[1].content,/9 successful/);assert.match(cReplies[1].content,/21 total visits, of which 20.*11 from.*9 from/);
const cJournals=await Promise.all(cReplies.map(journal));
for(const conversation of [b,c]){assert.equal(conversation.config.maxTokens,6000);assert.equal(conversation.config.modelId,'custom@qa-live:deepseek/deepseek-flash');assert.ok(!('thinking' in conversation.config));assert.ok(!('reasoning_effort' in conversation.config));}
for(const item of fixture.items){const bytes=await fs.readFile(path.join(vault,item.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);const target=path.join(out,'sources',item.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
const aFailure=await read('native-a-zero-failed.json');assert.match(aFailure.messages.at(-1).content,/withdrawn/);
const result={generatedAt:new Date().toISOString(),mocks:false,defaultReasoning:true,status:'passed',nativeB:{method:'Actual 40-source task, 50-step budget halt, native Reload app, bare Continue, then bare Continue after completion',successfulReadStages:[50,10,0],journals:bJournals,finalReported:value(bReplies[2]),resumeReported:value(bReplies[1]),uniqueFiles:40,verificationRereads:20,unnecessaryIntermediatePrefixReads:0,forbiddenCalls:0,previous10ReadReceiptPreserved:true},nativeC:{method:'Exact final artifact; native Stop during verification, native Reload app, bare Continue; no injected abort/controller',successfulReadStages:[12,9],journals:cJournals,reported:cAnswer,uniqueFiles:1,verificationRereads:20,persistedStopUnchangedOnReload:true,previous12ReadReceiptPreserved:true},unchangedSourceHashes:40,intermediateFailurePreserved:'Initial native A zero-work continuation falsely withdrew a valid prior 16-read count; raw response and screenshot remain. Final B zero-work continuation preserves its prior 10-read receipt.',budgetStatus:'Actual B budget halt is retained; corrected host formatting separately validated by replaying its actual successful-action records.',proseReview:'Checked final B resume, B zero-work and C manual-resume explanations against their actual stage counts and separate saved run receipts; checked all JSON counts independently.',limits:['Count validator checks canonical runtime fields and recognized English prose; it is not a proof of arbitrary domain arithmetic or every language','Native requests were not intercepted; separate real service wire captures assert default reasoning and trailing snapshot ordering','Read-only fixtures do not certify exactly-once external mutations']};
await fs.writeFile(path.join(out,'native-count-audit.json'),JSON.stringify(result,null,2));console.log(result);
