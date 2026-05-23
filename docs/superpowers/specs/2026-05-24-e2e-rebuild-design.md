# E2E Test Suite Rebuild Design

- 日期：2026-05-24
- 主题：从零重写 Intelligence Assistant 插件的 E2E 测试体系
- 类型：测试基础设施重构
- 替代：2026-05-23-e2e-testing-design.md（前一次设计方向正确，但落地后出现「测试剧场」与 false-positive，需要更严格的纪律与可执行约束）

---

## 1. 背景与问题

当前 `tests/e2e/` 套件号称 270+ 用例、85% 覆盖率，但深度反思后发现：

| 维度 | 现状 |
|---|---|
| 安全测试 | 4 个 spec 全部"测试剧场"——只验证 UI 没崩，不验证攻击载荷被拒绝 |
| CRUD 测试 | 多数只「打开模态 → 取消」，没有 Create→Read→Update→Delete→Verify 闭环 |
| 断言 | 普遍 `toBeGreaterThanOrEqual(0)`、`typeof === 'string'`、`Array.isArray()` 等无效断言 |
| 等待策略 | 大量 `browser.pause(N)`，CI 慢机器随机失败 |
| 静默失败 | `utils/test-safety.ts` 会把"元素找不到"包装成静默通过 |
| 选择器 | 「找第二个 select」、文本扫描所有 button——位置/文本耦合 |
| 隔离 | 全套件共用一个 vault，`before()` 共享状态，前测污染后测 |
| 仓库卫生 | 根目录 40+ 个历史 `*.log`，`src/presentation/components/tabs/*.backup` 残留 |

**核心问题**：测试在验证"UI 渲染了"，而不是"业务行为正确"。这给出虚假的绿色。

---

## 2. 目标与非目标

### 2.1 目标

1. **断言业务行为而非 UI 存在**——每一个 `expect()` 都必须能在功能破坏时翻红
2. **零网络依赖的 CI 套件**——任何 CI runner 离线可跑，runtime < 5 分钟
3. **真实但小巧的 Release 套件**——验证真 LLM/MCP 集成，runtime < 15 分钟
4. **稳定选择器**——所有交互元素以 `data-testid` 锚定，禁止位置/文本扫描
5. **完整 vault 隔离**——每个 spec 从已知干净状态开始
6. **失败必须可读**——任何 spec 失败都直接指出哪个用户场景断了

### 2.2 非目标（这次不做）

- 可访问性专项测试（ARIA、键盘导航、对比度）——单独立项
- 视觉回归（截图对比）——单独立项
- 移动端响应式——插件是 desktop-only
- 性能基准测试——单独立项
- 单元测试改造——只动 E2E
- Workflow 编辑器——经源码核查并非用户重要路径，本轮不覆盖

---

## 3. 业务域映射（指导测试设计）

### 3.1 关键持久化文件

| 文件 | 内容 | 测试如何验证 |
|---|---|---|
| `data/data.json`（或 settings.json） | 插件主配置 | CRUD 后读文件验证内容 |
| `data/conversations/{id}.json` + `conversation-index.json` | 聊天记录 | 发完消息后读文件 |
| `data/llm-providers.json` | LLM provider 列表 | 添加/删除 provider 后比对 |
| `data/mcp-servers.json` | MCP 服务器配置 | MCP CRUD 后读文件 |
| `data/cache/llm_models.json` | 模型缓存 | refresh 后看 cacheTimestamp 更新 |
| `data/cache/mcp-tools/{name}.json` | MCP tools/list 缓存 | 连接成功后看文件出现 |
| `data/vector_store/notes.json` | RAG 向量索引 | 索引后文件存在且非空 |
| `data/agents/{id}.json` + `data/prompts/{id}.json` + `data/openapi-tools/{id}.json` | Agents/Prompts/OpenAPI 工具 | CRUD 后读文件 |

### 3.2 核心用户场景

