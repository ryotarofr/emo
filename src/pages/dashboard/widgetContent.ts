import { WIDGET_DEFS } from "./constants";
import { DEFAULT_EXCLUDE_PATTERNS } from "./folderReader";
import type { PanelConfig, WidgetType } from "./types";

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export const menuHtml = (id: number) =>
	`<div class="widget-menu" data-widget-id="${id}"><button class="widget-menu-btn" type="button" title="メニュー"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button><div class="widget-menu-dropdown"><button class="widget-menu-item" data-action="edit" type="button">編集</button><button class="widget-menu-item widget-menu-item-danger" data-action="delete" type="button">削除</button></div></div>`;

export const portsHtml = (id: number) =>
	`<div class="widget-port widget-port-input" data-port="input" data-widget-id="${id}"></div><div class="widget-port widget-port-output" data-port="output" data-widget-id="${id}"></div>`;

export function makeTextContent(
	id: number,
	title: string,
	color: string,
	textBody: string,
): string {
	const t = escapeHtml(title);
	return `<div class="widget-text" data-widget-id="${id}" data-widget-type="text">${portsHtml(id)}<div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body">${textBody}</div></div>`;
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
	return `<div class="widget-chart" data-widget-id="${id}" data-widget-type="visual" data-widget-subtype="chart">${portsHtml(id)}<div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><div class="chart-placeholder">${barsHtml}</div></div></div>`;
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
	return `<div class="widget-table" data-widget-id="${id}" data-widget-type="visual" data-widget-subtype="table">${portsHtml(id)}<div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><table><thead><tr><th>Name</th><th>Value</th><th>Change</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
}

export function makeAiContent(
	id: number,
	title: string,
	color: string,
	aiPrompt: string,
	aiLinkedPanels: number[],
	agentId: string,
	orchestrationMode = "none",
	enabledTools: string[] = [],
	aiModel = "claude-sonnet-4-5-20250929",
	aiProviderId = "",
	aiSystemPrompt = "",
	aiTemperature = 0.7,
	aiMaxTokens = 1024,
): string {
	const t = escapeHtml(title);
	const p = escapeHtml(aiPrompt);
	const linked = aiLinkedPanels.join(",");
	const aid = escapeHtml(agentId);
	const toolsAttr = enabledTools.join(",");
	const sp = escapeHtml(aiSystemPrompt);
	const promptPreview = aiPrompt
		? `<div class="ai-prompt-preview">${escapeHtml(aiPrompt.length > 80 ? `${aiPrompt.slice(0, 80)}...` : aiPrompt)}</div>`
		: "";
	const linkedLabel = aiLinkedPanels.length
		? `<div class="ai-linked-label">連携: ${aiLinkedPanels.map((x) => `#${x}`).join(", ")}</div>`
		: "";
	const toolsLabel = enabledTools.length
		? `<div class="ai-tools-label">ツール: ${enabledTools.join(", ")}</div>`
		: "";
	const execArea = `<div class="ai-exec-area"><button class="ai-exec-btn" data-action="ai-execute" data-widget-id="${id}" type="button">実行</button>${
		orchestrationMode !== "none"
			? `<button class="ai-orchestrate-btn" data-action="ai-orchestrate" data-widget-id="${id}" type="button">オーケストレート</button>`
			: ""
	}<span class="ai-status-badge" data-status-id="${id}"></span></div><div class="ai-output-wrapper"><div class="ai-output-area" data-output-id="${id}"></div><button class="ai-copy-btn" data-action="ai-copy" data-widget-id="${id}" type="button" title="コピー"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div>`;
	const planArea =
		orchestrationMode === "approval"
			? `<div class="ai-plan-area" data-plan-id="${id}" style="display:none"><div class="ai-plan-content"></div><div class="ai-plan-actions"><button class="ai-approve-btn" data-action="ai-approve" data-widget-id="${id}" type="button">承認</button><button class="ai-reject-btn" data-action="ai-reject" data-widget-id="${id}" type="button">却下</button></div></div>`
			: "";
	const subAgentsArea =
		orchestrationMode !== "none"
			? `<div class="ai-sub-agents-area" data-sub-agents-id="${id}"></div>`
			: "";
	return `<div class="widget-ai" data-widget-id="${id}" data-widget-type="ai" data-ai-prompt="${p}" data-ai-linked="${linked}" data-ai-agent-id="${aid}" data-ai-orchestration-mode="${orchestrationMode}" data-ai-enabled-tools="${toolsAttr}" data-ai-model="${escapeHtml(aiModel)}" data-ai-provider-id="${escapeHtml(aiProviderId)}" data-ai-system-prompt="${sp}" data-ai-temperature="${aiTemperature}" data-ai-max-tokens="${aiMaxTokens}">${portsHtml(id)}<div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><div class="ai-widget-content">${promptPreview}${linkedLabel}${toolsLabel}${execArea}${planArea}${subAgentsArea}</div></div></div>`;
}

export function makeObjectContent(
	id: number,
	title: string,
	color: string,
): string {
	const t = escapeHtml(title);
	return `<div class="widget-object" data-widget-id="${id}" data-widget-type="object">${portsHtml(id)}<div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><div class="widget-placeholder">オブジェクトパネル（準備中）</div></div></div>`;
}

export function makeFolderContent(
	id: number,
	title: string,
	color: string,
	folderPath: string,
	folderMaxDepth: number,
	folderExcludePatterns: string,
): string {
	const t = escapeHtml(title);
	const pathLabel = folderPath ? escapeHtml(folderPath) : "フォルダ未選択";
	const escapedPath = escapeHtml(folderPath);
	const escapedPatterns = escapeHtml(folderExcludePatterns);
	return `<div class="widget-folder" data-widget-id="${id}" data-widget-type="folder" data-folder-path="${escapedPath}" data-folder-max-depth="${folderMaxDepth}" data-folder-exclude="${escapedPatterns}">${portsHtml(id)}<div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><div class="folder-controls"><span class="folder-path-label">${pathLabel}</span><button class="folder-load-btn" data-action="folder-load" data-widget-id="${id}" type="button">読み込み</button></div><div class="folder-tree-area" data-folder-tree-id="${id}"></div><div class="folder-output-cache" data-output-id="${id}" style="display:none"></div></div></div>`;
}

export function makeDiagramContent(
	id: number,
	title: string,
	color: string,
	diagramCode: string,
): string {
	const t = escapeHtml(title);
	const escapedCode = escapeHtml(diagramCode);
	return `<div class="widget-diagram" data-widget-id="${id}" data-widget-type="visual" data-widget-subtype="diagram" data-diagram-code="${escapedCode}">${portsHtml(id)}<div class="widget-header" style="background:${color}20;color:${color}"><span>${t}</span><div class="widget-header-actions"><span>#${id}</span>${menuHtml(id)}</div></div><div class="widget-body"><div class="diagram-container" data-diagram-id="${id}"><div class="diagram-placeholder">ダイアグラムを読み込み中...</div></div></div><div class="diagram-output-cache" data-output-id="${id}" style="display:none">${escapedCode}</div></div>`;
}

