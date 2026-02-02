# E2E 测试映射和实施计划

## 当前 E2E 测试覆盖情况

### ✅ 已有 E2E 测试

#### 1. 聊天系统 (Chat System)
- **tests/e2e/specs/chat/chat-view.spec.ts**
  - ✅ TC-CHAT-001: 打开聊天视图
  - ✅ TC-CHAT-004: 切换到 Chat 模式
  - ✅ TC-CHAT-005: 切换到 Agent 模式
  - ✅ TC-CHAT-006: 发送文本消息 (已注释,需要恢复)
  - ✅ TC-CHAT-043: 选择模型
  - ⚠️ 大量测试被注释 (需要恢复)

#### 2. 设置 - LLM 提供商
- **llm-provider-crud.spec.ts**
  - ✅ TC-SETTINGS-003: 添加 OpenAI 提供商
  - ✅ TC-SETTINGS-006: 编辑提供商配置
  - ✅ TC-SETTINGS-007: 删除提供商

- **llm-integration.spec.ts**
  - ✅ 提供商集成测试

- **llm-models.spec.ts**
  - ✅ TC-SETTINGS-009: 启用/禁用模型
  - ✅ TC-SETTINGS-010: 筛选模型 - 按提供商
  - ✅ TC-SETTINGS-012: 搜索模型

- **llm-error-states.spec.ts**
  - ✅ TC-STABILITY-002: API 错误处理

- **llm-security.spec.ts**
  - ✅ TC-SECURITY-006: API Key 存储加密 (部分)
  - ✅ TC-SECURITY-008: XSS 防护 (部分)

- **llm-ollama.spec.ts**
  - ✅ TC-SETTINGS-005: 添加 Ollama 提供商

#### 3. 设置 - MCP
- **mcp-crud.spec.ts**
  - ✅ TC-SETTINGS-013: 添加 MCP 服务器
  - ✅ 编辑/删除 MCP 服务器

- **mcp-connection.spec.ts**
  - ✅ TC-SETTINGS-014: 测试 MCP 连接

- **mcp-tools.spec.ts**
  - ✅ TC-SETTINGS-015: 查看 MCP 工具

#### 4. 设置 - RAG
- **rag-overview.spec.ts**
  - ✅ TC-SETTINGS-020: 配置向量存储
  - ✅ TC-SETTINGS-022: 查看索引统计

- **rag-chunking.spec.ts**
  - ✅ RAG 分块配置测试

- **rag-search.spec.ts**
  - ✅ RAG 搜索功能测试

#### 5. 设置 - Quick Actions
- **quickactions-crud.spec.ts**
  - ✅ TC-SETTINGS-027: 创建快速操作

#### 6. 设置 - Tools
- **tools-builtin.spec.ts**
  - ✅ TC-SETTINGS-017: 管理内置工具

- **tools-openapi-crud.spec.ts**
  - ✅ TC-SETTINGS-018: 添加 OpenAPI 工具源

#### 7. 工作流
- **workflow-editor.spec.ts**
  - ✅ TC-WORKFLOW-001: 创建工作流
  - ✅ TC-WORKFLOW-003: 添加 AI 节点
  - ✅ TC-WORKFLOW-007: 连接节点
  - ✅ TC-WORKFLOW-012: 运行简单工作流

---

## ❌ 缺失的关键 E2E 测试

### 优先级 P0 (Critical)

#### 1. CLI 提供商测试 (新增)
- ❌ **TC-CLI-001**: 添加 Claude Code 提供商
- ❌ **TC-CLI-002**: CLI 提供商不可用时的处理
- ❌ **TC-CLI-003**: CLI 提供商调用失败处理
- ❌ **TC-CLI-004**: CLI commandPath 配置

**实施文件**: `tests/e2e/specs/settings/llm-cli-providers.spec.ts`

#### 2. 安全测试 (新增)
- ❌ **TC-SECURITY-001**: Prompt Injection 防护
- ❌ **TC-SECURITY-002**: 工具调用权限隔离
- ❌ **TC-SECURITY-003**: 文件系统访问边界
- ❌ **TC-SECURITY-005**: 代码执行沙箱
- ❌ **TC-SECURITY-007**: SSRF 防护

**实施文件**:
- `tests/e2e/specs/security/prompt-injection.spec.ts`
- `tests/e2e/specs/security/tool-permissions.spec.ts`
- `tests/e2e/specs/security/filesystem-boundary.spec.ts`
- `tests/e2e/specs/security/code-sandbox.spec.ts`

#### 3. 配置验证测试 (新增)
- ❌ **TC-CONFIG-001**: LLM 配置验证 - 空 provider
- ❌ **TC-CONFIG-002**: 无效 URL 格式验证
- ❌ **TC-CONFIG-003**: MCP 服务器配置验证

**实施文件**: `tests/e2e/specs/settings/config-validation.spec.ts`

