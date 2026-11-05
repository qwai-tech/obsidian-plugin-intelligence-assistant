/** Real filesystem/process/service acceptance. No mocked imports, servers, transports, or responses. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import * as fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
const root = process.cwd();
const output = process.env.IA_REAL_RESULTS || 'test-results/architecture-fixes-2026-11-04';
await fs.mkdir(output, { recursive: true });
const scratch = await fs.mkdtemp(path.join(tmpdir(), 'ia-architecture-real-'));
// Only unused host imports are removed by normal tree-shaking; no implementation is substituted.
await build({ stdin: { contents: await fs.readFile('tests/real/architecture-exports.ts.txt', 'utf8'), resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'unused-host-import', setup(b) { b.onResolve({ filter: /^obsidian$/ }, a => ({ path: a.path, external: true, sideEffects: false })); } }], outfile: path.join(scratch, 'production.cjs'), logLevel: 'silent' });
const production = createRequire(import.meta.url)(path.join(scratch, 'production.cjs'));
const { resolveExecutionPolicy, deduplicateWorkingMessages, sanitizeToolCallHistory, boundChatRequest, estimateRequestTokens, JsonFile, AgentMemoryService, VectorStore, RunCoordinator, runCommand, CLITool, CliToolSource, ToolRegistry, normalizeConversation, ensureDefaultAgent, mayRetryRequest, createFetchHttpPort, withResilience, setDefaultHttpPort, ProviderFactory, ModelManager, setLLMRequestObserver, PROVIDER_DEFINITIONS, McpStdioSession, JsonlRunJournal, TokenUsageRepository, TurnKernel, Budget, AgentContextAssembler, RegistryToolRunner, ProviderModelPort, HistoryCompactor, OpenAIProvider, AnthropicProvider, GoogleProvider, requiresWriteProposal, SettingsStore, userConfigToPluginSettings, toSettingsDocument, fromSettingsDocument, assertSettingsDocument } = production;
// A real disk driver implementing the production I/O port, with vault-relative paths.
const diskRoot = path.join(scratch, 'vault');
await fs.mkdir(diskRoot);
const local = value => { const resolved = path.resolve(diskRoot, value); assert.ok(resolved.startsWith(diskRoot + path.sep) || resolved === diskRoot); return resolved; };
const disk = {
  async exists(file) { try { await fs.access(local(file)); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } },
  append: (file, value) => fs.appendFile(local(file), value),
  async list(folder) { const entries = await fs.readdir(local(folder), { withFileTypes:true }); return { files:entries.filter(e=>e.isFile()).map(e=>`${folder}/${e.name}`), folders:entries.filter(e=>e.isDirectory()).map(e=>`${folder}/${e.name}`) }; },
  async stat(file) { const stat=await fs.stat(local(file));return {mtime:stat.mtimeMs,ctime:stat.ctimeMs,size:stat.size,type:stat.isDirectory()?'folder':'file'}; },
  read: file => fs.readFile(local(file), 'utf8'), write: (file, value) => fs.writeFile(local(file), value),
  mkdir: file => fs.mkdir(local(file), { recursive: true }), remove: file => fs.rm(local(file)), rename: (a,b) => fs.rename(local(a),local(b)),
};
// Explicit experiment setting for short transport controls; not an application default.
const controlThinking = process.env.IA_REAL_CONTROL_THINKING === 'disabled' ? { thinking: { type: 'disabled' } } : {};
const controlMaxTokens = Number(process.env.IA_REAL_CONTROL_MAX_TOKENS || 256);
const checks = [];
async function check(id, name, action) {
  const start = Date.now();
  try { const evidence = await action(); checks.push({ id, name, status:'passed', durationMs:Date.now()-start, evidence }); console.log(`PASS ${id} ${name}`); }
  catch (error) { checks.push({ id, name, status:'failed', durationMs:Date.now()-start, error:error.message }); console.error(`FAIL ${id} ${name}: ${error.message}`); }
  await fs.writeFile(path.join(output,'architecture-real.json'), JSON.stringify({ generatedAt:new Date().toISOString(), mocks:false, scratch, checks },null,2));
}
await check('AR-01','write authorization depends on explicit task grant and Agent setting',async()=>{
  for(const prompt of ['不要自动应用，只生成提案。','Do not act autonomously; wait for my approval.','Explain “without confirmation”.']) {
    assert.equal(resolveExecutionPolicy({autonomousWrite:false}, {origin:'chat',approved:true}, prompt).autonomousWrite,false);
  }
  assert.equal(resolveExecutionPolicy({autonomousWrite:true},{origin:'deep-link',approved:false}).autonomousWrite,false);
  assert.equal(resolveExecutionPolicy({autonomousWrite:true},{origin:'chat',approved:true}).autonomousWrite,true);
  assert.ok(Object.isFrozen(resolveExecutionPolicy(null)));
  assert.equal(requiresWriteProposal(undefined,['Explain the phrase write proposal; do not call create_note.']),false);
  assert.equal(requiresWriteProposal(true,[]),true);
});
await check('AR-02','URL and imported-note execution require existing host user actions',async()=>{
  const widget=await fs.readFile('src/ui/markdown/ai-code-block.ts','utf8');
  const origins=await fs.readFile('src/bootstrap/plugin-integrations.ts','utf8');
  assert.doesNotMatch(widget,/if\s*\(directive\.autorun/);
  assert.match(widget,/runButton\.addEventListener\('click'/);
  assert.match(origins,/launcher\.launch\(/);
  assert.match(origins,/origin: 'deep-link'/);
  return { verification:'Production policy/source check. Native confirmation flow tested separately; no simulated DOM.' };
});
await check('AR-03','external-search call sites use original text and never expanded messages',async()=>{
  for(const file of ['src/features/chat/chat.service.ts','src/features/agent/agent-engine-loop.ts']) {
    const source=await fs.readFile(file,'utf8');
    assert.match(source,/options\.userText \?\? ''/);
  }
  return { verification:'Production call-site and type separation; no private content sent to a search service.' };
});
await check('AR-04','identical tool results preserve distinct call identities',async()=>{
  const calls=['a','b'].map(id=>({id,type:'function',function:{name:'real_action',arguments:'{}'}}));
  const history=[{role:'user',content:'Run both'},{role:'assistant',content:'',tool_calls:calls},...calls.map(c=>({role:'tool',content:'OK',tool_call_id:c.id}))];
  assert.deepEqual(sanitizeToolCallHistory(deduplicateWorkingMessages(history)),history);
  const incomplete=sanitizeToolCallHistory(history.slice(0,-1));
  assert.match(incomplete.at(-1).content,/Tool result a: OK/);
});
await check('AR-05','final request budget includes tools, arguments, context and output reserve',async()=>{
  const history=[{role:'system',content:'Policy: ask before writes.'},{role:'user',content:'Current goal: inspect history.'},{role:'assistant',content:'',tool_calls:[{id:'large',type:'function',function:{name:'read',arguments:JSON.stringify({data:'x'.repeat(100000)})}}]},{role:'tool',content:'OK',tool_call_id:'large'}];
  const request={model:'test-model',messages:history,inputTokenBudget:10000,maxTokens:1000};
  assert.ok(estimateRequestTokens(request)>100000);
  const bounded=boundChatRequest(request);assert.ok(estimateRequestTokens(bounded)<=10000);assert.match(JSON.stringify(bounded),/large/);
  assert.throws(()=>boundChatRequest({...request,messages:[{role:'user',content:'x'.repeat(20000)}]}),/exceeds/);
  const schemas={...request,messages:[{role:'user',content:'Hello'}],tools:[{type:'function',function:{name:'x',description:'x'.repeat(20000)}}]};
  assert.throws(()=>boundChatRequest(schemas),/exceeds/);
  return {before:estimateRequestTokens(request),after:estimateRequestTokens(bounded),limit:10000};
});
const commandEnv={...process.env};
await check('AR-06','real process cancellation kills a child and its descendant',async()=>{
  const marker=path.join(scratch,'descendant-ran');
  const child=`require('child_process').spawn(process.execPath,['-e',${JSON.stringify(`process.on('SIGTERM',()=>{});setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)},'BAD'),900)`)}],{stdio:'ignore'});setTimeout(()=>{},5000);`;
  const stop=new AbortController();
  const job=runCommand({command:process.execPath,args:['-e',child],env:commandEnv,shell:false,timeoutMs:5000,signal:stop.signal});
  setTimeout(()=>stop.abort(),180);
  await assert.rejects(job,/aborted/); await delay(1000);assert.equal(await disk.exists(path.relative(diskRoot,marker)).catch(()=>false),false);
  await assert.rejects(fs.access(marker),{code:'ENOENT'});
  const runs=new RunCoordinator(150);
  await runs.run(undefined,async lease=>{await assert.rejects(runCommand({command:process.execPath,args:['-e','setTimeout(()=>{},5000)'],env:commandEnv,shell:false,timeoutMs:5000,signal:lease.signal}),/aborted/);});
  assert.equal(runs.records.at(-1).status,'aborted');await runs.dispose();
  await assert.rejects(runs.run(undefined,async()=>{}),/stopped/);
});
const baseCli={id:'one',name:'echo',description:'Return a literal argument using a real Node process',command:process.execPath,args:['-e','process.stdout.write(process.argv[1])','{{value}}'],enabled:true,parameters:[{name:'value',type:'string',description:'Literal value',required:true}],timeout:5000};
await check('AR-07','source reload rejects old bindings, even when the wire name is reused',async()=>{
  const registry=new ToolRegistry();registry.registerSource(new CliToolSource(baseCli,runCommand));registry.registerSource(new CliToolSource({...baseCli,id:'two'},runCommand));await registry.reload();
  const binding=registry.getToolByLlmName('echo');assert.equal((await registry.executeBoundTool(binding,{value:'FIRST_REAL_PROCESS'})).result,'FIRST_REAL_PROCESS');
  await registry.unregisterSource('cli','one');assert.equal(registry.getToolByLlmName('echo').origin.sourceId,'two');
  assert.equal((await registry.executeBoundTool(binding,{value:'MUST_NOT_EXECUTE'})).success,false);await registry.dispose();
});
await check('AR-08','argv is literal, shell interpolation is explicit, and unsafe writes are not retryable',async()=>{
  const marker=path.join(scratch,'injected');const input=`$(touch ${marker}); 'quoted' and spaces`;
  const tool=new CLITool(baseCli,runCommand);assert.equal((await tool.execute({value:input})).result,input);await assert.rejects(fs.access(marker),{code:'ENOENT'});
  const shell=new CLITool({...baseCli,shell:true},runCommand);assert.equal((await shell.execute({value:input})).success,false);
  for(const method of ['POST','PUT','PATCH','DELETE']) assert.equal(mayRetryRequest({url:'https://service.invalid',method}),false);
  assert.equal(mayRetryRequest({url:'https://service.invalid',method:'GET'}),true);
  return { retryVerification:'Production policy checked without inducing duplicate external writes.' };
});
await check('AR-09','real disk memory isolates owners, modes, retention and stable entry IDs',async()=>{
  const file=new JsonFile(disk,'state/memory.json',()=>({agents:{}}));
  const memory=new AgentMemoryService({load:()=>file.read(),save:value=>file.write(value)});
  await memory.appendResearchLog('agent-a','LONG_ALPHA',{mode:'long-term',maxEntries:2});await memory.appendResearchLog('agent-a','LONG_BETA',{mode:'long-term',maxEntries:2});await memory.appendResearchLog('agent-a','LONG_GAMMA',{mode:'long-term',maxEntries:2});
  assert.doesNotMatch((await memory.getSnapshot('agent-a')).researchLog,/LONG_ALPHA/);
  await memory.appendResearchLog('agent-b','SESSION_SECRET',{mode:'short-term'});assert.doesNotMatch(await disk.read('state/memory.json'),/SESSION_SECRET/);
  const reopened=new AgentMemoryService({load:()=>file.read(),save:value=>file.write(value)});assert.equal((await reopened.getSnapshot('agent-b','short-term')).researchLog,'');assert.match((await reopened.getSnapshot('agent-a')).researchLog,/LONG_GAMMA/);
  const runtime={vault:{adapter:disk,read:file=>disk.read(file.path)}};
  const store=new VectorStore(runtime,'index/chunks.json',[],'memory');const config={chunkSize:500,minChunkSize:1,chunkOverlap:0,embeddingModel:'',topK:20,similarityThreshold:0,embeddingBatchSize:2};
  await store.addContent('scope needle alpha',{agentId:'agent-a'},config,{mode:'long-term',maxEntries:2});await store.addContent('scope needle beta',{agentId:'agent-b'},config,{mode:'long-term'});await store.addContent('scope needle session',{agentId:'agent-a'},config,{mode:'short-term'});
  assert.equal((await store.search('scope needle',config,undefined,{memoryMode:'none'})).length,0);
  const a=await store.search('scope needle',config,undefined,{agentId:'agent-a',memoryMode:'long-term'});assert.ok(a.length);assert.ok(a.every(r=>r.chunk.metadata.agentId==='agent-a'));assert.match(a[0].chunk.id,/memory:agent-a:[a-f0-9]{64}:/);
  assert.equal((await store.search('scope needle',config,undefined,{agentId:'agent-a',memoryMode:'short-term'})).length,1);
  const abort=new AbortController();abort.abort();await assert.rejects(store.addContent('must never be indexed',{agentId:'agent-a'},config,{mode:'long-term',signal:abort.signal}));
  await store.destroy();
});
await check('AR-10','real corrupt JSON is preserved and cross-instance updates serialize',async()=>{
  const corrupt='{"important":"do not overwrite",';await disk.mkdir('state');await disk.write('state/broken.json',corrupt);const file=new JsonFile(disk,'state/broken.json',()=>({reset:true}));
  await assert.rejects(file.read(),/preserved/);await assert.rejects(file.update(()=>({reset:true})),/preserved/);assert.equal(await disk.read('state/broken.json'),corrupt);
  const first=new JsonFile(disk,'state/count.json',()=>({count:0}));const second=new JsonFile(disk,'state/count.json',()=>({count:0}));
  await Promise.all(Array.from({length:50},(_,i)=>(i%2?first:second).update(value=>{value.count++;})));assert.equal((await first.read()).count,50);assert.equal(JSON.parse(await disk.read('state/count.json.bak')).count,49);
  await disk.write('state/recovery.json.tmp',JSON.stringify({recovered:true}));assert.equal((await new JsonFile(disk,'state/recovery.json',()=>null).read()).recovered,true);
});
await check('AR-10/12','settings transactions serialize on real disk and roll back after corrupt-file rejection',async()=>{
  const file=new JsonFile(disk,'state/settings.json',()=>null);
  const persistence={
    async read(){const doc=await file.read();if(doc)assertSettingsDocument(doc);return {userConfig:doc?fromSettingsDocument(doc).userConfig:null,legacyData:null,outdated:false};},
    async hydrate(){const doc=await file.read();return doc?fromSettingsDocument(doc).stored:{};},
    write:settings=>file.write(toSettingsDocument(settings)),
  };
  const keyFile=path.join(scratch,'scratch-secret-vault.json');syncFs.writeFileSync(keyFile,'{}');
  const secrets={get(id){return JSON.parse(syncFs.readFileSync(keyFile,'utf8'))[id]??null;},set(id,value){const values=JSON.parse(syncFs.readFileSync(keyFile,'utf8'));values[id]=value;syncFs.writeFileSync(keyFile,JSON.stringify(values));},list(){return Object.keys(JSON.parse(syncFs.readFileSync(keyFile,'utf8')));}};
  const store=new SettingsStore(persistence,secrets);await store.load();ensureDefaultAgent(store.current);
  await Promise.all([store.update(s=>{s.agents[0].temperature=0.23;}),store.update(s=>{s.defaultChatMode='chat';}),store.update(s=>{s.agents[0].maxTokens=1234;})]);
  assert.equal(store.current.agents[0].temperature,0.23);assert.equal(store.current.agents[0].maxTokens,1234);store.current.agents[0].maxTokens=2000;ensureDefaultAgent(store.current);assert.equal(store.current.agents[0].maxTokens,2000);store.current.agents[0].maxTokens=1234;ensureDefaultAgent(store.current);assert.equal(store.current.agents[0].temperature,0.23);assert.equal(store.current.defaultChatMode,'chat');
  const restored=new SettingsStore(persistence,secrets);await restored.load();assert.equal(restored.current.agents[0].temperature,0.23);assert.equal(restored.current.agents[0].maxTokens,1234);
  const damaged='{"format":2,"private":"PRESERVE_ME",';await disk.write('state/settings.json',damaged);await assert.rejects(restored.update(s=>{s.agents[0].temperature=0.99;}),/unreadable/);assert.equal(restored.current.agents[0].temperature,0.23);assert.equal(await disk.read('state/settings.json'),damaged);
  await assert.rejects(restored.load(),/preserved/);assert.equal(await disk.read('state/settings.json'),damaged);
  assert.throws(()=>assertSettingsDocument({format:2,config:[],providers:[],prompts:{list:[]},agents:{list:[]}}),/Invalid/);
});
await check('AR-12','saved sampling options round-trip and memory/disk index modes are distinct',async()=>{
  const c=normalizeConversation({id:'real',title:'Config',messages:[],createdAt:1,updatedAt:1,config:{topP:0.2,frequencyPenalty:0.3,presencePenalty:0.4}});assert.equal(c.config.topP,0.2);assert.equal(c.config.frequencyPenalty,0.3);assert.equal(c.config.presencePenalty,0.4);
  const runtime={vault:{adapter:disk,read:file=>disk.read(file.path)}};await disk.write('note.md','actual disk file searchable retrieval');const file={path:'note.md',basename:'note',stat:{mtime:1}};const config={chunkSize:500,minChunkSize:1,chunkOverlap:0,embeddingModel:'',embeddingBatchSize:2,topK:5,similarityThreshold:0};
  const volatile=new VectorStore(runtime,'index/volatile.json',[],'memory');await volatile.addFile(file,config);await volatile.flush();assert.equal(await disk.exists('index/volatile.json'),false);assert.equal(volatile.getChunkCount(),1);await volatile.destroy();
  const persistent=new VectorStore(runtime,'index/persistent.json',[],'disk');await persistent.addFile(file,config);await persistent.flush();assert.equal(await disk.exists('index/persistent.json'),true);await persistent.destroy();
  const reloaded=new VectorStore(runtime,'index/persistent.json',[],'disk');await reloaded.load();assert.equal(reloaded.getChunkCount(),1);await reloaded.destroy();
});
await check('AR-14','provider construction and discovery share the production descriptor registry',async()=>{
  assert.equal(PROVIDER_DEFINITIONS.length,8);assert.equal(new Set(PROVIDER_DEFINITIONS.map(p=>p.id)).size,8);
  for(const provider of PROVIDER_DEFINITIONS) assert.equal(typeof provider.discover,'function');
  const sap=await fs.readFile('packages/obsidian-llm/src/providers/sap-ai-core-provider.ts','utf8');assert.ok(sap.split('\n').length<100);assert.match(sap,/new GoogleProvider/);assert.match(sap,/new OpenAIProvider/);
  return {sap:'No SAP network calls. Static integration and type/build checks only, as requested.'};
});
setDefaultHttpPort(createFetchHttpPort());
await check('AR-11','native protocol request builders select their own buffered endpoints and options',async()=>{
  const request={model:'google:gemini-model',messages:[{role:'user',content:'serialization only'}],maxTokens:512,topP:0.2,topK:5};
  const google=new GoogleProvider({provider:'google',apiKey:'not-used',baseUrl:'https://example.invalid/v1beta'});
  const buffered=google.prepareBufferedRequest(request);assert.match(buffered.url,/:generateContent$/);assert.equal(buffered.body.generationConfig.topK,5);assert.doesNotMatch(buffered.url,/key=/);
  assert.match(google.prepareStreamRequest(request).url,/:streamGenerateContent\?alt=sse$/);
  const anthropic=new AnthropicProvider({provider:'anthropic',apiKey:'not-used'});const a=anthropic.prepareBufferedRequest({...request,model:'anthropic:claude-model'});assert.match(a.url,/\/messages$/);assert.equal(a.body.stream,false);assert.equal(a.body.top_k,5);
  const openai=new OpenAIProvider({provider:'openai',apiKey:'not-used'});assert.throws(()=>openai.prepareBufferedRequest({...request,model:'openai:gpt-model'}),/topK/);
  assert.throws(()=>google.prepareBufferedRequest({...request,frequencyPenalty:0.7}),/frequencyPenalty/);
  return {verification:'Actual production serializers only; native Anthropic/Gemini service conformance remains unverified without credentials.'};
});
await check('AR-15','real journal retention and usage totals survive detail-record rotation',async()=>{
  const journal=new JsonlRunJournal(disk,'runs',Date.now,2);
  for(let i=0;i<4;i++){await journal.append(`run-${i}`,{type:'run_started',runId:`run-${i}`,stepLimit:5});await delay(5);await journal.append(`run-${i}`,{type:'run_finished',reason:{kind:'answered'},answer:'done'});}
  await journal.flush();assert.equal((await disk.list('runs')).files.length,2);
  const runtime={vault:{adapter:disk}};const usage=new TokenUsageRepository(runtime,'state/usage.json');
  await disk.write('state/usage.json',JSON.stringify({version:1,updatedAt:0,records:Array.from({length:1000},(_,i)=>({model:'model',provider:'custom',timestamp:i,promptTokens:1,completionTokens:2,totalTokens:3}))}));
  await usage.recordUsage({model:'model',provider:'custom',timestamp:1001,promptTokens:1,completionTokens:2,totalTokens:3});assert.equal((await usage.getAllRecords()).length,1000);assert.equal((await usage.getGrandTotal()).totalTokens,3003);assert.equal((await usage.getTotalByModel()).get('model').callCount,1001);
});
if(!process.env.IA_MCP_SERVER) checks.push({id:'AR-06-MCP',status:'blocked',error:'IA_MCP_SERVER must name an installed real filesystem reference server; no mock fallback.'});
else await check('AR-06','real reference MCP filesystem server reads disk and accepts client cancellation',async()=>{
  const session=await McpStdioSession.open({command:process.execPath,args:[process.env.IA_MCP_SERVER,diskRoot],env:commandEnv},{name:'architecture-real',version:'1'},{requestTimeoutMs:5000});
  try{
    const tools=await session.request('tools/list',{});assert.ok(tools.tools.some(t=>t.name==='read_file'||t.name==='read_text_file'));
    const tool=tools.tools.some(t=>t.name==='read_text_file')?'read_text_file':'read_file';const result=await session.request('tools/call',{name:tool,arguments:{path:local('note.md')}});assert.match(JSON.stringify(result),/actual disk file/);
    const abort=new AbortController();const pending=session.request('tools/list',{}, {signal:abort.signal});abort.abort();await assert.rejects(pending,/aborted/);assert.equal(session.isOpen,true);
  }finally{await session.close();}assert.equal(session.isOpen,false);
});
const key=process.env.IA_REAL_API_KEY;const baseUrl=process.env.IA_REAL_BASE_URL||'http://127.0.0.1:17680/v1';const wireModel=process.env.IA_REAL_MODEL||'deepseek/deepseek-flash';
if(!key) {checks.push({id:'LIVE',status:'blocked',error:'IA_REAL_API_KEY required; no mock fallback.'});}
else {
 setDefaultHttpPort(withResilience(createFetchHttpPort(),{timeoutMs:90000}));
 const config={provider:'custom',id:'architecture-manifold',name:'Real Manifold',baseUrl,apiKey:key};
 const events=[];const stopObserver=setLLMRequestObserver(event=>{events.push(event);});
 let selected;
 await check('AR-08','real rejected POST is attempted once even if its status is configured retryable',async()=>{
   const live=createFetchHttpPort();let attempts=0;
   const instrumented={request(request){attempts++;return live.request(request);},stream:request=>live.stream(request)};
   const port=withResilience(instrumented,{retries:2,retryStatuses:[401],backoffMs:1,timeoutMs:10000});
   const response=await port.request({url:`${baseUrl}/chat/completions`,method:'POST',headers:{Authorization:'Bearer intentionally-invalid-test-key','Content-Type':'application/json'},body:JSON.stringify({model:wireModel,messages:[{role:'user',content:'Never retry a write automatically'}]})});assert.equal(response.status,401);assert.equal(attempts,1);return {httpStatus:response.status,physicalAttempts:attempts};
 });
 await check('AR-11','real discovery and buffered completion forward sampling options',async()=>{
   const models=await ModelManager.getModelsForConfig(config,true);selected=models.find(m=>m.name===wireModel);assert.ok(selected,'The real model must be advertised');
   const answer=await ProviderFactory.createProvider(config).chat({model:selected.id,messages:[{role:'user',content:'Reply exactly ARCHITECTURE_OK'}],temperature:0,topP:0.9,frequencyPenalty:0,presencePenalty:0,maxTokens:controlMaxTokens,...controlThinking,purpose:'real-architecture',conversationId:'architecture-real'});
   assert.match(answer.content,/ARCHITECTURE_OK/);assert.ok(answer.usage.totalTokens>0);return {model:wireModel,usage:answer.usage,controlThinking:controlThinking.thinking?.type??'service default',controlMaxTokens};
 });
 await check('AR-11','real output-limit termination is reported as incomplete, not a finished answer',async()=>{
   let done=false;await assert.rejects(ProviderFactory.createProvider(config).streamChat({model:selected.id,messages:[{role:'user',content:'Write 1000 words about architecture. Begin immediately and do not stop early.'}],maxTokens:16,temperature:0},chunk=>{done ||= chunk.done;}),/output token limit/);assert.equal(done,false);
 });
 await check('AR-13','real hub provider facade exposes operations without credentials or transport',async()=>{
   const provider=ProviderFactory.createProvider(config);assert.ok(Object.isFrozen(provider));assert.equal(provider.config,undefined);assert.equal(provider.http,undefined);assert.doesNotMatch(JSON.stringify(provider),new RegExp(key));
   const answer=await provider.chat({model:selected.id,messages:[{role:'user',content:'Reply FACADE_OK'}],maxTokens:controlMaxTokens,temperature:0,...controlThinking});assert.match(answer.content,/FACADE_OK/);
 });
 await check('AR-06','real streaming cancellation after partial output reaches the network',async()=>{
   const abort=new AbortController();let length=0;let done=false;
   await assert.rejects(ProviderFactory.createProvider(config).streamChat({model:selected.id,messages:[{role:'user',content:'Write 100 numbered paragraphs about architecture, with detailed explanations.'}],maxTokens:Math.max(4096,controlMaxTokens),signal:abort.signal},chunk=>{if(chunk.content){length+=chunk.content.length;if(length>100)abort.abort();}if(chunk.done)done=true;}));
   assert.ok(length>100);assert.equal(done,false);return {partialCharacters:length};
 });
 await check('AR-11','real stream completion includes terminal usage and no hidden fallback',async()=>{
   let text='';let done=0;let usage;
   await ProviderFactory.createProvider(config).streamChat({model:selected.id,messages:[{role:'user',content:'Reply STREAM_ARCHITECTURE_OK'}],maxTokens:controlMaxTokens,temperature:0,...controlThinking},chunk=>{text+=chunk.content;if(chunk.done)done++;usage=chunk.usage??usage;});assert.match(text,/STREAM_ARCHITECTURE_OK/);assert.equal(done,1);assert.ok(usage.totalTokens>0);return {usage,controlThinking:controlThinking.thinking?.type??'service default',controlMaxTokens};
 });
 await check('AR-04/05/06/07','real kernel completes a multi-step filesystem task with bounded history',async()=>{
   const taskRoot=path.join(scratch,'long-task');await fs.mkdir(taskRoot);
   const expected={files:8,records:40,total:0};
   for(let i=1;i<=8;i++){const values=Array.from({length:5},(_,j)=>i*10+j);expected.total+=values.reduce((a,b)=>a+b,0);await fs.writeFile(path.join(taskRoot,`input-${i}.json`),JSON.stringify(values));}
   const script=path.join(scratch,'task-tool.cjs');await fs.writeFile(script,`const fs=require('fs'),path=require('path');const root=${JSON.stringify(taskRoot)};const [op,name,data]=process.argv.slice(2);if(op==='list'){console.log(JSON.stringify(fs.readdirSync(root)));}else if(op==='calculate'){const all=Array.from({length:8},(_,i)=>JSON.parse(fs.readFileSync(path.join(root,'input-'+(i+1)+'.json'),'utf8'))).flat();console.log(JSON.stringify({files:8,records:all.length,total:all.reduce((a,b)=>a+b,0)}));}else{if(!/^[a-z0-9-]+\\.json$/.test(name))throw Error('Invalid filename');const file=path.join(root,name);if(op==='read')console.log(fs.readFileSync(file,'utf8'));else if(op==='write'&&name==='summary.json'){fs.writeFileSync(file,data);console.log('OK');}else throw Error('Invalid operation');}`);
   const registry=new ToolRegistry();registry.registerSource(new CliToolSource({id:'task-files',name:'task_file',description:'Operate on the real task folder. list lists files; read reads a JSON file; calculate computes exact totals from the eight input files; write can only create summary.json. data is the JSON string for a write.',command:process.execPath,args:[script,'{{operation}}','{{filename}}','{{data}}'],enabled:true,parameters:[{name:'operation',type:'string',description:'list, read, calculate or write',required:true},{name:'filename',type:'string',description:'JSON filename',default:'unused.json'},{name:'data',type:'string',description:'JSON for a write',default:'{}'}]},runCommand));await registry.reload();
   const tools=registry.getTools();const functions=registry.toOpenAIFunctions(tools);const runs=new RunCoordinator(180000);const journal=new JsonlRunJournal(disk,'kernel-runs');const events=[];let outcome;
   await runs.run(undefined,async lease=>{
     const options={model:selected.id,temperature:0,maxTokens:Math.max(3000,controlMaxTokens),inputTokenBudget:20000,conversationId:'real-long-task'};
     const kernel=new TurnKernel({context:new AgentContextAssembler({options,historyCompactor:new HistoryCompactor({maxEstimatedTokens:18000}),systemMessages:[{role:'system',content:'Use the available real filesystem tool. Never invent file contents. Follow the user task and verify the output by reading it back. Do not use an estimated steps marker.'}],tools:functions,contextWindow:20}),model:new ProviderModelPort(ProviderFactory.createProvider(config)),tools:new RegistryToolRunner({registry,enabled:new Set(tools.map(t=>t.llmName)),known:new Set(tools.map(t=>t.llmName)),bindings:new Map(tools.map(t=>[t.llmName,t])),autonomous:false}),guards:[],budget:new Budget({fallbackSteps:30,ceiling:30,maxFailures:3})});
     outcome=await kernel.run({runId:lease.id,history:[{role:'user',content:'List the task folder. Read every input-1.json through input-8.json with separate tool calls. Call calculate to obtain exact record counts and totals from the real files; use its result instead of mental arithmetic. Write summary.json with exactly {"files":8,"records":40,"total":YOUR_SUM}. Read summary.json back to verify it. Only then answer LONG_TASK_VERIFIED with the total.'}]},lease.signal,event=>{events.push(event);void journal.append(lease.id,event);});await journal.flush();
   });
   assert.equal(outcome.reason.kind,'answered');assert.match(outcome.answer,/LONG_TASK_VERIFIED/);assert.deepEqual(JSON.parse(await fs.readFile(path.join(taskRoot,'summary.json'),'utf8')),expected);assert.ok(events.filter(e=>e.type==='tool_finished').length>=12);assert.equal(events.filter(e=>e.type==='run_finished').length,1);
   const safe=events.filter(e=>!['text_delta','reasoning_delta'].includes(e.type));await fs.writeFile(path.join(output,'long-task-events.json'),JSON.stringify({expected,outcome,events:safe},null,2));await registry.dispose();await runs.dispose();return {expected,turns:events.filter(e=>e.type==='turn_started').length,toolCalls:events.filter(e=>e.type==='tool_finished').length};
 });
 await check('AR-15','central request accounting covers successful, failed and aborted calls once',async()=>{
   const before=events.length;
   await assert.rejects(ProviderFactory.createProvider({...config,apiKey:'intentionally-invalid-test-key'}).chat({model:selected.id,messages:[{role:'user',content:'Must fail authentication'}],maxTokens:32}),/401/);
   assert.equal(events.length,before+1);assert.equal(events.at(-1).status,'failed');assert.ok(events.some(e=>e.status==='aborted'));assert.ok(events.some(e=>e.usage?.totalTokens>0));assert.equal(new Set(events.map(e=>e.id)).size,events.length);
   await fs.writeFile(path.join(output,'request-events.json'),JSON.stringify(events,null,2));assert.doesNotMatch(JSON.stringify(events),new RegExp(key));return {requests:events.length,statuses:events.map(e=>e.status)};
 });
 stopObserver();
}
await fs.writeFile(path.join(output,'architecture-real.json'),JSON.stringify({generatedAt:new Date().toISOString(),mocks:false,scratch,checks},null,2));
if(checks.some(c=>c.status!=='passed'))process.exitCode=1;
