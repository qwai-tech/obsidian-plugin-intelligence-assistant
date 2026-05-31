# Chat UI 视觉重设计 Design Spec

## 目标

将聊天界面从"多层嵌套卡片 + 重型控制栏"重设计为"极简单行头部 + 输入框全能工具栏（A3）"风格，消息区获得约 +30% 可见高度，禁用功能不渲染，Agent 参数全移至 Settings 页。

## 设计决策记录

| 决策 | 结论 | 理由 |
|------|------|------|
| 整体风格 | A3 极简主义 · 输入框全能模式 | 侧边栏空间紧张，头部应极度轻量 |
| Agent 参数入口 | X3 完全移至 Settings 页 | 温度/Token 是 per-agent 配置，不是对话操作 |
| 禁用功能项 | 完全不渲染 | 不可用的选项不应占据视觉空间 |

---

## 变化范围

### 1. 头部（ChatHeaderComponent）

**Before：** 3 行（action row + toolbar-b 卡片 + 内部子行），带边框和背景色。

**After：** 单行，无边框，无背景色。

```
[ 📋 icon ]  [ 对话标题（截断） ]  [ 🤖 AgentBadge（仅 Agent 模式） ]  [ + icon ]
```

- 历史图标按钮（`list` icon）→ 打开对话列表
- 对话标题（flex-1，overflow ellipsis）
- Agent 名称 badge（仅 Agent 模式下显示，样式：绿色底 `#dcfce7`，绿色文字 `#15803d`，`🤖 Agent名`，纯展示，不可点击切换——切换入口在输入框工具栏）
- 新建对话图标按钮（`plus` icon）
- 移除：模式选择 select、提示词选择 select、Agent 选择 select、模型选择 select、温度滑块、Token 输入、Top-P、频率惩罚、存在惩罚、token 统计 chip、模型数量 chip、参数展开按钮

CSS 变化：
- `.chat-toolbar-b` → 删除该 div 及其所有内容，或设为 `display: none`
- `.chat-action-row` → 保留结构，移除 margin-bottom，简化为单行 flex
- 新增 `.chat-header-simple`：`display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid var(--background-modifier-border);`

### 2. 输入框（ChatInputComponent）

**Before：** 外层 `.chat-input-container`（背景色 + 边框 + 圆角卡片），内层 `.chat-input-editor`（再次边框），共两层嵌套。

**After：** 外层透明无样式，内层单一圆角边框容器（`.chat-input-box`）包含两行：

```
┌─────────────────────────────────────────┐
│  [对话▾]  [GPT-4o▾]    [📎]  [📖]      │  ← 工具栏行
├─────────────────────────────────────────┤
│  输入消息…                          [↑]  │  ← 文本行
└─────────────────────────────────────────┘
```

**工具栏行（左侧）：**
- 模式切换：原生 `<select class="chat-input-mode-pill">` 样式化为 pill，值为 `chat` / `agent`
- 模型选择：原生 `<select class="chat-input-model-pill">` 样式化为 pill，选项同现有模型列表
- Agent 模式下：模型 select 隐藏，替换为 Agent `<select class="chat-input-agent-pill">`（`🤖 Agent名`）
- 两个 pill 均使用 `appearance: none` + 自定义背景色，保持原生下拉行为（无需自定义弹窗）

**工具栏行（右侧，按需显示）：**

| 功能 | 显示条件 | 激活样式 | 未激活样式 | 禁用 |
|------|---------|---------|-----------|------|
| 📎 引用 | 始终显示 | dashed border | dashed border | — |
| 📖 RAG | `settings.ragConfig.enabled === true` | 绿底绿字 | 灰图标 | 不渲染 |
| 🔍 网搜 | 已配置网搜 API | 蓝底蓝字 | 灰图标 | 不渲染 |
| 🖼 图片 | 当前模型支持 vision | 正常 | 灰图标 | 不渲染 |