| ID | 场景 | 关键断言（非剧场） |
|---|---|---|
| **C1** | 发消息→流式回复→落盘 | 用户/助手消息 DOM 渲染；`conversations/{id}.json` 落盘含两条消息且 role/content 正确 |
| **C2** | Stop generation | 调用 stop 后 streaming 标志为 false；助手消息保留已收到的片段 |
| **C3** | 多对话隔离 | 创建 conv A、conv B；切回 A 时只看到 A 的历史 |
| **C4** | 切换模型 | 设置不同模型后发消息，请求 body.model 字段为所选模型 |
| **L1** | Provider CRUD | 添加 provider 后 settings 文件含该项；编辑后字段更新；删除后消失；**插件重载后仍生效** |
| **L2** | 模型刷新 | 点 refresh，mock 返回模型列表后 `cache/llm_models.json` 含这些模型 |
| **L3** | 无效 key 错误 | 发消息时 mock 返回 401，UI 出现错误提示且消息状态为错误，不静默吞错 |
| **M1** | MCP 添加→连接→tools 加载 | 添加 mock MCP server，连接后 `cache/mcp-tools/{name}.json` 出现且含预期 tool name |
| **M2** | MCP 工具被 agent 调用 | Agent 模式发消息触发 mocked tool call → mock MCP 子进程执行 → result 出现在 trace 与最终回复 |
| **R1** | RAG 索引 vault | 配置 embedding model + 点 reindex，`vector_store/notes.json` 出现并含 chunks |
| **R2** | RAG 命中并注入 | 启用 RAG 后发消息，`message.ragSources[]` 含命中文件，回复 DOM 含 source link |
| **A1** | Agent CRUD | 创建 agent（含 system prompt + tool 白名单 + maxSteps），settings/data 文件落盘 |
| **A2** | Agent 工具循环 | 切到 agent 模式，mock LLM 返回 tool_call → 工具执行 → 第二次 LLM 调用拿到 tool result → 最终回复；执行 trace 含两阶段 |
| **A3** | Agent 工具权限隔离 | Agent 限定只 enable 工具 X；mock LLM 试图调用工具 Y → registry 拒绝（验证拒绝路径，不是 UI 没崩）|
| **S1** | Settings 持久化 | 改若干设置 → 重载插件 → 设置仍在 |
| **Q1** | Quick Action 编辑器集成 | 选编辑器文字 → 右键 quick action → mock LLM 返回替换文本 → 编辑器文字被替换 |

---

## 4. 测试金字塔（三层）

```
                 ┌────────────┐
                 │ L3 Release │  ~5 spec, < 15 min, 真 API
                 │  (smoke)   │
                 ├────────────┤
                 │     L2     │  ~25 spec, < 5 min, mock LLM, 真持久化/真 RAG/真 MCP-mock
                 │ Functional │
                 ├────────────┤
                 │  L1 Smoke  │  1 spec, < 30s, 插件加载 + 基础视图打开
                 └────────────┘
```

| 层 | 命令 | 何时跑 | 何时失败应阻塞 |
|---|---|---|---|
| L1 + L2 (CI) | `npm run test:e2e:ci` | 每次 push / PR | 阻塞合并 |
| L3 (Release) | `npm run test:e2e:release` | 合并 main 前 / 发版前 | 阻塞发版 |

---

## 5. 架构与目录

