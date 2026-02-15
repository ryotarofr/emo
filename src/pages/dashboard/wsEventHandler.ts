import type { GridStack } from "gridstack";
import type { EventEnvelope } from "../../utils/agent";
import { executeAgent } from "../../utils/agent";
import { TYPE_LABELS } from "./constants";
import { setOutputText, updateStatusBadge } from "./domHelpers";
import {
	buildAugmentedPrompt,
	collectUpstreamOutputs,
	getPanelOutput,
} from "./pipelineEngine";
import type { WidgetDataContext, WidgetType } from "./types";
import { escapeHtml, makeAiContent } from "./widgetContent";

export type WsEventContext = WidgetDataContext;

/** agent_idからdata-widget-idを逆引きする */
function resolveWidgetId(gridRef: Element, agentId: string): string | null {
	const aiRoot = gridRef.querySelector(`[data-ai-agent-id="${agentId}"]`);
	return aiRoot?.getAttribute("data-widget-id") ?? null;
}

/**
 * WebSocket実行イベントを処理し、グリッド内のDOM要素を更新する。
 */
export function handleWsEvent(
	event: EventEnvelope,
	gridRef: HTMLDivElement,
	grid: GridStack,
	widgetCount: () => number,
	setWidgetCount: (v: number) => void,
	refreshConnections: () => void,
	wsCtx?: WsEventContext,
): void {
	const evt = event.event;
	if (evt.type === "AgentExecutionStarted") {
		const wid = resolveWidgetId(gridRef, evt.agent_id);
		if (wid) updateStatusBadge(gridRef, wid, "running", "実行中...");
	} else if (evt.type === "AgentExecutionCompleted") {
		const wid = resolveWidgetId(gridRef, evt.agent_id);
		if (wid) {
			updateStatusBadge(gridRef, wid, "completed", "完了");
			setOutputText(gridRef, wid, evt.output);

			const widNum = Number(wid);
			if (wsCtx && !Number.isNaN(widNum)) {
				wsCtx.setPanelOutput(widNum, evt.output);
				triggerAutoChain(widNum, gridRef, wsCtx);
			}
		}
	} else if (evt.type === "AgentExecutionFailed") {
		const wid = resolveWidgetId(gridRef, evt.agent_id);
		if (wid) {
			updateStatusBadge(gridRef, wid, "failed", "失敗");
			setOutputText(gridRef, wid, evt.error);
		}
	} else if (evt.type === "SubAgentCreated") {
		// Step 1: 新しいサブエージェントパネルを動的に追加
		const newCount = widgetCount() + 1;
		setWidgetCount(newCount);
		const content = makeAiContent(
			newCount,
			evt.name,
			"#6a1b9a",
			evt.description,
			[],
			evt.agent_id,
			"none",
		);
		const newEl = grid.addWidget({ w: 16, h: 8, content });

		// Step 2: オーケストレーターパネルのリンク更新
		const orchRoot = gridRef?.querySelector(
			`[data-ai-agent-id="${evt.orchestrator_agent_id}"]`,
		);
		if (orchRoot) {
			// data-ai-linked属性に新パネルIDを追加
			const currentLinked = orchRoot.getAttribute("data-ai-linked") || "";
			const linkedIds = currentLinked
				? currentLinked.split(",").filter(Boolean)
				: [];
			linkedIds.push(String(newCount));
			orchRoot.setAttribute("data-ai-linked", linkedIds.join(","));

			// .ai-linked-labelを更新（存在しなければ新規作成）
			const aiContent = orchRoot.querySelector(".ai-widget-content");
			let linkedLabel = orchRoot.querySelector(".ai-linked-label");
			if (!linkedLabel && aiContent) {
				linkedLabel = document.createElement("div");
				linkedLabel.className = "ai-linked-label";
				const promptPreview = aiContent.querySelector(".ai-prompt-preview");
				if (promptPreview) {
					promptPreview.after(linkedLabel);
				} else {
					aiContent.prepend(linkedLabel);
				}
			}
			if (linkedLabel) {
				linkedLabel.textContent = `連携: ${linkedIds.map((x) => `#${x}`).join(", ")}`;
			}

			// Step 3: サブエージェントバッジ追加
			const wid = orchRoot.getAttribute("data-widget-id");
			const subArea = gridRef?.querySelector(`[data-sub-agents-id="${wid}"]`);
			if (subArea) {
				const badge = document.createElement("span");
				badge.className = "ai-sub-agent-badge";
				badge.textContent = evt.name;
				badge.setAttribute("data-sub-agent-id", evt.agent_id);
				subArea.appendChild(badge);
			}
		}

		// Step 4: 新パネルに視覚効果を付与
		if (newEl) {
			newEl.classList.add("gs-item-spawned");
			setTimeout(() => newEl.classList.remove("gs-item-spawned"), 1500);

			// ヘッダーに「自動生成」バッジを挿入
			const headerActions = newEl.querySelector(".widget-header-actions");
			if (headerActions) {
				const tag = document.createElement("span");
				tag.className = "ai-auto-created-tag";
				tag.textContent = "自動生成";
				headerActions.prepend(tag);
			}
		}

		// Step 5: 接続線を再計算
		refreshConnections();
	} else if (evt.type === "OrchestratorPlanProposed") {
		const orchRoot = gridRef?.querySelector(
			`[data-ai-agent-id="${evt.orchestrator_agent_id}"]`,
		);
		if (orchRoot) {
			const wid = orchRoot.getAttribute("data-widget-id");
			if (wid) {
				const planArea = gridRef?.querySelector(
					`[data-plan-id="${wid}"]`,
				) as HTMLElement | null;
				if (planArea) {
					planArea.style.display = "block";
					const planContent = planArea.querySelector(".ai-plan-content");
					if (planContent && evt.plan?.steps) {
						planContent.innerHTML = evt.plan.steps
							.map((step: { name: string; input: Record<string, unknown> }) => {
								const desc =
									step.input?.name || step.input?.description || step.name;
								return `<div class="ai-plan-step">${escapeHtml(step.name)}: ${escapeHtml(String(desc))}</div>`;
							})
							.join("");
					}
					orchRoot.setAttribute(
						"data-orchestration-run-id",
						evt.orchestration_run_id,
					);
				}
				updateStatusBadge(gridRef, wid, "awaiting", "承認待ち");
			}
		}
	} else if (evt.type === "OrchestratorCompleted") {
		const wid = resolveWidgetId(gridRef, evt.orchestrator_agent_id);
		if (wid) {
			updateStatusBadge(gridRef, wid, "completed", "完了");
			setOutputText(gridRef, wid, evt.output);

			const widNum = Number(wid);
			if (wsCtx && !Number.isNaN(widNum)) {
				wsCtx.setPanelOutput(widNum, evt.output);
				triggerAutoChain(widNum, gridRef, wsCtx);
			}
		}
	} else if (evt.type === "OrchestratorFailed") {
		const wid = resolveWidgetId(gridRef, evt.orchestrator_agent_id);
		if (wid) {
			updateStatusBadge(gridRef, wid, "failed", "失敗");
			setOutputText(gridRef, wid, evt.error);
		}
	}
}

