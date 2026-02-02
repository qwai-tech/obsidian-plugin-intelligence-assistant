# 测试问题具体示例

## 1️⃣ 重复测试示例

### 问题：CSS 样式在 3 个文件中重复测试

**文件 1: llm-models.spec.ts (行 234-247)**
```typescript
it('should style capability badges with background color', async () => {
    const rows = await $$(SELECTORS.llm.tableRows);
    if (rows.length > 0) {
        const firstRow = rows[0];
        const capabilityBadges = await firstRow.$$(SELECTORS.llm.capabilityTag);
        if (capabilityBadges.length > 0) {
            const badge = capabilityBadges[0];
            const bgColor = await badge.getCSSProperty('background-color');
            expect(bgColor.value).toMatch(/rgb/);  // ⚠️ 只检查有颜色
        }
    }
});
```

**文件 2: llm-model-toggle.spec.ts (行 111-127)**
```typescript
it('should style enabled status badge with success color', async () => {
    // ... 设置代码省略
    const statusBadge = await modelRow.$(SELECTORS.llm.statusBadge);
    const bgColor = await statusBadge.getCSSProperty('background-color');
    expect(bgColor.value).toMatch(/rgb/);  // ⚠️ 完全相同的检查
});
```

**文件 3: llm-ollama.spec.ts (行 206-220)**
```typescript
it('should style Ollama provider status badge', async () => {
    // ... 设置代码省略
    const statusBadge = await providerRow.$(SELECTORS.llm.statusBadge);
    const bgColor = await statusBadge.getCSSProperty('background-color');
    expect(bgColor.value).toMatch(/rgb/);  // ⚠️ 又是相同的检查
});
```

**问题**：
- 3 个文件测试相同的 CSS 属性
- 只验证"有颜色"，没有验证正确的颜色
- E2E 不应该测试 CSS，应该用视觉回归工具

**建议**：保留 1 个，删除其他 2 个

---

## 2️⃣ 价值较低的测试示例

### 问题：只检查元素存在，没有功能验证

**llm-models.spec.ts (行 37-46)**
```typescript
it('should have provider filter dropdown', async () => {
    const providerFilter = await $(SELECTORS.llm.providerFilterDropdown);
    if (await providerFilter.isExisting()) {  // ⚠️ 如果不存在就跳过
        expect(await providerFilter.isDisplayed()).toBe(true);
    }
});

it('should have capability filter dropdown', async () => {
    const capabilityFilter = await $(SELECTORS.llm.capabilityFilterDropdown);
    if (await capabilityFilter.isExisting()) {  // ⚠️ 如果不存在就跳过
        expect(await capabilityFilter.isDisplayed()).toBe(true);
    }
});

it('should have status filter dropdown', async () => {
    const statusFilter = await $(SELECTORS.llm.statusFilterDropdown);
    if (await statusFilter.isExisting()) {  // ⚠️ 如果不存在就跳过
        expect(await statusFilter.isDisplayed()).toBe(true);
    }
});
```

**问题**：
- 只检查元素存在，没有测试功能
- 如果元素不存在，测试静默通过（`if` 条件）
- 没有验证过滤器是否真的工作

**应该改为**：
```typescript
it('should filter models by provider', async () => {
    // 实际使用过滤器
    await filterModels({ provider: 'openai' });

    // 验证过滤结果
    const rows = await $$(SELECTORS.llm.tableRows);
    for (const row of rows) {
        const provider = await row.$('.provider-name').getText();
        expect(provider.toLowerCase()).toContain('openai');
    }
});
```

---

## 3️⃣ 总是跳过的测试示例

### 问题：测试永远不会运行

**llm-ollama.spec.ts**
```typescript
it('should show version when Ollama server is online', async function() {
    this.skip();  // ⚠️ 总是跳过

    // 下面的代码永远不会执行
    await addProvider({
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
    });
    await waitForProvider('Ollama');
    await browser.pause(2000);

    const providerRow = await $(SELECTORS.llm.providerRow('Ollama'));
    const versionEl = await providerRow.$(SELECTORS.llm.ollamaVersionText);
    if (await versionEl.isExisting()) {
        const versionText = await versionEl.getText();
        expect(versionText).toMatch(/version|v\d+|\d+\.\d+/i);
    }
});

it('should open Ollama model manager modal', async function() {
    this.skip();  // ⚠️ 总是跳过
    // ... 永远不会运行的代码
});

it('should refresh Ollama models from server', async function() {
    this.skip();  // ⚠️ 总是跳过
    // ... 永远不会运行的代码
});
```

