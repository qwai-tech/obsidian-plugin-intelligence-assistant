/** Actual streaming and cancellation against the user's Manifold gateway. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const baseUrl=process.env.IA_REAL_BASE_URL || 'http://127.0.0.1:17680/v1';
const apiKey=process.env.IA_REAL_API_KEY;
assert.ok(apiKey,'IA_REAL_API_KEY required; no simulated responses');
const output=process.env.IA_REAL_RESULTS || 'test-results/codex-ux-fixes-2026-11-03';
await mkdir(output,{recursive:true});
const scratch=await mkdtemp(path.join(tmpdir(),'ia-real-stream-'));
await build({stdin:{contents:`export { ProviderFactory } from './packages/obsidian-llm/src/provider-factory'; export { ModelManager } from './packages/obsidian-llm/src/model-manager'; export { setDefaultHttpPort, createFetchHttpPort } from './packages/obsidian-llm/src/http';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:path.join(scratch,'sdk.cjs'),logLevel:'silent'});
const { ProviderFactory, ModelManager, setDefaultHttpPort, createFetchHttpPort }=createRequire(import.meta.url)(path.join(scratch,'sdk.cjs'));
setDefaultHttpPort(createFetchHttpPort());
const config={provider:'custom',name:'Manifold streaming regression',baseUrl,apiKey};
const models=await ModelManager.getModelsForConfig(config,true);
const model=models.find(m=>m.name===(process.env.IA_REAL_MODEL || 'deepseek/deepseek-flash'));
assert.ok(model,'Real model must be listed by gateway');
const provider=ProviderFactory.createProvider(config);
const checks=[];
for(const key of ['', 'deliberately-invalid-regression-key']) {
    await assert.rejects(()=>ModelManager.getModelsForConfig({...config,apiKey:key,cachedModels:[]},true),/401|403/);
}
checks.push({name:'missing and invalid keys are rejected by the real gateway',status:'passed'});
let content='',chunks=0,usage;
let start=Date.now();
try {
await provider.streamChat({model:model.id,messages:[{role:'user',content:'Write a detailed deployment and recovery guide of 1000–1200 words total in 18 numbered sections (about 55–65 words per section, not more). Include migration, rollback, observability, job checkpoints, idempotency, backups and incident response. Start with LONG_TASK_START and end with LONG_TASK_DONE.'}],maxTokens:Number(process.env.IA_REAL_LONG_MAX_TOKENS || 16384),temperature:0,signal:AbortSignal.timeout(180000)},chunk=>{
    if(chunk.content){content+=chunk.content;chunks++;}
    if(chunk.usage)usage=chunk.usage;
});
assert.match(content,/LONG_TASK_START/);assert.match(content,/LONG_TASK_DONE/);
const words=content.split(/\s+/).length;
assert.ok(words>=900,`Expected a substantial real reply, got ${words} words`);
assert.ok(chunks>10);
checks.push({name:'long real reply reaches its final marker',status:'passed',durationMs:Date.now()-start,words,chunks,usage,maxTokens:Number(process.env.IA_REAL_LONG_MAX_TOKENS || 16384)});
await writeFile(path.join(output,'long-real-reply.txt'),content);
} catch(error) {
  checks.push({name:'long real reply reaches its final marker',status:'failed',durationMs:Date.now()-start,words:content.split(/\s+/).length,characters:content.length,error:error.message});
  await writeFile(path.join(output,'long-real-reply-partial.txt'),content);
}
const controller=new AbortController();content='';chunks=0;start=Date.now();
try {
    await provider.streamChat({model:model.id,messages:[{role:'user',content:'Write a 4000-word deployment guide. Begin immediately with CANCEL_STREAM_START, then provide detailed numbered sections.'}],maxTokens:8192,signal:controller.signal},chunk=>{
        if(chunk.content){content+=chunk.content;chunks++;}
        if(content.length>=400)controller.abort();
    });
} catch(error) { if(!controller.signal.aborted)throw error; }
assert.ok(controller.signal.aborted,'The real stream must be cancelled after output starts');
assert.ok(content.length>=400);
checks.push({name:'real cancellation after receiving partial model output',status:'passed',durationMs:Date.now()-start,partialCharacters:content.length,chunks});
await writeFile(path.join(output,'streaming-real.json'),JSON.stringify({backend:baseUrl,model:model.name,mocks:false,checks},null,2));
console.log(JSON.stringify(checks));

if(checks.some(check=>check.status==='failed'))process.exitCode=1;
