/** Real Manifold transport diagnostics. No endpoint, response or clock substitutes. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const mode=process.argv[2]||'all';
const key=process.env.IA_REAL_API_KEY;if(!key&&mode!=='validate-existing')throw Error('IA_REAL_API_KEY required; no mock fallback');
const out=path.resolve(process.env.IA_REAL_RESULTS||'test-results/long-task-reliability-2026-11-04');await fs.mkdir(out,{recursive:true});
const scratch=await fs.mkdtemp(path.join(tmpdir(),'ia-live-timeouts-'));const require=createRequire(import.meta.url);
const bundle=path.join(scratch,'production.cjs');
await build({stdin:{contents:await fs.readFile('tests/real/architecture-exports.ts.txt','utf8'),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent',external:['obsidian']});const p=require(bundle);
const old=path.join(scratch,'baseline.cjs');await build({stdin:{contents:await fs.readFile(path.join(out,'baseline/resilient-http.ts.txt'),'utf8'),resolveDir:path.resolve('packages/obsidian-llm/src'),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:old,logLevel:'silent'});const baseline=require(old);
const base=process.env.IA_REAL_BASE_URL||'http://127.0.0.1:17680/v1';
const body={model:process.env.IA_REAL_MODEL||'deepseek/deepseek-flash',messages:[{role:'user',content:'Produce a complete deterministic test document with exactly 350 numbered rows, starting ROW-001 and ending ROW-350. Each row must contain its row ID followed by the sentence "This is a real streaming transport continuity check with complete numbered source evidence." Do not summarize, use ellipses or skip rows. End with DOCUMENT_COMPLETE. Output the document only.'}],max_tokens:16384,stream:true,stream_options:{include_usage:true}};
assert.equal(body.thinking,undefined);assert.equal(body.reasoning_effort,undefined);
const results=[];
function documentContent(sse){let content='';for(const line of sse.split('\n')){if(!line.startsWith('data: ')||line.trim()==='data: [DONE]')continue;const event=JSON.parse(line.slice(6));for(const c of event.choices??[])content+=c.delta?.content??'';}return content;}
function validateDocument(sse){const content=documentContent(sse);const rows=[...content.matchAll(/^ROW-(\d{3}) /gm)].map(m=>Number(m[1]));assert.deepEqual(rows,Array.from({length:350},(_,i)=>i+1));assert.ok(content.endsWith('DOCUMENT_COMPLETE'));return {rowCount:rows.length,contentCharacters:content.length,complete:true};}
async function run(name,wrap,options={},extra={}){
 const began=Date.now();let requests=0,headersMs,bytes=0,chunks=0,lastMs=0,maxGapMs=0,reader,cancelledAt;
 const live=p.createFetchHttpPort();const raw={request:r=>live.request(r),async stream(r){requests++;const res=await live.stream(r);headersMs=Date.now()-began;return res;}};
 const port=wrap(raw,options);const abort=new AbortController();if(extra.preaborted)abort.abort();
 const requestBody=extra.replay?JSON.parse(await fs.readFile('test-results/free-agent-default-thinking-2026-11-04/uninterrupted/complete/request-85.json','utf8')):body;
 assert.equal(requestBody.thinking,undefined);assert.equal(requestBody.reasoning_effort,undefined);
 const req={url:base+'/chat/completions',method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(requestBody),signal:abort.signal,...extra.request};
 let text='',error;
 try{const response=await port.stream(req);assert.equal(response.status,200,'Real model authentication/route must work');reader=response.body.getReader();for(;;){const r=await reader.read();if(r.done)break;const ms=Date.now()-began;maxGapMs=Math.max(maxGapMs,ms-lastMs);lastMs=ms;bytes+=r.value.length;chunks++;text+=new TextDecoder().decode(r.value);if(extra.cancel&&chunks===5){cancelledAt=Date.now();abort.abort();}}}
 catch(e){error={name:e.name,message:e.message,details:e.details??null};}
 finally{await reader?.cancel().catch(()=>undefined);}
 const result={name,defaultThinking:true,mocks:false,durationMs:Date.now()-began,requests,headersMs,bytes,chunks,maxGapMs,observedCompleteMarker:text.includes('[DONE]'),error,options,requestOverrides:extra.request??{},bodySha256:createHash('sha256').update(req.body).digest('hex'),...(cancelledAt?{abortLatencyMs:Date.now()-cancelledAt}:{})};
 await fs.writeFile(path.join(out,`transport-${name}.json`),JSON.stringify(result,null,2));await fs.writeFile(path.join(out,`transport-${name}.sse.txt`),text);
 if(extra.preaborted){assert.equal(requests,0);assert.equal(error.name,'HttpAbortedError');}
 else if(extra.cancel){assert.equal(requests,1);assert.equal(error.name,'HttpAbortedError');assert.ok(result.abortLatencyMs<2000);}
 else if(extra.expectTimeout){assert.equal(requests,1);assert.equal(error.name,'HttpTimeoutError');assert.equal(result.observedCompleteMarker,false);if(extra.phase)assert.equal(error.details.phase,extra.phase);if(extra.active)assert.ok(bytes>0,'Must reproduce cutoff after genuine response bytes');}
 else{assert.equal(error,undefined,JSON.stringify(error));assert.equal(requests,1);assert.ok(result.observedCompleteMarker);if(!extra.replay){validateDocument(text);assert.ok(result.durationMs>5000,'Real stream must outlive old diagnostic total deadline');}}
 results.push(result);console.log(JSON.stringify(result));return result;
}
if(mode==='validate-existing'){const result=JSON.parse(await fs.readFile(path.join(out,'transport-fixed-active-stream.json'),'utf8'));assert.ok(result.observedCompleteMarker);assert.ok(!result.error);assert.ok(result.durationMs>5000);const verified=validateDocument(await fs.readFile(path.join(out,'transport-fixed-active-stream.sse.txt'),'utf8'));await fs.writeFile(path.join(out,'transport-document-validation.json'),JSON.stringify({method:'Offline parsing of the preserved real SSE capture, after correcting an initial assertion that searched unassembled wire chunks',...verified},null,2));console.log(verified);}
if(mode==='baseline'||mode==='all')await run('baseline-active-cutoff',baseline.withResilience,{timeoutMs:5000},{expectTimeout:true,active:true});
if(mode==='fixed'||mode==='all')await run('fixed-active-stream',p.withResilience,{streamIdleTimeoutMs:10000,streamMaxDurationMs:180000});
if(mode==='controls'||mode==='all'){
 await run('explicit-hard-deadline',p.withResilience,{streamIdleTimeoutMs:10000},{request:{timeoutMs:5000},expectTimeout:true,active:true,phase:'stream_total'});
 await run('real-idle-deadline',p.withResilience,{streamIdleTimeoutMs:1,streamMaxDurationMs:30000},{expectTimeout:true,phase:'stream_idle'});
 await run('user-stop',p.withResilience,{}, {cancel:true});
 await run('already-stopped',p.withResilience,{}, {preaborted:true});
}
if(mode==='replay'||mode==='all')await run('original-request-85-replay',p.withResilience,{}, {replay:true});
await fs.writeFile(path.join(out,`transport-${mode}-results.json`),JSON.stringify({mocks:false,realService:base,defaultThinking:true,diagnosticShortLimits:'The 5-second and 1-ms caps deliberately exercise real cancellation; they are NOT production timeout values.',results},null,2));