**统计**：llm-ollama.spec.ts 中 19 个测试，11 个标记为 `this.skip()`

**问题**：
- 占用 ~150 行代码但从不运行
- 在 CI/CD 中完全无用
- 维护成本高但无价值

**建议**：
- **选项 A**：删除这些测试
- **选项 B**：使用 Mock Ollama 服务器
- **选项 C**：移到单独的 "需要真实服务器" 测试套件

---

## 4️⃣ 弱验证的测试示例

### 问题：只验证"不崩溃"，没有实际验证

**llm-error-states.spec.ts (行 243-256)**
```typescript
it('should handle special characters in API key', async () => {
    await addProvider({
        provider: 'openai',
        apiKey: 'sk-test-🚀-emoji',  // 特殊字符
    });
    await browser.pause(500);

    // ⚠️ 只检查 provider 存在，没有验证特殊字符处理
    const providers = await getAllProviderNames();
    expect(providers.some(p => p.includes('OpenAI'))).toBe(true);
});

it('should handle very long API key', async () => {
    const longKey = 'sk-' + 'x'.repeat(500);
    await addProvider({
        provider: 'openai',
        apiKey: longKey,
    });
    await browser.pause(500);

    // ⚠️ 只检查 provider 存在，没有验证长 key 是否被正确存储
    const providers = await getAllProviderNames();
    expect(providers.some(p => p.includes('OpenAI'))).toBe(true);
});
```

**问题**：
- 没有验证特殊字符是否被正确转义
- 没有验证长 key 是否被截断或拒绝
- 只验证"UI 没有崩溃"

**应该改为**：
```typescript
it('should handle special characters in API key', async () => {
    const specialKey = 'sk-test-🚀-emoji';
    await addProvider({
        provider: 'openai',
        apiKey: specialKey,
    });

    // 验证 key 被正确存储（可能需要编辑 provider 查看）
    await editProvider('OpenAI', {});
    const modal = await $(SELECTORS.llm.modal.container);
    const apiKeyInput = await modal.$(SELECTORS.llm.modal.apiKeyInput);
    const storedKey = await apiKeyInput.getValue();

    // 验证特殊字符被正确处理（可能被转义或拒绝）
    expect(storedKey).toBeTruthy();
    // 根据实际行为验证
});
```

---

## 5️⃣ 测试依赖问题示例

### 问题：测试共享状态，不能独立运行

**llm-model-toggle.spec.ts (行 7-30)**
```typescript
describe('LLM Settings - Model Enable/Disable', () => {
    // ⚠️ 全局 setup - 所有测试共享
    before(async function() {
        if (!testConfig.hasProvider()) {
            this.skip();
        }

        await openLlmTab();
        const config = testConfig.providerConfig!;
        await addProvider({
            provider: config.provider,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
        });
        await refreshProviderModels(providerNames[config.provider]);
        await browser.pause(2000);
        await closeSettings();
    });

    beforeEach(async () => {
        await openLlmTab();
        await switchLlmSubTab('models');
    });

    // 所有测试依赖 before() 的设置
    it('should toggle model from enabled to disabled', async () => {
        // ⚠️ 依赖 before() 中添加的 provider 和 models
        const models = await getAllModelNames();
        // ...
    });
});
```

**问题**：
- 所有测试共享一个 provider
- 如果 `before()` 失败，所有测试失败
- 不能单独运行某个测试
- 测试间可能互相影响（修改了共享的 models）

**应该改为**：
```typescript
describe('LLM Settings - Model Enable/Disable', () => {
    beforeEach(async function() {
        // ✅ 每个测试独立设置
        if (!testConfig.hasProvider()) {
            this.skip();
        }

        await openLlmTab();
        const config = testConfig.providerConfig!;
        await addProvider({
            provider: config.provider,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
        });
        await refreshProviderModels(providerNames[config.provider]);
        await switchLlmSubTab('models');
    });

    afterEach(async () => {
        // ✅ 每个测试后清理
        await closeSettings();
    });

    it('should toggle model from enabled to disabled', async () => {
        // ✅ 测试独立运行
        const models = await getAllModelNames();
        // ...
    });
});
```

---

## 6️⃣ 硬编码延迟问题示例

### 问题：不可靠的硬编码延迟

