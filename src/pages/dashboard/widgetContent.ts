import { WIDGET_DEFS } from "./constants";
import type { PanelConfig, VisualSubType, WidgetType } from "./types";

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export const menuHtml = (id: number) =>
	`<div class="widget-menu" data-widget-id="${id}"><button class="widget-menu-btn" type="button" title="メニュー"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button><div class="widget-menu-dropdown"><button class="widget-menu-item" data-action="edit" type="button">編集</button><button class="widget-menu-item widget-menu-item-danger" data-action="delete" type="button">削除</button></div></div>`;

export function makeTextContent(
	id: number,
	title: string,
	color: string,
	textBody: string,
): string {
	const t = escapeHtml(title);
	return `<div class="widget-text" data-widget-id="${id}" data-widget-type="text"><div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body">${textBody}</div></div>`;
}

export function makeChartContent(
	id: number,
	title: string,
	color: string,
): string {
	const t = escapeHtml(title);
	const bars = Array.from(
		{ length: 8 },
		() => Math.floor(Math.random() * 80) + 20,
	);
	const barsHtml = bars
		.map(
			(h) =>
				`<div class="chart-bar" style="height:${h}%;background:linear-gradient(to top, ${color}, ${color}66)"></div>`,
		)
		.join("");
	return `<div class="widget-chart" data-widget-id="${id}" data-widget-type="visual" data-widget-subtype="chart"><div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><div class="chart-placeholder">${barsHtml}</div></div></div>`;
}

export function makeTableContent(
	id: number,
	title: string,
	color: string,
): string {
	const t = escapeHtml(title);
	const rows = [
		["Item A", "120", "+5%"],
		["Item B", "85", "-2%"],
		["Item C", "230", "+12%"],
		["Item D", "67", "+1%"],
	];
	const rowsHtml = rows
		.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`)
		.join("");
	return `<div class="widget-table" data-widget-id="${id}" data-widget-type="visual" data-widget-subtype="table"><div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><table><thead><tr><th>Name</th><th>Value</th><th>Change</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
}

export function makeAiContent(
	id: number,
	title: string,
	color: string,
	aiPrompt: string,
	aiLinkedPanels: number[],
	agentId: string,
	orchestrationMode = "none",
): string {
	const t = escapeHtml(title);
	const p = escapeHtml(aiPrompt);
	const linked = aiLinkedPanels.join(",");
	const aid = escapeHtml(agentId);
	const promptPreview = aiPrompt
		? `<div class="ai-prompt-preview">${escapeHtml(aiPrompt.length > 80 ? `${aiPrompt.slice(0, 80)}...` : aiPrompt)}</div>`
		: "";
	const linkedLabel = aiLinkedPanels.length
		? `<div class="ai-linked-label">連携: ${aiLinkedPanels.map((x) => `#${x}`).join(", ")}</div>`
		: "";
	const execArea = `<div class="ai-exec-area"><button class="ai-exec-btn" data-action="ai-execute" data-widget-id="${id}" type="button">実行</button>${
		orchestrationMode !== "none"
			? `<button class="ai-orchestrate-btn" data-action="ai-orchestrate" data-widget-id="${id}" type="button">オーケストレート</button>`
			: ""
	}<span class="ai-status-badge" data-status-id="${id}"></span></div><div class="ai-output-area" data-output-id="${id}"></div>`;
	const planArea =
		orchestrationMode === "approval"
			? `<div class="ai-plan-area" data-plan-id="${id}" style="display:none"><div class="ai-plan-content"></div><div class="ai-plan-actions"><button class="ai-approve-btn" data-action="ai-approve" data-widget-id="${id}" type="button">承認</button><button class="ai-reject-btn" data-action="ai-reject" data-widget-id="${id}" type="button">却下</button></div></div>`
			: "";
	const subAgentsArea =
		orchestrationMode !== "none"
			? `<div class="ai-sub-agents-area" data-sub-agents-id="${id}"></div>`
			: "";
	return `<div class="widget-ai" data-widget-id="${id}" data-widget-type="ai" data-ai-prompt="${p}" data-ai-linked="${linked}" data-ai-agent-id="${aid}" data-ai-orchestration-mode="${orchestrationMode}"><div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><div class="ai-widget-content">${promptPreview}${linkedLabel}${execArea}${planArea}${subAgentsArea}</div></div></div>`;
}

export function makeObjectContent(
	id: number,
	title: string,
	color: string,
): string {
	const t = escapeHtml(title);
	return `<div class="widget-object" data-widget-id="${id}" data-widget-type="object"><div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><div class="widget-placeholder">オブジェクトパネル（準備中）</div></div></div>`;
}

export function makeWidgetContent(
	type: WidgetType,
	id: number,
	title: string,
	color: string,
	cfg?: {
		textBody?: string;
		visualSubType?: VisualSubType;
		aiPrompt?: string;
		aiLinkedPanels?: number[];
		aiAgentId?: string;
		aiOrchestrationMode?: string;
	},
): string {
	switch (type) {
		case "text":
			return makeTextContent(id, title, color, cfg?.textBody ?? "");
		case "visual":
			return cfg?.visualSubType === "table"
				? makeTableContent(id, title, color)
				: makeChartContent(id, title, color);
		case "ai":
			return makeAiContent(
				id,
				title,
				color,
				cfg?.aiPrompt ?? "",
				cfg?.aiLinkedPanels ?? [],
				cfg?.aiAgentId ?? "",
				cfg?.aiOrchestrationMode ?? "none",
			);
		case "object":
			return makeObjectContent(id, title, color);
	}
}

export function defaultConfigFor(type: WidgetType): PanelConfig {
	const def = WIDGET_DEFS.find(
		(d) => d.type === type,
	) as (typeof WIDGET_DEFS)[number];
	return {
		type,
		visualSubType: "chart",
		title: `${def.label} Widget`,
		color:
			type === "text"
				? "#eb5e41"
				: type === "visual"
					? "#2e7d32"
					: type === "ai"
						? "#6a1b9a"
						: "#e65100",
		w: def.defaultW,
		h: def.defaultH,
		textBody: "",
		aiPrompt: "",
		aiLinkedPanels: [],
		aiAgentId: "",
		aiSystemPrompt: "",
		aiModel: "claude-sonnet-4-5-20250929",
		aiTemperature: 0.7,
		aiMaxTokens: 1024,
		aiProviderId: "",
		aiOrchestrationMode: "none",
	};
}
