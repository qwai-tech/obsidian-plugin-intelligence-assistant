# 插件全功能 E2E 测试设计

- 日期:2026-05-23
- 主题:Full E2E Test Suite —— 覆盖每个按钮、每个输入项、每个弹窗
- 类型:测试基础设施(从零重写)

## 1. 目标

从零重写插件的 E2E 测试套件,覆盖全部 UI 交互项(按钮、输入框、弹窗、切换),并建立「日常 CI 快速回归」+「发版前真实环境验证」两层测试体系。

成功标准:
- CI suite 覆盖全部 UI 元素,每条用例断言具体行为,false-positive 趋于零
- Release suite 覆盖真实 AI 调用的完整链路(agent 循环、MCP 工具调用、流式响应)
- CI suite 零外部依赖(mock AI),可在任何 CI runner 离线运行
- 所有 spec 通过 Page Object 层间接触碰 DOM

## 2. 现状

现有 42 个 spec 文件,但实际覆盖率约 25%:
- 核心聊天流程被注释(发送消息/流式响应/多轮对话)
- agent 测试损坏(语法错误)
- 安全测试全部跳过(`this.skip()`)
- llm-model-toggle / llm-default-model / llm-integration 被桩代码替换
- Prompts / Usage / WebSearch 三个设置标签零覆盖
- CLI tools 零覆盖

决定:从零重写,删除旧的 `tests/e2e/specs/`,用新的组织方式。

## 3. 两套 Suite

| | CI Suite | Release Suite |
|---|---|---|
| 目的 | 日常快速回归 | 发版前真实验证 |
| AI 响应 | Mock fetch 截获 | 真实 API 调用 |
| 依赖 | 仅 Obsidian | 需要 API key(.env) |
| 执行频率 | 每 PR / 每次提交 | 发版 / 合并 main 前 |
| 耗时目标 | 在 Obsidian 启动后 3-5 分钟 | 10-15 分钟 |
| 命令 | `npm run test:e2e:ci` | `npm run test:e2e:release` |

## 4. 目录结构

```
tests/e2e/
├── config/
│   └── wdio.ci.conf.ts              # CI 配置(继承现有 wdio.conf.ts)
│   └── wdio.release.conf.ts         # Release 配置(继承 wdio.conf.ts,真实 API)
├── mocks/
│   ├── responses/                   # 预录 Mock JSON
│   │   ├── chat-simple-reply.json
│   │   ├── chat-tool-call.json
│   │   ├── chat-tool-result.json
│   │   ├── chat-streaming-reply.txt
│   │   ├── chat-error-429.json
│   │   ├── chat-error-500.json
│   │   └── models-list.json
│   └── fixtures/                    # Mock 数据工厂
│       └── mock-responses.ts
├── pages/                           # Page Object 层
│   ├── chat-view.page.ts
│   ├── conversation-list.page.ts
│   ├── settings/
│   │   ├── general-tab.page.ts
│   │   ├── llm-tab.page.ts
│   │   ├── mcp-tab.page.ts
│   │   ├── tools-tab.page.ts
│   │   ├── rag-tab.page.ts
│   │   ├── prompts-tab.page.ts
│   │   ├── agents-tab.page.ts
│   │   ├── quickactions-tab.page.ts
│   │   └── usage-tab.page.ts
│   └── modals/
│       ├── provider-config-modal.page.ts
│       ├── agent-edit-modal.page.ts
│       ├── mcp-server-modal.page.ts
│       ├── confirm-modal.page.ts
│       └── text-input-modal.page.ts
├── specs/
│   ├── ci/                          # CI suite —— mock AI
│   │   ├── chat/
│   │   │   ├── chat-send-message.spec.ts
│   │   │   ├── chat-model-switch.spec.ts
│   │   │   ├── chat-mode-switch.spec.ts
│   │   │   ├── chat-conversation-crud.spec.ts
│   │   │   └── chat-attachments.spec.ts
│   │   ├── settings/
│   │   │   ├── general-tab.spec.ts
│   │   │   ├── llm-provider-crud.spec.ts
│   │   │   ├── llm-models.spec.ts
│   │   │   ├── llm-security.spec.ts
│   │   │   ├── mcp-crud.spec.ts
│   │   │   ├── mcp-connection.spec.ts
│   │   │   ├── tools-builtin.spec.ts
│   │   │   ├── tools-openapi-crud.spec.ts
│   │   │   ├── tools-cli-crud.spec.ts
│   │   │   ├── rag-all-tabs.spec.ts
│   │   │   ├── prompts-crud.spec.ts
│   │   │   ├── agents-crud.spec.ts
│   │   │   ├── quickactions-crud.spec.ts
│   │   │   └── usage-tab.spec.ts
│   │   ├── security/
│   │   │   ├── prompt-injection.spec.ts
│   │   │   ├── filesystem-boundary.spec.ts
│   │   │   ├── ssrf-protection.spec.ts
│   │   │   └── code-sandbox.spec.ts
│   │   └── accessibility.spec.ts
│   └── release/                     # Release suite —— 真实 AI
│       ├── real-chat-flow.spec.ts
│       ├── real-agent-loop.spec.ts
│       └── real-mcp-integration.spec.ts
└── utils/
    ├── mock-ai.ts                   # fetch mock 注入
    ├── assertions.ts                # 公用断言
    └── test-helpers.ts              # 等待/导航辅助
```