/**
 * auto-chain: source完了後にdownstreamのautoChainエッジを探し、
 * 全upstreamが完了済みなら自動実行をトリガー
 */
function triggerAutoChain(
	completedWidgetId: number,
	gridRef: HTMLDivElement,
	ctx: WsEventContext,
): void {
	const edges = ctx.getPipelineEdges();
	const outputs = ctx.getPanelOutputs();

	// completedWidgetIdがsourceであるautoChainエッジを検索
	const downstreamEdges = edges.filter(
		(e) => e.sourceWidgetId === completedWidgetId && e.autoChain,
	);

	for (const edge of downstreamEdges) {
		const targetId = edge.targetWidgetId;

		// target全upstreamが完了済みか確認
		const allUpstreamEdges = edges.filter((e) => e.targetWidgetId === targetId);
		const allReady = allUpstreamEdges.every((e) => {
			const srcOutput = outputs[e.sourceWidgetId];
			if (srcOutput !== undefined && srcOutput !== "") return true;
			// DOMから最新を取得
			const freshOutput = getPanelOutput(e.sourceWidgetId, gridRef);
			if (freshOutput) {
				ctx.setPanelOutput(e.sourceWidgetId, freshOutput);
				return true;
			}
			return false;
		});

		if (!allReady) continue;

		// targetがAIパネルの場合のみ自動実行
		const targetRoot = gridRef.querySelector(
			`[data-widget-id="${targetId}"][data-widget-type="ai"]`,
		);
		if (!targetRoot) continue;

		const prompt = targetRoot.getAttribute("data-ai-prompt") ?? "";
		const agentId = targetRoot.getAttribute("data-ai-agent-id") ?? "";
		if (!agentId || !prompt) continue;

		// upstream出力を収集してプロンプトに注入
		const freshOutputs = ctx.getPanelOutputs();
		const upstream = collectUpstreamOutputs(targetId, edges, freshOutputs).map(
			(u) => {
				const srcRoot = gridRef.querySelector(
					`[data-widget-id="${u.widgetId}"]`,
				);
				const type = (srcRoot?.getAttribute("data-widget-type") ?? "unknown") as WidgetType;
				return { ...u, label: TYPE_LABELS[type] ?? "Widget" };
			},
		);
		const augmentedPrompt = buildAugmentedPrompt(prompt, upstream);

		updateStatusBadge(gridRef, targetId, "running", "自動実行中...");
		setOutputText(gridRef, targetId, "");

		executeAgent(agentId, augmentedPrompt).catch((err) => {
			updateStatusBadge(gridRef, targetId, "failed", "エラー");
			setOutputText(gridRef, targetId, String(err));
		});
	}
}