```
tests/e2e/
├── pages/                          # Page Objects（specs 唯一能进出 DOM 的入口）
│   ├── chat/
│   │   ├── chat-view.page.ts
│   │   └── conversation-list.page.ts
│   ├── settings/
│   │   ├── settings-shell.page.ts
│   │   ├── llm-tab.page.ts
│   │   ├── mcp-tab.page.ts
│   │   ├── rag-tab.page.ts
│   │   ├── agents-tab.page.ts
│   │   ├── tools-tab.page.ts
│   │   ├── prompts-tab.page.ts
│   │   ├── quickactions-tab.page.ts
│   │   └── general-tab.page.ts
│   ├── modals/
│   │   ├── provider-modal.page.ts
│   │   ├── mcp-server-modal.page.ts
│   │   ├── agent-edit-modal.page.ts
│   │   ├── confirm-modal.page.ts
│   │   └── text-input-modal.page.ts
│   └── editor.page.ts              # Quick Action 测试用
│
├── support/                        # 测试基础设施（替代旧 utils/）
│   ├── testids.ts                  # 中心化 data-testid 常量
│   ├── vault-fixture.ts            # snapshot/restore vault 状态
│   ├── plugin-helpers.ts           # waitForPluginReady, reloadPlugin, readDataFile
│   ├── mock-llm.ts                 # LLM HTTP mocking（基于 browser.mock）
│   ├── mock-mcp-server.js          # 极小 MCP 子进程 mock（stdio JSON-RPC）
│   ├── data-fixtures.ts            # createProviderConfig / createAgentConfig 等工厂
│   └── env.ts                      # CI/Release 环境探测，缺失 secret 时 skip release
│
├── fixtures/                       # 静态数据
│   ├── responses/                  # mock HTTP 响应（保留旧的，新增 tool-call-loop）
│   ├── vault-template/             # 干净 vault 模板（含 3 个 markdown 用于 RAG 测试）
│   └── openapi/petstore.json       # OpenAPI 导入测试用
│
├── specs/
│   ├── 00-smoke.spec.ts            # L1
│   ├── chat/
│   │   ├── send-receive.spec.ts
│   │   ├── streaming.spec.ts
│   │   ├── stop-generation.spec.ts
│   │   ├── conversation-persistence.spec.ts
│   │   ├── conversation-isolation.spec.ts
│   │   ├── model-switch.spec.ts
│   │   └── error-handling.spec.ts
│   ├── settings/
│   │   ├── llm-provider-crud.spec.ts
│   │   ├── llm-model-refresh.spec.ts
│   │   ├── mcp-crud.spec.ts
│   │   ├── rag-config.spec.ts
│   │   ├── rag-indexing.spec.ts
│   │   ├── agents-crud.spec.ts
│   │   ├── prompts-crud.spec.ts
│   │   ├── quickactions-crud.spec.ts
│   │   ├── tools-builtin.spec.ts
│   │   ├── tools-openapi-import.spec.ts
│   │   └── settings-persistence.spec.ts
│   ├── agents/
│   │   ├── tool-call-loop.spec.ts          # ★ 重点
│   │   ├── tool-permission-isolation.spec.ts
│   │   └── max-steps.spec.ts
│   ├── rag/
│   │   └── retrieval-context.spec.ts
│   ├── editor/
│   │   └── quick-action.spec.ts
│   └── release/                     # L3
│       ├── real-chat.spec.ts
│       ├── real-agent.spec.ts
│       └── real-mcp.spec.ts
│
├── wdio.ci.conf.ts
├── wdio.release.conf.ts
└── README.md
```

旧 `tests/e2e/specs/`、`pages/`、`utils/`、`mocks/`、`MANUAL_E2E_TEST_PLAN.md` 等冗余文档全部删除。`fixtures/responses/` 保留迁移（已较合理）。

---

## 6. 核心设计决策

### 6.1 选择器：data-testid 系统化

源码改造一次到位。命名规范：

```
data-testid="ia-<scope>-<element>[-<modifier>]"
```

例子：

| 用途 | testid |
|---|---|
| 聊天输入框 | `ia-chat-input` |
| 发送按钮 | `ia-chat-send-btn` |
| 停止按钮 | `ia-chat-stop-btn` |
| 新对话按钮 | `ia-chat-new-btn` |
| 单条消息 | `ia-chat-msg`（含属性 `data-role="user"\|"assistant"`、`data-msg-id`）|
| 模型选择器 | `ia-chat-model-select` |
| 模式选择器（chat/agent） | `ia-chat-mode-select` |
| 设置 Tab 项 | `ia-settings-tab`（含属性 `data-tab-id="llm"`）|
| 添加 Provider 按钮 | `ia-llm-add-provider-btn` |
| Provider 列表项 | `ia-provider-row`（含 `data-provider-id`）|
| 模态保存/取消 | `ia-modal-save-btn` / `ia-modal-cancel-btn` |
| Provider 表单字段 | `ia-provider-form-{field}` |
| Execution trace 项 | `ia-trace-item`（含 `data-tool-name`、`data-step-index`）|

实现路径：所有 testid 集中在 `tests/e2e/support/testids.ts`，源码侧 `src/presentation/utils/test-ids.ts` 同步导出。page object 与源码引用同一文件，重命名时编译器报错。

### 6.2 Page Object 纪律

- spec 文件**禁止**出现 `$`、`$$`、`browser.execute` 操作 DOM、CSS selector 字符串
- page object 只暴露**领域动作**（`chatPage.sendMessage("hi")`、`llmTab.addProvider({...})`）和**领域查询**（`chatPage.getLastAssistantMessage(): { text, role, attachments }`）
- 不暴露 raw `WebdriverIO.Element`
- page object 内部允许查 testid，但禁止位置/文本扫描（删除 `findSecondSelect` 这种）
- 共享基类 `BasePage` 提供 `waitFor(testid)`、`click(testid)`、`getText(testid)` 等原语，统一使用 `waitUntil`

