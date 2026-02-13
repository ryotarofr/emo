export type WidgetType = "text" | "visual" | "ai" | "object";
export type VisualSubType = "chart" | "table";

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

export interface PanelDraft {
	id: string;
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
	savedAt: string;
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
}
