export type WidgetType = "text" | "visual" | "ai" | "object" | "folder";
export type VisualSubType = "chart" | "table" | "diagram";

export interface WidgetDef {
	type: WidgetType;
	label: string;
	description: string;
	colorClass: string;
	defaultW: number;
	defaultH: number;
}

export interface VisualSubTypeDef {
	type: VisualSubType;
	label: string;
	description: string;
}

export interface PanelConfig {
	type: WidgetType;
	visualSubType: VisualSubType;
	title: string;
	color: string;
	w: number;
	h: number;
	textBody: string;
	aiPrompt: string;
	aiLinkedPanels: number[];
	aiAgentId: string;
	aiSystemPrompt: string;
	aiModel: string;
	aiTemperature: number;
	aiMaxTokens: number;
	aiProviderId: string;
	aiOrchestrationMode: string;
	aiEnabledTools: string[];
	folderPath: string;
	folderMaxDepth: number;
	folderExcludePatterns: string;
	diagramCode: string;
}

export interface PanelDraft extends PanelConfig {
	id: string;
	savedAt: string;
}

export type Direction = "left" | "right" | "top" | "bottom";

export interface Connection {
	fromX: number;
	fromY: number;
	fromDir: Direction;
	toX: number;
	toY: number;
	toDir: Direction;
	color: string;
	edgeId?: string;
	isAutoChain?: boolean;
}

/** パネル間のデータフローを表す有向エッジ */
export interface PipelineEdge {
	id: string; // "edge-{sourceId}-{targetId}"
	sourceWidgetId: number; // 出力を提供するパネル
	targetWidgetId: number; // 出力を受け取るパネル
	autoChain: boolean; // source完了時にtargetを自動実行するか
	condition?: string; // 通過条件（source出力に対するキーワード条件）
	maxRetries?: number; // ターゲットのリトライ回数上限
	retryDelayMs?: number; // リトライ間隔(ms)
}

/** ワークフローテンプレートのパネル定義 */
export interface WorkflowTemplatePanelDef {
	type: WidgetType;
	visualSubType?: VisualSubType;
	title: string;
	color: string;
	w: number;
	h: number;
	aiPrompt?: string;
	aiSystemPrompt?: string;
	aiMaxTokens?: number;
	aiEnabledTools?: string[];
	aiOrchestrationMode?: string;
	diagramCode?: string;
	textBody?: string;
	needsFolderPath?: boolean;
	needsAgent?: boolean;
}

/** ワークフローテンプレートのエッジ定義 */
export interface WorkflowTemplateEdgeDef {
	sourceIndex: number;
	targetIndex: number;
	condition?: string;
	maxRetries?: number;
	retryDelayMs?: number;
}

/** ワークフローテンプレート定義 */
export interface WorkflowTemplateDef {
	id: string;
	label: string;
	description: string;
	panels: WorkflowTemplatePanelDef[];
	edges: WorkflowTemplateEdgeDef[];
}

/** パイプライン全体の実行状態 */
export type PipelineStatus =
	| "idle"
	| "running"
	| "completed"
	| "failed"
	| "stopped";

// === 1. 実行タイムライン ===
export interface TimelineEntry {
	id: string;
	widgetId: number;
	widgetTitle: string;
	status: "running" | "completed" | "failed";
	message: string;
	timestamp: number;
	durationMs?: number;
}

// === 3. テンプレート保存 ===
export interface DashboardTemplate {
	id: string;
	name: string;
	description: string;
	layout: unknown[];
	edges: PipelineEdge[];
	widgetCount: number;
	savedAt: string;
}

// === 4. トースト通知 ===
export interface ToastMessage {
	id: string;
	type: "success" | "error" | "info" | "warning";
	title: string;
	message?: string;
	duration?: number;
}

// === 8. スナップショット ===
export interface DashboardSnapshot {
	version: number;
	name: string;
	dashboardId: string;
	layout: unknown[];
	edges: PipelineEdge[];
	widgetCount: number;
	exportedAt: string;
}

// === 9. ツール/プラグイン ===
export interface ToolDefinition {
	id: string;
	name: string;
	description: string;
	parameters: ToolParameter[];
	endpoint?: string;
}

export interface ToolParameter {
	name: string;
	type: "string" | "number" | "boolean";
	description: string;
	required: boolean;
}

/** バックエンドから取得するツール定義（LLM APIスキーマ形式） */
export interface BackendToolDef {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

/** エージェントのツール権限設定 */
export interface AgentToolConfig {
	tool_name: string;
	is_enabled: boolean;
	config?: Record<string, unknown>;
}

/** エージェントのツール権限レコード（DBから取得） */
export interface AgentToolPermission {
	id: string;
	agent_id: string;
	tool_name: string;
	is_enabled: boolean;
	config: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
}

// === 10. コラボレーション ===
export interface CollaborationUser {
	id: string;
	name: string;
	color: string;
	lastSeen: number;
}

/** パイプライン実行で共有されるウィジェットデータアクセス */
export interface WidgetDataContext {
	getPipelineEdges: () => PipelineEdge[];
	getPanelOutputs: () => Record<number, string>;
	setPanelOutput: (widgetId: number, output: string) => void;
}