### 6.3 等待策略：禁止 browser.pause

- 测试代码与 page object 中**完全禁止** `browser.pause(N)`
- ESLint 规则 `no-restricted-syntax` 阻止该写法
- 所有异步等待用 `browser.waitUntil(条件)` 或 `element.waitForDisplayed({timeout})`
- 复杂等待（如"流式回复完成"）封装在 page object 里：`chatPage.waitForReplyComplete()` 内部判断 streaming 标志/最终消息渲染完成

### 6.4 删除 test-safety.ts

- 测试**失败必须可见**。`tests/e2e/utils/test-safety.ts` 整个文件删除
- `wdio.conf.ts:afterTest` 中的注释掉的 auto-pass 也一并清掉
- 任何 `.catch(() => false)` 在 page object 里**只允许**用于纯查询（如 "is modal currently visible"），不允许用于交互动作

### 6.5 Vault 隔离

**策略**：每个 spec 通过 `VaultFixture` 类管理状态。

```ts
// support/vault-fixture.ts
export class VaultFixture {
  // 把 fixtures/vault-template/ 的内容复制到 test-vault/，
  // 包括 .obsidian/plugins/.../data/* 全部子目录
  async reset(profile?: 'minimal' | 'with-providers' | 'with-rag-indexed'): Promise<void>;

  // 直接读取插件落盘的文件
  async readDataFile<T>(relativePath: string): Promise<T>;

  // 触发插件重新加载（通过禁用/启用插件）
  async reloadPlugin(): Promise<void>;
}
```

每个 spec 在 `beforeEach` 中 `await vault.reset()` 选用合适 profile。不再共享 vault 状态。

### 6.6 Mock 策略：网络边界 mock，业务逻辑真跑

| 层 | CI 端处理 | 理由 |
|---|---|---|
| LLM HTTP (`/v1/chat/completions`、`/v1/messages` 等) | **mock**（`browser.mock`） | 速度、可重现 |
| LLM HTTP `/v1/models` | **mock** | 同上 |
| Web 搜索 API | **mock** | 同上 |
| OpenAPI 工具的目标 URL | **mock** | 隔离外部依赖 |
| MCP 服务器 | **mock 子进程**（一个 tiny Node script 暴露 stdio JSON-RPC） | 不用 npx/uvx/docker，且能验证子进程协议 |
| 文件系统（settings 落盘、conversations 落盘、RAG 索引落盘） | **真跑** | 这是要验证的核心 |
| RAG 向量计算 | **真跑**，用 mock embedding（mock `/v1/embeddings` 返回确定性向量） | 验证 chunking/检索/注入链路 |
| Quick Action 编辑器交互 | **真跑** | 验证 DOM 操作 |

`mock-llm.ts` 提供高级 API：

```ts
mockLLM.replyWith('Hello!');
mockLLM.toolCall({ name: 'read_file', arguments: { path: 'a.md' } });
mockLLM.streaming(['Hello', ' world']);
mockLLM.error(429);
mockLLM.scenario('tool-call-loop'); // 第 1 次返回 tool_call，第 2 次返回最终回复
```

### 6.7 断言强度准则

每个 spec 文件顶部注释一段「what would break if this test stays green when feature breaks」自检。审核机制：

- 禁止 `expect(x).toBeGreaterThanOrEqual(0)`（永远为真）
- 禁止 `expect(typeof x).toBe('string')`（getText 必为 string）
- 禁止 `expect(Array.isArray(x)).toBe(true)`（$$() 必为数组）
- 必须比对**具体值**：`expect(msg.text).toBe('Hello!')`、`expect(providers[0].apiKey).toBe('sk-test')`
- ESLint 规则 + PR review checklist 强制

### 6.8 失败诊断

- WDIO `reporters: ['spec', ['junit', { ... }], ['allure', { ... }]]`
- 每个 spec 失败时自动 dump：当前 vault 文件树、最后一次 mock 调用、当前页面 testid 列表
- 截图自动归档至 `tests/e2e/screenshots/{spec}/{test}.png`

---

## 7. 关键 spec 实现示例（指导风格）