旧 `tests/e2e/specs/` 删除。`wdio.conf.ts` 作为共享基类保留,`wdio.ci.conf.ts` 和 `wdio.release.conf.ts` 继承它。旧 `wdio.chrome.conf.ts`、`wdio.firefox.conf.ts`、`wdio.screenshot.conf.ts` 继续保留(非核心 E2E 用例,不在本次范围)。

## 5. 覆盖矩阵

### 5.1 Chat View

| 交互项 | 测试行为 | Suite |
|--------|---------|-------|
| 文本输入框 + 发送按钮 | 输入→发送→检查消息出现在列表 | CI |
| 发送流程(full round-trip) | 消息→mock 回复→渲染用户+助手气泡 | CI |
| 流式响应(打字机效果) | 发送→真实 streaming→验证增量渲染 | Release |
| 停止生成按钮 | 发送→立即点停止→确认消息不再追加 | CI |
| 新建对话按钮 | 点击→空状态出现→旧消息清空 | CI |
| 模型选择器 | 切换模型→持久化(重新打开验证) | CI |
| 模式切换(chat/agent) | 切换→agent 专用 UI 出现/隐藏 | CI |
| Agent 选择下拉框 | 选 agent→名字显示在徽章 | CI |
| 工具执行轨迹 | agent 调用 tool→轨迹面板展开+步骤可见 | CI + Release |
| 对话列表(创建/删除/切换/搜索) | 多对话→切换验证上下文隔离 | CI |
| 附件按钮 | 点击→文件选择器出现 | CI |
| RAG 切换按钮 | 点击→状态持久化 | CI |
| Web Search 切换按钮 | 点击→状态持久化 | CI |
| 消息渲染(用户/助手/错误) | 验证 CSS 类名+角色标签 | CI |
| 空状态 | 新对话无消息时显示引导 | CI |

### 5.2 Settings Tabs

每个 tab 的测试覆盖:

| Tab | 子标签 | 交互项覆盖 |
|-----|--------|----------|
| General | — | 默认模式选择、快捷前缀输入、语言选择 |
| LLM | Provider | 添加(所有 provider 类型)、编辑(API key/base URL/model filter)、删除(确认/取消)、状态徽章、API key 掩码 |
| LLM | Models | 模型列表、刷新按钮、启用/禁用开关、过滤(provider/ability/status)、搜索、清除过滤 |
| MCP | — | 添加 server(基础+env)、编辑、删除、连接/断开、连接模式切换、工具列表、工具数量徽章、刷新工具 |
| Tools | Built-in | 6 个 toggle(名称/描述/参数/启用禁用) |
| Tools | OpenAPI | 添加(文件来源+URL 来源+认证)、编辑、启用/禁用、删除、空状态 |
| Tools | CLI | 添加(自定义+预设)、编辑、删除、预设分类展示、平台过滤 |
| RAG | Overview | RAG 开关、嵌入模型选择器、向量存储选择器、自动嵌入开关 |
| RAG | Chunking | 策略选择(4 种)、大小/重叠/maxTokens/minSize |
| RAG | Search | 搜索类型(3 种)、Top-K/阈值/权重 |
| RAG | Filters | 目录排除、文件类型包含/排除、标签过滤/排除 |
| RAG | Advanced | 压缩/批量大小/索引模式/上下文限制/语义缓存/重排序/分级阈值 |
| RAG | Web Search | Provider 选择(duckduckgo/google)、maxResults |
| Prompts | — | 添加/编辑/删除系统提示 |
| Agents | — | 创建/编辑/删除、名称/描述/图标/模型策略/温度/maxTokens/toolAccess 摘要 |
| Quick Actions | — | 添加/编辑/删除动作、类型选择、模型选择、前缀设置 |
| Usage | — | 用量统计(总调用次数/token 数/按模型分组) |

