/** Real Manifold regression. No mock transports, servers, or model responses. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const output = process.env.IA_REAL_RESULTS || 'test-results/codex-ux-fixes-2026-11-03';
const baseUrl = process.env.IA_REAL_BASE_URL || 'http://127.0.0.1:17680/v1';
const apiKey = process.env.IA_REAL_API_KEY;
assert.ok(apiKey, 'IA_REAL_API_KEY is required; never falls back to a mock');
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(path.join(tmpdir(), 'ia-real-routing-'));
const require = createRequire(import.meta.url);
await build({ stdin: { contents: `export { ModelManager } from './packages/obsidian-llm/src/model-manager'; export { ProviderFactory } from './packages/obsidian-llm/src/provider-factory'; export { setDefaultHttpPort, createFetchHttpPort } from './packages/obsidian-llm/src/http'; export { retagCustomProviderModels } from './src/features/settings/model-identity-migration';`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', external: ['obsidian'], format: 'cjs', outfile: path.join(scratch, 'current.cjs'), logLevel: 'silent' });
const { ModelManager, ProviderFactory, retagCustomProviderModels, setDefaultHttpPort, createFetchHttpPort } = require(path.join(scratch, 'current.cjs'));
setDefaultHttpPort(createFetchHttpPort());
const live = { provider: 'custom', name: 'Manifold valid', baseUrl, apiKey };
const realModels = await ModelManager.getModelsForConfig(live, true);
assert.ok(realModels.length, 'The real endpoint returned no models');
const wireModel = process.env.IA_REAL_MODEL || 'deepseek/deepseek-flash';
const selected = realModels.find(model => model.name === wireModel);
assert.ok(selected, `Real endpoint must advertise ${wireModel}`);
const decoy = { provider: 'custom', id: 'wrong-endpoint', name: 'Manifold wrong path', baseUrl: baseUrl.replace(/\/v1\/?$/, '/not-a-real-path/v1'), apiKey, cachedModels: [{ ...selected, id: `custom:${wireModel}` }] };
const checks = [];
async function check(name, action) {
    const start = Date.now();
    await action();
    checks.push({ name, status: 'passed', durationMs: Date.now()-start });
    console.log(`PASS ${name}`);
}

if (process.env.IA_REPRODUCE_BASELINE === '1') await check('baseline reproduction: the old resolver sends the second connection to the first endpoint', async () => {
    const contents = execFileSync('git', ['show', 'ea2d699:packages/obsidian-llm/src/model-manager.ts'], { encoding: 'utf8' });
    await build({ stdin: { contents, resolveDir: path.join(root, 'packages/obsidian-llm/src'), loader: 'ts' }, bundle: true, platform: 'node', external: ['obsidian'], format: 'cjs', outfile: path.join(scratch, 'baseline.cjs'), logLevel: 'silent' });
    const old = require(path.join(scratch, 'baseline.cjs')).ModelManager;
    const oldLive = { ...live, cachedModels: [{ ...selected, id: `custom:${wireModel}` }] };
    const wrong = old.findConfigForModelByProvider(`custom:${wireModel}`, [decoy, oldLive]);
    assert.equal(wrong, decoy);
    await assert.rejects(() => ProviderFactory.createProvider(wrong).chat({ model: `custom:${wireModel}`, messages: [{ role: 'user', content: 'Reply ROUTING_OK' }], maxTokens: 128 }), /404|not.found/i);
});
await check('two live model lists have distinct persistent connection IDs, with no deduplication loss', async () => {
    const second = { provider:'custom', name:'Manifold second connection', baseUrl, apiKey };
    const others = await ModelManager.getModelsForConfig(second, true);
    const all = await ModelManager.getAllChatModels([live, second]);
    assert.notEqual(selected.id, others.find(model => model.name===wireModel).id);
    assert.equal(all.length, realModels.length+others.length);
    const restored = JSON.parse(JSON.stringify(second));
    assert.deepEqual((await ModelManager.getModelsForConfig(restored)).map(m=>m.id), others.map(m=>m.id));
});
await check('selected second connection produces a real answer despite a wrong-path first connection', async () => {
    const config = ModelManager.findConfigForModelByProvider(selected.id, [decoy,live]);
    assert.equal(config, live);
    const answer = await ProviderFactory.createProvider(config).chat({ model:selected.id, messages:[{role:'user',content:'Reply with exactly ROUTING_OK and nothing else.'}], maxTokens:256, temperature:0 });
    assert.match(answer.content, /ROUTING_OK/);
    assert.ok(answer.usage?.totalTokens > 0, 'Real service must report usage');
});
await check('removed and ambiguous connections do not fall back to a different endpoint', async () => {
    assert.equal(ModelManager.findConfigForModelByProvider(selected.id,[decoy]),null);
    assert.equal(ModelManager.findConfigForModelByProvider(`custom:${wireModel}`,[decoy,live]),null);
    assert.equal(ModelManager.findConfigForModelByProvider('missing-provider:model',[live]),null);
});
await check('legacy settings migration preserves default, agent, quick-action and retrieval references', async () => {
    const id=`custom:${wireModel}`;
    const settings={llmConfigs:[{...decoy,cachedModels:[{...selected,id}]},{...live,cachedModels:[{...selected,id}]}],defaultModel:id,titleSummaryModel:id,ragConfig:{embeddingModel:id,graderModel:id},agents:[{modelStrategy:{strategy:'fixed',modelId:id}}],quickActions:[{model:id}]};
    assert.equal(retagCustomProviderModels(settings),true);
    const migrated=settings.llmConfigs[0].cachedModels[0].id;
    for(const value of [settings.defaultModel,settings.titleSummaryModel,settings.ragConfig.embeddingModel,settings.ragConfig.graderModel,settings.agents[0].modelStrategy.modelId,settings.quickActions[0].model])assert.equal(value,migrated);
    assert.notEqual(migrated,settings.llmConfigs[1].cachedModels[0].id);
    assert.equal(retagCustomProviderModels(settings),false);
});

await writeFile(path.join(output,'routing-real.json'),JSON.stringify({backend:baseUrl,model:wireModel,mocks:false,checks},null,2));