### 7.1 `chat/send-receive.spec.ts`（最小完整范式）

```ts
import { ChatPage } from '@pages/chat/chat-view.page';
import { VaultFixture } from '@support/vault-fixture';
import { mockLLM } from '@support/mock-llm';

describe('Chat — send & receive', () => {
  const vault = new VaultFixture();
  const chat = new ChatPage();

  beforeEach(async () => {
    await vault.reset('with-providers');   // 含 1 个 OpenAI provider + cached models
    mockLLM.replyWith('Hi from mock LLM!');
    await chat.open();
    await chat.newChat();
  });

  it('renders user and assistant messages, persists to disk', async () => {
    await chat.sendMessage('Hello');
    await chat.waitForReplyComplete();

    const [userMsg, assistantMsg] = await chat.getMessages();
    expect(userMsg).toEqual({ role: 'user', text: 'Hello' });
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.text).toBe('Hi from mock LLM!');

    const conv = await vault.readDataFile<{ messages: Array<{role: string; content: string}> }>(
      `conversations/${await chat.getConversationId()}.json`
    );
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0].content).toBe('Hello');
    expect(conv.messages[1].content).toBe('Hi from mock LLM!');
  });
});
```

### 7.2 `agents/tool-call-loop.spec.ts`（重头戏）

```ts
describe('Agent — tool call loop', () => {
  const vault = new VaultFixture();
  const chat = new ChatPage();

  beforeEach(async () => {
    await vault.reset('with-agent-and-builtin-tools');
    mockLLM.scenario([
      // 第 1 轮 LLM 调用：返回 tool_call
      { kind: 'tool_call', name: 'read_file', arguments: { path: 'README.md' } },
      // 第 2 轮（含 tool result）：返回最终文本
      { kind: 'text', content: 'File starts with "# Intelligence Assistant"' },
    ]);
    await chat.open();
    await chat.switchMode('agent');
  });

  it('executes the tool, feeds result back, and renders trace', async () => {
    await chat.sendMessage('What does README.md say?');
    await chat.waitForReplyComplete();

    const trace = await chat.getExecutionTrace();
    expect(trace).toHaveLength(1);
    expect(trace[0].toolName).toBe('read_file');
    expect(trace[0].arguments).toEqual({ path: 'README.md' });
    expect(trace[0].resultPreview).toContain('# Intelligence Assistant');

    const assistantText = await chat.getLastAssistantText();
    expect(assistantText).toContain('# Intelligence Assistant');

    // 验证 LLM 第二次被调用时 messages[] 包含 tool result
    const calls = mockLLM.getCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1].body.messages.some(m => m.role === 'tool')).toBe(true);
  });
});
```

### 7.3 `settings/llm-provider-crud.spec.ts`（真闭环）

```ts
it('creates, updates, deletes a provider with persistence', async () => {
  await settings.open();
  await settings.gotoTab('llm');

  // Create
  await llmTab.addProvider({ provider: 'openai', name: 'Test', apiKey: 'sk-A' });
  expect(await llmTab.getProviderNames()).toContain('Test');
  let file = await vault.readDataFile<any>('llm-providers.json');
  expect(file.providers.find(p => p.name === 'Test').apiKey).toBe('sk-A');

  // Update
  await llmTab.editProvider('Test', { apiKey: 'sk-B' });
  file = await vault.readDataFile<any>('llm-providers.json');
  expect(file.providers.find(p => p.name === 'Test').apiKey).toBe('sk-B');

  // Reload plugin → still there
  await vault.reloadPlugin();
  await settings.open();
  await settings.gotoTab('llm');
  expect(await llmTab.getProviderNames()).toContain('Test');

  // Delete
  await llmTab.deleteProvider('Test');
  expect(await llmTab.getProviderNames()).not.toContain('Test');
  file = await vault.readDataFile<any>('llm-providers.json');
  expect(file.providers.find(p => p.name === 'Test')).toBeUndefined();
});
```

---

## 8. 删除清单

执行前清单：