### 5.3 Modals

| 弹窗 | 交互项 | Suite |
|------|--------|-------|
| Provider Config Modal | 所有字段(类型下拉/名称/API key/base URL/model filter)、保存/取消 | CI |
| Agent Edit Modal | 所有字段 + toolAccess 摘要 | CI |
| MCP Server Modal | 名称/命令/参数/env/连接模式 | CI |
| Confirm Modal | 标题/消息/确认/取消按钮 | CI |
| Text Input Modal | 输入框/placeholder/保存/取消 | CI |
| Ollama Model Manager Modal | 模型列表/下载/删除 | CI |
| Prompt Modal | 编辑区/保存/取消 | CI |
| System Prompt Edit Modal | 同步编辑 | CI |
| MCP Inspector Modal | 工具列表/工具详情 | CI |
| Searchable Reference Modal | 搜索/选择文件 | CI |
| Searchable Image Modal | 搜索/选择图片 | CI |
| Single File Selection Modal | 浏览/选择文件 | CI |
| Explain Text Modal | 显示解释内容 | CI |


### 5.4 安全

| 测试项 | 行为 | Suite |
|--------|------|-------|
| Prompt injection | 发送注入 payload→UI 不崩溃→不受控操作不发生 | CI |
| Filesystem boundary | 工具请求 `../../.git/config`→被拒 | CI |
| SSRF protection | 工具请求 `http://127.0.0.1`→被拒 | CI |
| Code sandbox | CLI 工具执行 `rm -rf /`→被拒或限制 | CI |

### 5.5 Release-only 完整链路

| 测试项 | 行为 |
|--------|------|
| Agent 循环 | 消息→agent 调用 tool→tool 执行→agent 解读结果→最终回复。3 轮工具调用验证 |
| MCP 全链路 | MCP server 连接→工具列表→LLM 调用 MCP 工具→真实执行→结果渲染 |
| 流式响应 | 真实 SSE streaming→增量 chunk 渲染 |

## 6. Mock AI 机制

### 6.1 实现

CI suite 启动前注入 `browser.mock()` 截获 LLM API:

```ts
// tests/e2e/utils/mock-ai.ts
import fs from 'fs';
import path from 'path';

function readFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, '../mocks/responses', name), 'utf-8');
}

export function mockLLMApi(): void {
  browser.mock('**/v1/chat/completions', {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: readFixture('chat-simple-reply.json'),
  });
  browser.mock('**/v1/messages', {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: readFixture('chat-anthropic-reply.json'),
  });
}

export function mockLLMApiError(code: 429 | 500): void {
  browser.mock('**/v1/chat/completions', {
    statusCode: code,
    body: code === 429
      ? readFixture('chat-error-429.json')
      : readFixture('chat-error-500.json'),
  });
}

export function mockLLMStreaming(): void {
  browser.mock('**/v1/chat/completions', {
    statusCode: 200,
    headers: { 'content-type': 'text/event-stream' },
    body: readFixture('chat-streaming-reply.txt'),
  });
}
```

### 6.2 Mock 数据文件

每个 fixture 是手动从真实 API 响应录制的一段 JSON(或 SSE 文本),模拟单次对话往返。文件包含完整 headers+body,确保插件解析层正确处理。

### 6.3 Release suite 不注入 mock

