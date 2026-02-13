import type { VisualSubTypeDef, WidgetDef } from "./types";

export const WIDGET_DEFS: WidgetDef[] = [
	{
		type: "text",
		label: "テキスト",
		description: "テキストエディタ付きパネル",
		colorClass: "type-text",
		defaultW: 16,
		defaultH: 11,
	},
	{
		type: "visual",
		label: "ビジュアルデータ",
		description: "チャート・テーブルなどの可視化パネル",
		colorClass: "type-visual",
		defaultW: 16,
		defaultH: 16,
	},
	{
		type: "ai",
		label: "AI連携",
		description: "AI機能と連携するパネル",
		colorClass: "type-ai",
		defaultW: 16,
		defaultH: 11,
	},
	{
		type: "object",
		label: "オブジェクト",
		description: "オブジェクトを配置するパネル",
		colorClass: "type-object",
		defaultW: 12,
		defaultH: 11,
	},
];

export const VISUAL_SUBTYPES: VisualSubTypeDef[] = [
	{ type: "chart", label: "チャート", description: "グラフで可視化" },
	{ type: "table", label: "テーブル", description: "表形式で表示" },
];

export const COLOR_PRESETS = [
	{ label: "Coral", value: "#eb5e41" },
	{ label: "Green", value: "#2e7d32" },
	{ label: "Blue", value: "#1565c0" },
	{ label: "Orange", value: "#e65100" },
	{ label: "Purple", value: "#6a1b9a" },
	{ label: "Teal", value: "#00695c" },
	{ label: "Gray", value: "#546e7a" },
];

export const DRAFTS_STORAGE_KEY = "panel-drafts";