**文本行：**
- `textarea.chat-input`：`min-height: 36px`，自动增高至 `max-height: 200px`
- 发送按钮（`ia-send-btn`）：无内容时灰色不可点，有内容时变 `--interactive-accent`
- 流式生成时：发送按钮替换为停止按钮（`stop-generation-btn`，方块图标），工具栏右侧功能图标临时隐藏
- 发送提示文字（"按 Enter 发送 ↵"）：移除，不在新设计中渲染

CSS 变化：
- `.chat-input-container` → 移除 `background`, `border`, `border-radius`, `padding`，改为透明容器仅保持 `padding: 8px 10px 10px`
- 新增 `.chat-input-box`：`border: 1.5px solid var(--background-modifier-border); border-radius: 12px; overflow: hidden;`
- 新增 `.chat-input-toolbar`：`display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--background-modifier-border-hover);`
- 新增 `.chat-input-mode-pill` / `.chat-input-model-pill`：`border: none; border-radius: 8px; padding: 2px 8px; font-size: var(--ia-font-size-2xs); cursor: pointer;`
- `.chat-input-editor` → 移除外层边框，改为 `display: flex; align-items: flex-end; gap: 6px; padding: 8px 10px;`
- `.header-action-btn.is-disabled` → 不渲染（JS 层面：条件不满足则不调用 `createHeaderActionButton`）

### 3. Agent 模式

**Before：** 模型参数展开面板（温度、Max Tokens、Top-P、频率惩罚、存在惩罚）在 Header 内，Agent 配置摘要 chip 行在 Header 内，合计占 ~35% 屏幕高度。

**After：**
- 以上所有参数控件从 ChatHeaderComponent 完全删除
- Agent 模式下头部单行显示 Agent badge（绿色），点击可切换 Agent
- 输入框工具栏左侧：`🤖 Agent名▾` pill（点击弹出 Agent 切换下拉）
- 输入框工具栏右侧：📎（始终）+ RAG/网搜（按配置条件）
- ChatHeaderComponent 中 `agentConfigSummaryEl`、`agentSummaryDetailsEl`、`temperatureSlider`、`maxTokensInput`、`topPSlider`、`frequencyPenaltySlider`、`presencePenaltySlider` 等字段及其渲染逻辑删除
- ChatView 中 `onTemperatureChange`、`onMaxTokensChange`、`onTopPChange`、`onFrequencyPenaltyChange`、`onPresencePenaltyChange` 回调不再需要传入 Header

### 4. 消息区

无结构变化，仅受益于头部和输入区高度缩减：消息区可用高度增加约 70–100px。

---

## 组件变化索引

| 文件 | 变化类型 | 摘要 |
|------|---------|------|
| `src/presentation/components/chat/chat-header.component.ts` | 大幅精简 | 删除 toolbar-b 行及所有参数控件，只保留单行头部 |
| `src/presentation/components/chat/chat-input.component.ts` | 重构 | 新工具栏结构，按条件渲染功能按钮，删除外层卡片 |
| `src/presentation/views/chat-view.ts` | 中等修改 | 更新 ChatHeaderCallbacks（移除参数回调），更新 configure() 调用 |
| `styles.css` | CSS 修改 | 新增 3–4 个类，修改 6–8 个现有类 |

---

## 不在本次范围内

- 消息气泡样式（颜色、圆角、间距）不变
- 对话历史列表面板不变
- Settings 页面的 Agent 编辑器（温度等参数已在那里，无需改动）
- 深色主题适配（Obsidian CSS 变量自动处理）

---

## 验收标准

1. 头部为单行，无卡片边框/背景色
2. 对话模式：输入框工具栏显示"对话▾"+"模型名▾"，右侧仅显示已配置可用的功能图标
3. Agent 模式：头部出现 Agent badge，输入框工具栏显示"🤖 Agent名▾"
4. 禁用功能（图片不支持当前模型、RAG 未启用、网搜未配置）：完全不渲染
5. 温度/Max Tokens 等参数控件在聊天界面完全消失
6. 消息区可见消息数比改前多 1–2 条（320px 宽侧边栏测试）
7. `npm run lint` 通过，`npm run build` 通过