Release suite 直接调用真实 API,需要 `.env.test` 有 API 密钥。若密钥缺失,suite 退出前给出明确错误。

## 7. Page Object 设计

### 7.1 规则

- 一个 UI 元素一个方法(或 getter)
- 所有 selector 私有
- spec 不直接写 CSS selector 或 XPath
- 方法名表意:`sendMessage()` 而非 `doAction1()`

### 7.2 示例

```ts
// tests/e2e/pages/chat-view.page.ts
export class ChatViewPage {
  private get msgInput() { return $('.chat-input'); }
  private get sendBtn() { return $('.ia-send-btn'); }
  private get newChatBtn() { return $('.ia-new-chat-btn'); }
  private get stopBtn() { return $('.stop-generation-btn'); }
  private get modelSelect() { return $('.ia-model-select'); }
  private get modeSelect() { return $('.ia-mode-select'); }
  private get messages() { return $$('.ia-chat-message'); }

  async open(): Promise<void> {
    const leaf = browser.obsidian.getLeavesOfType('intelligence-assistant-chat')[0];
    if (!leaf) throw new Error('Chat view not open');
    await browser.obsidian.setActiveLeaf(leaf);
  }

  async sendMessage(text: string): Promise<void> {
    await this.msgInput.setValue(text);
    await this.sendBtn.click();
  }

  async newChat(): Promise<void> {
    await this.newChatBtn.click();
  }

  async stopGeneration(): Promise<void> {
    await this.stopBtn.click();
  }

  async selectModel(modelName: string): Promise<void> {
    await this.modelSelect.selectByVisibleText(modelName);
  }

  async switchMode(mode: 'chat' | 'agent'): Promise<void> {
    await this.modeSelect.selectByVisibleText(mode);
  }

  async getMessageCount(): Promise<number> {
    return this.messages.length;
  }

  async getLastAssistantMessage(): Promise<string> {
    const msgs = await $$('.ia-chat-message--assistant');
    return msgs[msgs.length - 1].getText();
  }
}

// tests/e2e/pages/modals/provider-config-modal.page.ts
export class ProviderConfigModalPage {
  private get modal() { return $('.modal'); }
  private get nameInput() { return $('#provider-name'); }
  private get typeSelect() { return $('#provider-type'); }
  private get apiKeyInput() { return $('#provider-api-key'); }
  private get baseUrlInput() { return $('#provider-base-url'); }
  private get saveBtn() { return $('button.mod-cta'); }

  async isOpen(): Promise<boolean> { return this.modal.isDisplayed(); }
  async setName(name: string): Promise<void> { await this.nameInput.setValue(name); }
  async selectType(type: string): Promise<void> { await this.typeSelect.selectByVisibleText(type); }
  async setApiKey(key: string): Promise<void> { await this.apiKeyInput.setValue(key); }
  async getApiKeyInputType(): Promise<string> { return this.apiKeyInput.getAttribute('type'); }
  async save(): Promise<void> { await this.saveBtn.click(); }
}
```

### 7.3 文件清单

```
tests/e2e/pages/
├── chat-view.page.ts
├── conversation-list.page.ts
├── settings/
│   ├── settings-shell.page.ts       # 设置弹窗 + tab 导航
│   ├── general-tab.page.ts
│   ├── llm-tab.page.ts
│   ├── mcp-tab.page.ts
│   ├── tools-tab.page.ts
│   ├── rag-tab.page.ts
│   ├── prompts-tab.page.ts
│   ├── agents-tab.page.ts
│   ├── quickactions-tab.page.ts
│   └── usage-tab.page.ts
└── modals/
    ├── provider-config-modal.page.ts
    ├── mcp-server-modal.page.ts
    ├── agent-edit-modal.page.ts
    ├── confirm-modal.page.ts
    └── text-input-modal.page.ts
```

Page Object 总计约 16 个文件。

## 8. Spec 示例

### 8.1 CI spec 示例

