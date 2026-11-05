# 开发指南 — 0.1.0

[English](project-guide-en.md) · [架构](../architecture/overview-zh.md) · [测试](../reference/testing.md)

## 构建与本地部署

使用与构建/发布工作流一致的 Node.js 22，通过仓库锁文件安装：

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm run build:production
```

`build` 生成开发构建，`build:production` 生成生产构建及 `artifact-provenance.json`。除非显式覆盖，两者都会检查源文件并执行 TypeScript 检查。来源记录包含源代码提交、构建输入哈希，以及 `main.js`、`styles.css`、`manifest.json` 的哈希。

仅部署到可丢弃的 QA 库：

```bash
OBSIDIAN_PLUGINS_PATH=/absolute/path/to/qa-vault/.obsidian/plugins node scripts/deploy.js --local
```

如果库配置目录不是 `.obsidian`，使用实际路径。核对部署文件哈希和实际加载版本。不要提交运行数据或凭据。`npm run dev` 用于开发/监听，不生成发布生产包。

## 建议的阅读顺序

1. [`main.ts`](../../main.ts)：注册、设置加载、启动/延迟任务和生命周期。
2. [`create-services.ts`](../../src/bootstrap/create-services.ts)：服务装配与所有权。
3. [`settings-store.ts`](../../src/features/settings/settings-store.ts) 和 [`obsidian-settings-persistence.ts`](../../src/bootstrap/obsidian-settings-persistence.ts)：状态事务与实际存储。
4. [`chat-view.ts`](../../src/ui/views/chat-view.ts) / [`chat-controller.ts`](../../src/ui/chat/controllers/chat-controller.ts)：界面请求流程。
5. [`agent-engine-loop.ts`](../../src/features/agent/agent-engine-loop.ts)、[`turn-kernel.ts`](../../src/features/agent/kernel/turn-kernel.ts) 和 [`task-checkpoint.ts`](../../src/features/agent/task-checkpoint.ts)：策略、执行和手动续跑。
6. [`tool-source-manager.ts`](../../src/features/tools/tool-source-manager.ts) 和 [`tool-registry.ts`](../../src/features/tools/tool-registry.ts)：工具源生命周期、身份和分派。
7. [`provider-definitions.ts`](../../packages/obsidian-llm/src/provider-definitions.ts) 和 [`request-budget.ts`](../../packages/obsidian-llm/src/request-budget.ts)：提供商构建/发现与请求预算。

目录职责见[源码导航](../reference/project-structure.md)。实际导入限制以 `eslint.config.mts` 为准，不要假设所有功能代码都与宿主无关。

## 持久化

当前设置以 format-2 文档保存在 `<插件目录>/data.json`，包含配置、提供商、提示词和智能体。所有修改通过 `plugin.updateSettings(change)`。`SettingsStore` 串行处理本地更新、验证文档，持久化失败后恢复工作状态。适配器使用 Obsidian `saveData`，并保留 `data.json.bak`。

`LegacySettingsFiles` 读取旧的 `config/user/settings.json` 等分散设置，成功保存迁移结果后移除旧文件。迁移后继续断言旧路径存在，是错误的测试假设，应检查当前 `data.json` 或使用运行时帮助函数。

其他记录仍在 `data/` 中，包括会话 JSON、智能体 JSONL 日志、缓存、用量、记忆和向量索引。使用 `JsonFile` 的仓库具有临时文件/重命名恢复，不应扩展解释为多文件、跨进程或 Sync 原子性。

`SecretVault` 由 Obsidian SecretStorage 实现。提供商/SAP/搜索/OpenAPI 凭据字段在磁盘保存引用，在运行时解析值；任意 CLI/MCP 环境变量不自动移除。不要把完整运行时设置写入测试输出。

## 工具、副作用与集成

- 在 `sources/builtin-tool-source.ts` 注册内置工具，验证参数并声明副作用。
- 内置知识库写入工具必须先返回受支持的提案，不得预先修改文件；自动应用还需要智能体设置与宿主授权。
- CLI/MCP/HTTP 是外部配置的能力，不是由内置提案机制提供沙箱的扩展。
- 新增/删除工具源定义时应重新同步来源；仅重新加载现有注册表不会注册新来源。
- 任务期间保持工具绑定稳定，源重载后应拒绝旧绑定，不应按相同显示名称改派到其他实现。
- 参数证据契约属于显式可信配置，不会从自然语言普遍推断必须读取哪个来源。

新增提供商时，同时更新包内注册表、相应 UI 元数据、模型能力和协议处理，不应让构建与发现走不同的分派路径。自定义连接需保留提供商实例身份。

新增设置时，更新功能类型、编解码/文档验证、迁移和相应控件。面向用户的文字通过 `t()` 和本地语言资源管理。

## 选择验证路径

仓库同时存在 mock 与真实测试。`npm run verify`、Jest/任务/性能测试及 CI E2E 包含 mock，不能替代真实提供商调用；会话明确禁止 mock 时，不应执行这些路线。

禁止 mock 的发布入口是 `npm run verify:release:real`。它需要已提交源码、生产构建来源和真实提供商凭据，冻结同一构建执行四项必需测试，包括完整长任务。环境变量与验收规则见[测试文档](../reference/testing.md)，运行期间不得修改源代码或构建文件。

仅限后处理工具的修正可通过验证器的显式 tooling 模式复核保留证据：允许路径受限，唯一允许的测试格式整理必须生成完全相同的 JavaScript，原始 JUnit 哈希会被记录，生产输入/产物也必须匹配。改变提示词、超时、验收条件或应用行为，不能复用旧结果。

## 版本与发布

`node scripts/version.js minor` 更新 package.json、manifest.json、versions.json 及根锁文件版本字段。应保留格式并审阅差异。库包有独立版本，不是第二份插件清单。

已有的 `.github/workflows/ci-cd.yml` 在 main/master 正常推送时自动发布：当 manifest 版本没有对应标签，且构建、真实门禁均通过时，上传同一份经过验证的构建。标签和 Release 应由工作流创建；提前创建版本标签会使版本检查跳过发布。所需 E2E Secrets 必须配置好，服务也必须能从 GitHub 托管执行器访问。

当前发布指令是不带 CI 跳过标记正常推送，并保留现有工作流。E2E Tests 和 Verification Gate 独立运行且包含 mock，不是发布任务的依赖；CodeQL 和 Dependabot 由 GitHub 托管。应核对实际执行结果，不能把推送成功当成发布成功。详见[测试与 CI/CD](../reference/testing.md#ci-behavior-and-publication)。
