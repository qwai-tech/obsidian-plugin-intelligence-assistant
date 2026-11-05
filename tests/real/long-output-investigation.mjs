import assert from 'node:assert/strict';
/** Direct HTTP versus actual production provider, using only real Manifold responses. */
import {build} from 'esbuild';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const key=process.env.IA_REAL_API_KEY;if(!key)throw Error('IA_REAL_API_KEY required; no mock fallback');
const base=process.env.IA_REAL_BASE_URL||'http://127.0.0.1:17680/v1';
const model=process.env.IA_REAL_MODEL||'deepseek/deepseek-flash';
const out=process.env.IA_REAL_RESULTS||'test-results/long-output-investigation-2026-11-04';await fs.mkdir(out,{recursive:true});
const scratch=await fs.mkdtemp(path.join(tmpdir(),'ia-long-investigation-'));
const prompt='Write a detailed deployment and recovery guide of 1000–1200 words total in 18 numbered sections (about 55–65 words per section, not more). Include migration, rollback, observability, job checkpoints, idempotency, backups and incident response. Start with LONG_TASK_START and end with LONG_TASK_DONE.';
await build({stdin:{contents:`export { errorReply } from './src/ui/chat/controllers/chat-reply'; export { OpenAIProvider } from './packages/obsidian-llm/src/providers/openai-provider'; export { ProviderFactory } from './packages/obsidian-llm/src/provider-factory'; export { createFetchHttpPort } from './packages/obsidian-llm/src/http'; export { setLLMRequestObserver } from './packages/obsidian-llm/src/provider-facade';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',plugins:[{name:'unused-host-import',setup(b){b.onResolve({filter:/^obsidian$/},a=>({path:a.path,external:true,sideEffects:false}));}}],outfile:path.join(scratch,'provider.cjs'),logLevel:'silent'});
const {errorReply,OpenAIProvider,ProviderFactory,createFetchHttpPort,setLLMRequestObserver}=createRequire(import.meta.url)(path.join(scratch,'provider.cjs'));
const hash=s=>createHash('sha256').update(s).digest('hex');
function parseSse(text){
 const events=[];let done=false;for(const frame of text.split(/\r?\n\r?\n/)){const data=frame.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)continue;if(data==='[DONE]'){done=true;continue;}events.push(JSON.parse(data));}
 let content='',reasoning='';const reasons=[];let usage;const returnedModels=new Set();
 for(const event of events){if(event.model)returnedModels.add(event.model);const c=event.choices?.[0];content+=c?.delta?.content||'';reasoning+=c?.delta?.reasoning_content||'';if(c?.finish_reason)reasons.push(c.finish_reason);if(event.usage)usage=event.usage;}
 return {events:events.length,done,finishReasons:reasons,usage,returnedModels:[...returnedModels],contentCharacters:content.length,reasoningCharacters:reasoning.length,words:content.trim()?content.trim().split(/\s+/).length:0,hasStart:content.includes('LONG_TASK_START'),hasEnd:content.includes('LONG_TASK_DONE'),contentSha256:hash(content),content,reasoning};
}
async function saveRaw(name,text){const parsed=parseSse(text);await fs.writeFile(path.join(out,`${name}.sse`),text);await fs.writeFile(path.join(out,`${name}-content.txt`),parsed.content);const {content,reasoning,...summary}=parsed;return summary;}
const summaries=[];const limit=Number(process.env.IA_LONG_MAX_TOKENS||8192);
const body={model,messages:[{role:'user',content:prompt}],temperature:0,stream:true,max_tokens:limit,stream_options:{include_usage:true}};
if(process.env.IA_LONG_THINKING)body.thinking={type:process.env.IA_LONG_THINKING};
if(process.env.IA_LONG_REASONING_EFFORT)body.reasoning_effort=process.env.IA_LONG_REASONING_EFFORT;
const selected=(process.env.IA_LONG_MODES||'direct,plugin').split(',');
if(selected.includes('direct')){
 const start=Date.now();const response=await fetch(`${base}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(`Direct Manifold request failed: ${response.status}`);
 const raw=await saveRaw(`direct-${limit}`,await response.text());summaries.push({path:'direct HTTP',request:body,durationMs:Date.now()-start,...raw});console.log(JSON.stringify(summaries.at(-1)));
}
if(selected.includes('plugin')){
 const live=createFetchHttpPort();let wire;let capture;let raw='';
 const audited={request:r=>live.request(r),async stream(request){wire=JSON.parse(request.body);const response=await live.stream(request);if(!response.body)return response;const [providerSide,auditSide]=response.body.tee();capture=(async()=>{const reader=auditSide.getReader();const decoder=new TextDecoder();for(;;){const next=await reader.read();if(next.done)break;raw+=decoder.decode(next.value,{stream:true});}raw+=decoder.decode();})();return {...response,body:providerSide};}};
 const events=[];const remove=setLLMRequestObserver(e=>events.push(e));let content='',reasoning='',done=false,error,errorUsage,errorPartialHash,replyPreservedPartial,replyUsage;const start=Date.now();
 try{await ProviderFactory.createProvider({provider:'custom',id:'long-investigation',baseUrl:base,apiKey:key},audited).streamChat({model:`custom:${model}`,messages:body.messages,maxTokens:limit,temperature:0,purpose:'long-output-investigation',...(body.reasoning_effort?{reasoningEffort:body.reasoning_effort}:{}),...(body.thinking?{thinking:body.thinking}:{}),signal:AbortSignal.timeout(180000)},chunk=>{content+=chunk.content;reasoning+=chunk.reasoning||'';done ||=chunk.done;});}catch(e){error=e.message;errorUsage=e.usage;errorPartialHash=e.partialContent?hash(e.partialContent):undefined;const reply=errorReply(e,model,{provider:'custom'});replyPreservedPartial=!e.partialContent||reply.content.startsWith(e.partialContent);replyUsage=reply.tokenUsage;}finally{remove();}
 await capture;const incoming=await saveRaw(`plugin-${limit}`,raw);await fs.writeFile(path.join(out,`plugin-${limit}-delivered.txt`),content);
 summaries.push({path:'production provider over actual HTTP',request:wire,durationMs:Date.now()-start,incoming,delivered:{contentCharacters:content.length,reasoningCharacters:reasoning.length,words:content.trim()?content.trim().split(/\s+/).length:0,hasEnd:content.includes('LONG_TASK_DONE'),contentSha256:hash(content),done,error,errorUsage,errorPartialHash,replyPreservedPartial,replyUsage},accounting:events});console.log(JSON.stringify(summaries.at(-1)));
}
if(selected.includes('buffered')){
 const live=createFetchHttpPort();let wire,raw='';const audited={stream:r=>live.stream(r),async request(r){wire=JSON.parse(r.body);const response=await live.request(r);raw=response.text;return response;}};
 let content='',done=false,usage,error,errorUsage,errorPartialHash,replyPreservedPartial,replyUsage;const start=Date.now();
 const provider=new OpenAIProvider({provider:'custom',baseUrl:base,apiKey:key},audited);
 try{await provider.streamBuffered({model:`custom:${model}`,messages:body.messages,maxTokens:limit,temperature:0,...(body.thinking?{thinking:body.thinking}:{}),signal:AbortSignal.timeout(180000)},chunk=>{content+=chunk.content;done ||=chunk.done;usage=chunk.usage??usage;});}catch(e){error=e.message;errorUsage=e.usage;errorPartialHash=e.partialContent?hash(e.partialContent):undefined;const reply=errorReply(e,model,{provider:'custom'});replyPreservedPartial=!e.partialContent||reply.content.startsWith(e.partialContent);replyUsage=reply.tokenUsage;}
 const incoming=await saveRaw(`buffered-sse-${limit}`,raw);await fs.writeFile(path.join(out,`buffered-sse-${limit}-delivered.txt`),content);
 summaries.push({path:'production buffered SSE stage over actual HTTP (no injected transport failure)',request:wire,durationMs:Date.now()-start,incoming,delivered:{contentCharacters:content.length,words:content.trim()?content.trim().split(/\s+/).length:0,hasEnd:content.includes('LONG_TASK_DONE'),contentSha256:hash(content),done,usage,error,errorUsage,errorPartialHash,replyPreservedPartial,replyUsage}});console.log(JSON.stringify(summaries.at(-1)));
}
await fs.writeFile(path.join(out,`comparison-${limit}.json`),JSON.stringify({generatedAt:new Date().toISOString(),backend:base,model,mocks:false,promptSha256:hash(prompt),summaries},null,2));

const checks=[];
for(const result of summaries){
 const raw=result.incoming??result;
 assert.ok(raw.done,'The real service stream must have a terminal event');
 if(result.delivered){
   assert.equal(result.delivered.contentSha256,raw.contentSha256,'Every real content byte must reach the caller');
   if(raw.finishReasons.includes('length')){
     assert.equal(result.delivered.done,false);assert.match(result.delivered.error,/output token limit/);assert.equal(result.delivered.errorUsage.completionTokens,raw.usage.completion_tokens);
     assert.equal(result.delivered.replyPreservedPartial,true);assert.equal(result.delivered.replyUsage.completionTokens,raw.usage.completion_tokens);
     if(raw.contentCharacters)assert.equal(result.delivered.errorPartialHash,raw.contentSha256);
     if(result.accounting){assert.equal(result.accounting.length,1);assert.equal(result.accounting[0].status,'failed');assert.equal(result.accounting[0].usage.completionTokens,raw.usage.completion_tokens);}
   }else{assert.equal(result.delivered.done,true);assert.equal(result.delivered.error,undefined);}
 }
 if(process.env.IA_EXPECT_LONG_COMPLETE==='1'){assert.deepEqual(raw.finishReasons,['stop']);assert.ok(raw.hasEnd);assert.ok(raw.words>=900,`Long response needs >=900 words; got ${raw.words}`);}
 checks.push({path:result.path,status:'passed',check:raw.finishReasons.includes('length')?'Genuine truncation preserves text and usage, rejects completion':'Genuine complete response reaches the caller unchanged'});
}
if(summaries.length>1)for(const result of summaries.slice(1))assert.deepEqual(result.request,summaries[0].request,'Direct and production paths must send identical payloads');
await fs.writeFile(path.join(out,`checks-${limit}.json`),JSON.stringify({mocks:false,checks},null,2));
