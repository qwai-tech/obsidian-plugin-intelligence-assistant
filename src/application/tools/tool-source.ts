/**
 * ToolSource —— 工具来源的统一接口。
 * builtin / mcp / openapi / cli 四种来源都实现它;ToolRegistry 一视同仁。
 */
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';

export interface ToolSource {
	/** 来源种类 */
	readonly kind: ToolSourceKind;
	/** 来源实例 id:builtin → 'builtin';mcp → server 名;openapi/cli → config.id */
	readonly id: string;
	/** 展示用名称 */
	readonly label: string;
	/** 加载该来源的工具(MCP 连接、OpenAPI 拉 spec、builtin/cli 同步构造) */
	load(): Promise<SourceTool[]>;
	/** 释放资源(MCP 断连;其余 no-op) */
	dispose(): Promise<void>;
}