export function makeWidgetContent(
	type: WidgetType,
	id: number,
	title: string,
	color: string,
	cfg?: Partial<PanelConfig>,
): string {
	switch (type) {
		case "text":
			return makeTextContent(id, title, color, cfg?.textBody ?? "");
		case "visual":
			if (cfg?.visualSubType === "table") {
				return makeTableContent(id, title, color);
			}
			if (cfg?.visualSubType === "diagram") {
				return makeDiagramContent(
					id,
					title,
					color,
					cfg?.diagramCode ?? "",
				);
			}
			return makeChartContent(id, title, color);
		case "ai":
			return makeAiContent(
				id,
				title,
				color,
				cfg?.aiPrompt ?? "",
				cfg?.aiLinkedPanels ?? [],
				cfg?.aiAgentId ?? "",
				cfg?.aiOrchestrationMode ?? "none",
				cfg?.aiEnabledTools ?? [],
				cfg?.aiModel ?? "claude-sonnet-4-5-20250929",
				cfg?.aiProviderId ?? "",
				cfg?.aiSystemPrompt ?? "",
				cfg?.aiTemperature ?? 0.7,
				cfg?.aiMaxTokens ?? 1024,
			);
		case "object":
			return makeObjectContent(id, title, color);
		case "folder":
			return makeFolderContent(
				id,
				title,
				color,
				cfg?.folderPath ?? "",
				cfg?.folderMaxDepth ?? 3,
				cfg?.folderExcludePatterns ?? "",
			);
	}
}

export function defaultConfigFor(type: WidgetType): PanelConfig {
	const def = WIDGET_DEFS.find(
		(d) => d.type === type,
	) as (typeof WIDGET_DEFS)[number];
	const colorMap: Record<string, string> = {
		text: "#eb5e41",
		visual: "#2e7d32",
		ai: "#6a1b9a",
		folder: "#795548",
	};
	return {
		type,
		visualSubType: "chart",
		title: `${def.label} Widget`,
		color: colorMap[type] ?? "#e65100",
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
		aiEnabledTools: [],
		folderPath: "",
		folderMaxDepth: 3,
		folderExcludePatterns:
			type === "folder" ? DEFAULT_EXCLUDE_PATTERNS.join("\n") : "",
		diagramCode: "",
	};
}