**多个文件中出现**
```typescript
await addProvider({ ... });
await browser.pause(500);  // ⚠️ 为什么是 500ms？

await refreshProviderModels('OpenAI');
await browser.pause(2000);  // ⚠️ 为什么是 2000ms？

await toggleModel('gpt-4');
await browser.pause(300);  // ⚠️ 为什么是 300ms？
```

**问题**：
- 在快速机器上浪费时间
- 在慢速机器上可能不够（flaky tests）
- 魔法数字，不知道为什么是这个值

**应该改为**：
```typescript
await addProvider({ ... });
// ✅ 等待 provider 出现
await waitForProvider('OpenAI');

await refreshProviderModels('OpenAI');
// ✅ 等待模型加载完成
await browser.waitUntil(
    async () => {
        const modelCount = await getVisibleModelCount();
        return modelCount > 0;
    },
    {
        timeout: 10000,
        timeoutMsg: 'Models did not load after refresh'
    }
);

await toggleModel('gpt-4');
// ✅ 等待状态更新
await browser.waitUntil(
    async () => {
        const status = await getModelStatus('gpt-4');
        return status.match(/disabled/i);
    },
    {
        timeout: 3000,
        timeoutMsg: 'Model status did not update'
    }
);
```

---

## 7️⃣ 重复代码示例

### 问题：相同代码在 6 个文件中重复

**在以下文件中出现**：
- llm-provider-crud.spec.ts
- llm-models.spec.ts
- llm-refresh-models.spec.ts
- llm-model-toggle.spec.ts
- llm-default-model.spec.ts
- llm-integration.spec.ts

```typescript
const providerNames: Record<string, string> = {
    'openai': 'OpenAI',
    'anthropic': 'Anthropic',
    'google': 'Google',
    'deepseek': 'DeepSeek',
};
```

**应该提取到**：
```typescript
// tests/e2e/utils/constants.ts
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
    'openai': 'OpenAI',
    'anthropic': 'Anthropic',
    'google': 'Google',
    'deepseek': 'DeepSeek',
    'ollama': 'Ollama',
    'openrouter': 'OpenRouter',
    'sap-ai-core': 'SAP AI Core',
    'custom': 'Custom',
} as const;

export function getProviderDisplayName(provider: string): string {
    return PROVIDER_DISPLAY_NAMES[provider] || provider;
}
```

---

## 📊 统计总结

### 可以删除的测试代码

| 类型 | 文件 | 行数 | 原因 |
|------|------|------|------|
| 完全重复 | llm.spec.ts | 101 | 被新测试覆盖 |
| 总是跳过 | llm-ollama.spec.ts | ~150 | 永远不运行 |
| 重复 CSS | 3 个文件 | ~80 | 重复测试样式 |
| 空状态重复 | 2 个文件 | ~50 | 重复测试空状态 |
| 弱验证 | llm-error-states.spec.ts | ~60 | 只检查不崩溃 |
| 简单存在性 | llm-models.spec.ts | ~40 | 没有功能验证 |
| **总计** | | **~481 行** | **14% 的代码** |

### 需要重构的代码

| 类型 | 影响文件数 | 估计工作量 |
|------|-----------|----------|
| 硬编码延迟 | 8 个文件 | 2-3 小时 |
| 测试依赖 | 3 个文件 | 1-2 小时 |
| 重复常量 | 6 个文件 | 30 分钟 |

### 缺失的关键测试

| 类型 | 重要性 | 估计工作量 |
|------|--------|----------|
| 安全性（API Key 加密） | 🔴 高 | 2-3 小时 |
| 并发操作 | 🟡 中 | 2-3 小时 |
| 数据持久化 | 🟡 中 | 1-2 小时 |
| API Key 遮蔽显示 | 🔴 高 | 1 小时 |

---

## 🎯 推荐优化顺序

### 阶段 1: 快速清理（30 分钟）
1. 删除 llm.spec.ts
2. 删除所有 `this.skip()` 的测试
3. 提取重复常量

### 阶段 2: 合并优化（2 小时）
4. 合并重复的 CSS 测试
5. 合并空状态测试
6. 删除弱验证测试

### 阶段 3: 质量提升（4-6 小时）
7. 替换硬编码延迟
8. 修复测试依赖
9. 添加安全性测试

### 预期收益
- ✅ 代码量减少 ~500 行（15%）
- ✅ 测试运行速度提升 ~30%
- ✅ 测试稳定性提升
- ✅ 覆盖关键安全场景