```ts
// tests/e2e/specs/ci/chat/chat-send-message.spec.ts
import { ChatViewPage } from '../../../pages/chat-view.page';
import { mockLLMApi } from '../../../utils/mock-ai';

describe('Chat - Send Message', () => {
  let chatPage: ChatViewPage;

  before(async () => {
    mockLLMApi();
    chatPage = new ChatViewPage();
    await chatPage.open();
    await chatPage.newChat();
  });

  it('should render user message after sending', async () => {
    await chatPage.sendMessage('Hello');
    const count = await chatPage.getMessageCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('should render assistant message in reply', async () => {
    const text = await chatPage.getLastAssistantMessage();
    expect(text.length).toBeGreaterThan(0);
  });

  it('should clear messages after new chat', async () => {
    await chatPage.newChat();
    const count = await chatPage.getMessageCount();
    expect(count).toBe(0);
  });
});
```

### 8.2 Release spec 示例

```ts
// tests/e2e/specs/release/real-agent-loop.spec.ts
import { ChatViewPage } from '../../pages/chat-view.page';

describe('Agent Loop - Real AI', function () {
  this.timeout(120_000);  // 2 min timeout for real AI

  let chatPage: ChatViewPage;

  before(async () => {
    chatPage = new ChatViewPage();
    await chatPage.open();
    await chatPage.switchMode('agent');
    await chatPage.newChat();
  });

  it('should complete a multi-step agent loop', async () => {
    await chatPage.sendMessage('Read README.md and summarize it');
    await browser.waitUntil(
      async () => (await chatPage.getMessageCount()) >= 3,
      { timeout: 90_000, timeoutMsg: 'Agent loop did not complete' }
    );
    const finalMsg = await chatPage.getLastAssistantMessage();
    expect(finalMsg.length).toBeGreaterThan(0);
  });
});
```

## 9. CI 集成

### 9.1 npm scripts

```json
{
  "test:e2e:ci": "wdio run tests/e2e/config/wdio.ci.conf.ts",
  "test:e2e:release": "wdio run tests/e2e/config/wdio.release.conf.ts",
  "test:e2e:ci:security": "wdio run tests/e2e/config/wdio.ci.conf.ts --spec 'specs/ci/security/**'",
  "test:e2e:ci:chat": "wdio run tests/e2e/config/wdio.ci.conf.ts --spec 'specs/ci/chat/**'",
  "test:e2e:ci:settings": "wdio run tests/e2e/config/wdio.ci.conf.ts --spec 'specs/ci/settings/**'"
}
```

旧 E2E scripts(`test:e2e`、`test:e2e:headed`、`test:e2e:chrome`、`test:e2e:firefox` 等)继续保留但指向旧配置(直到新套件完全取代)。

### 9.2 GitHub Actions(建议,本次不实现)

```yaml
e2e-ci:
  runs-on: macos-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npm run test:e2e:ci
  # 约 5-8 分钟(含 Obsidian 安装+启动)

e2e-release:
  runs-on: macos-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npm run test:e2e:release
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  # 约 15 分钟
```

## 10. 分期

### 第 1 期:基础设施 + Page Object 层 + Chat View CI specs

- 建新目录结构(`tests/e2e/pages/`、`tests/e2e/specs/ci/`、`tests/e2e/mocks/`)
- 实现所有 Page Object 类(16 个)
- 实现 mock AI 注入工具 + 8 个 mock fixture JSON
- 实现 Chat View CI specs(5 个文件)
- 实现 CI wdio 配置(继承现有 `wdio.conf.ts`)
- 编写 1-2 个 Release spec 骨架验证全链路可跑
- 删除旧的 `tests/e2e/specs/`

### 第 2 期:Settings 全部 CI specs

- 实现全部 Settings tab specs(14 个文件)
- 实现 Security specs(4 个文件)
- Accessibility spec

### 第 3 期:Release specs + CI 集成

- 实现完整 Release specs(3 个文件)
- GitHub Actions workflow 文件
- 文档(README 里加上 E2E 说明)

## 11. 明确不做

- 旧 42 个 spec 文件的修复(直接删除)
- 视觉回归测试(`visual-regression.spec.ts`)—— 旧版本已桩代码化,不在本次
- 移动端响应测试 —— 旧版有基础覆盖,保留旧配置不改
- 性能/负载测试 —— 旧版有基础覆盖,保留旧配置不改
- 推广截图(screenshots) —— 保留旧配置不改