### 优先级 P1 (High)

#### 4. 聊天核心功能 (需恢复被注释的测试)
- ⚠️ **TC-CHAT-006**: 发送文本消息 (已注释)
- ⚠️ **TC-CHAT-015**: 重新生成 AI 回复 (已注释)
- ❌ **TC-CHAT-019**: 添加文件引用
- ❌ **TC-CHAT-022**: 上传图片附件
- ❌ **TC-CHAT-028**: 启用 RAG 检索
- ❌ **TC-CHAT-031**: 启用 Web 搜索

**实施文件**:
- 恢复 `tests/e2e/specs/chat/chat-view.spec.ts` 中被注释的测试
- 新增 `tests/e2e/specs/chat/chat-attachments.spec.ts`
- 新增 `tests/e2e/specs/chat/chat-rag.spec.ts`

#### 5. 智能体系统 (完全缺失)
- ❌ **TC-AGENT-001**: 创建新智能体
- ❌ **TC-AGENT-002**: 编辑现有智能体
- ❌ **TC-AGENT-006**: 配置固定模型策略
- ❌ **TC-AGENT-009**: 配置工具权限
- ❌ **TC-AGENT-013**: 选择智能体

**实施文件**: `tests/e2e/specs/settings/agent-crud.spec.ts`

#### 6. 模型能力测试 (新增)
- ❌ **TC-CAPABILITY-001**: JSON 模式测试
- ❌ **TC-CAPABILITY-002**: Reasoning 模式测试

**实施文件**: `tests/e2e/specs/chat/model-capabilities.spec.ts`

#### 7. 对话管理 (部分缺失)
- ❌ **TC-CHAT-034**: 创建新对话
- ❌ **TC-CHAT-036**: 查看对话历史列表
- ❌ **TC-CHAT-037**: 切换到历史对话
- ❌ **TC-CHAT-039**: 删除对话

**实施文件**: `tests/e2e/specs/chat/conversation-management.spec.ts`

#### 8. 错误恢复测试 (新增)
- ❌ **TC-RECOVERY-001**: 断网恢复
- ❌ **TC-RECOVERY-003**: 配置损坏恢复
- ❌ **TC-RECOVERY-004**: API 限流处理

**实施文件**: `tests/e2e/specs/stability/error-recovery.spec.ts`

### 优先级 P2 (Medium)

#### 9. 提供商特定测试
- ❌ **TC-SAP-001**: 添加 SAP AI Core 提供商
- ❌ **TC-OPENROUTER-001**: 添加 OpenRouter 提供商
- ❌ **TC-CAPABILITY-004**: 音频输入测试
- ❌ **TC-CAPABILITY-005**: 视频输入测试

**实施文件**: `tests/e2e/specs/settings/llm-special-providers.spec.ts`

#### 10. 上下文菜单操作 (完全缺失)
- ❌ **TC-CONTEXT-001**: 使用快速操作 - Make Longer
- ❌ **TC-CONTEXT-002**: 使用快速操作 - Summarize
- ❌ **TC-CONTEXT-003**: 使用快速操作 - Explain

**实施文件**: `tests/e2e/specs/editor/context-menu-actions.spec.ts`

#### 11. 性能测试 (新增)
- ❌ **TC-PERF-001**: 插件启动速度
- ❌ **TC-PERF-002**: 流式响应性能
- ❌ **TC-PERF-006**: 大消息处理性能

**实施文件**: `tests/e2e/specs/performance/performance.spec.ts`

---

## 📋 实施计划

### Phase 1: 修复和恢复 (立即执行)
1. ✅ 恢复 chat-view.spec.ts 中被注释的测试
2. ✅ 确保现有测试通过

### Phase 2: P0 关键测试 (本周)
1. ✅ CLI 提供商测试
2. ✅ 配置验证测试
3. ✅ 核心安全测试

### Phase 3: P1 高优先级 (下周)
1. ✅ 智能体系统完整测试
2. ✅ 对话管理测试
3. ✅ 聊天附件和 RAG 测试
4. ✅ 模型能力测试

### Phase 4: P2 中优先级 (后续)
1. ✅ 特殊提供商测试
2. ✅ 上下文菜单测试
3. ✅ 性能测试

---

## 📊 测试覆盖率目标

| 模块 | 当前覆盖 | 目标覆盖 |
|------|---------|---------|
| 聊天系统 | 20% | 85% |
| 智能体系统 | 0% | 80% |
| 工作流系统 | 60% | 85% |
| 设置 - LLM | 70% | 95% |
| 设置 - MCP | 80% | 95% |
| 设置 - RAG | 70% | 85% |
| 设置 - Tools | 60% | 80% |
| 安全测试 | 15% | 90% |
| 性能测试 | 0% | 60% |
| **总体** | **35%** | **85%** |