```
tests/e2e/specs/                  整个目录
tests/e2e/pages/                  整个目录（重新设计）
tests/e2e/utils/                  整个目录（包含 test-safety.ts）
tests/e2e/mocks/                  整个目录（fixtures/responses 迁入新 fixtures/）
tests/e2e/MANUAL_E2E_TEST_PLAN.md
tests/e2e/BUSINESS_SCENARIO_COVERAGE.md
tests/e2e/OPTIMIZATION_SUMMARY.md
tests/e2e/TEST_OPTIMIZATION_LOG.md
tests/e2e/TEST_REVIEW.md
tests/e2e/MCP_TEST_COVERAGE.md
tests/e2e/RAG_TEST_COVERAGE.md
tests/e2e/TOOLS_TEST_COVERAGE.md
tests/e2e/QUICKACTIONS_TEST_COVERAGE.md
tests/e2e/EXAMPLES.md
tests/E2E_TEST_MAPPING.md
tests/*.log                       40+ 个历史日志
wdio.chrome.conf.ts
wdio.firefox.conf.ts
wdio.screenshot.conf.ts
src/presentation/components/tabs/*.backup
```

保留：

```
wdio.conf.ts                      会被拆为 ci/release 两个 conf
tests/e2e/test-vault/             清空后作为运行时 vault，模板来源在 fixtures/vault-template/
.env.test                         release suite 用
```

`tests/__mocks__/` 是 Jest 单元测试的，不动。

---

## 9. CI 集成

`.github/workflows/e2e.yml`（如已存在则改造）：

```yaml
jobs:
  ci-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm run test:e2e:ci
        env: { CI: 'true' }
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: e2e-screenshots, path: tests/e2e/screenshots/ }

  release-e2e:
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
      - ...
      - run: npm run test:e2e:release
        env:
          E2E_TEST_PROVIDER: ${{ secrets.E2E_TEST_PROVIDER }}
          E2E_TEST_API_KEY:  ${{ secrets.E2E_TEST_API_KEY }}
          E2E_TEST_MODEL:    ${{ secrets.E2E_TEST_MODEL }}
```

---

## 10. 工作量估算与交付节奏

| 阶段 | 内容 | 估算 |
|---|---|---|
| **P0** | 清理 + 基础设施：删除清单、wdio 拆分、testids 双向引用、VaultFixture、mock-llm、mock-mcp、ESLint 规则、smoke spec 跑通 | 1.5 天 |
| **P1** | 核心 page object + Chat 套件（C1-C4）+ Provider CRUD（L1-L3）+ Settings 持久化（S1）+ source 端 testid 注入 | 2 天 |
| **P2** | Agent 工具循环（A1-A3）+ MCP（M1-M2）+ RAG（R1-R2）+ Tools 各类 CRUD + Prompts/QuickActions | 2 天 |
| **P3** | Release suite（3 spec）+ CI workflow 集成 + README 整理 | 0.5 天 |

总计约 6 个工作日。可拆 PR 提交：每完成一组特性发一个 PR，避免一锅大改动。

---

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| 源码加 testid 引发 review 推迟 | 集中在一个 commit 内完成，diff 全是属性增加无逻辑变更 |
| Mock MCP 子进程协议实现成本 | MCP 最小可用集合是 4 个 RPC：`initialize`/`tools/list`/`tools/call`/`shutdown`；一个 100 行 Node script 够用 |
| Obsidian 启动慢拖累 CI | maxInstances=1 但每个 spec 不重启 Obsidian，仅 reset vault；只在持久化测试里走 `reloadPlugin()` |
| 流式响应 mock 难做 | 使用 `browser.mock` + 自定义 response stream；fixture 里 SSE 文本已有 |
| 测试间副作用 | VaultFixture.reset 完全覆盖 .obsidian/plugins/.../data；不依赖任何"上一个测试留下的"状态 |
| 删除文件破坏未察觉的依赖 | 删除前 grep 确认引用，分两步：先标记 deprecated 注释、确认无引用后再删 |

---

## 12. 成功标准

CI suite 合并即满足：

1. `npm run test:e2e:ci` 在干净 CI runner 上 < 5 分钟内完成，零 flake
2. 所有 spec 满足"翻红即真断"——故意在源码改坏一行业务逻辑（如禁用 LLM provider 持久化）能让对应 spec 失败
3. 仓库根目录无 `*.log`，`tests/e2e/utils/test-safety.ts` 不存在，`browser.pause` 在 spec/page 代码中零出现
4. 任何 spec 文件 < 100 行（超出说明该 spec 关心太多事，应拆）
5. README 一页能读完——少而清晰
