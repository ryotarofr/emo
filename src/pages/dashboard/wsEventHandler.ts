import type { GridStack } from "gridstack";
import type { EventEnvelope } from "../../utils/agent";
import { escapeHtml, makeAiContent } from "./widgetContent";

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
): void {
	const evt = event.event;
	if (evt.type === "AgentExecutionStarted") {
		// agent_idでパネルを検索しバッジを更新
		const aiRoot = gridRef?.querySelector(
			`[data-ai-agent-id="${evt.agent_id}"]`,
		);
		if (aiRoot) {
			const wid = aiRoot.getAttribute("data-widget-id");
			if (wid) {
				const badge = gridRef?.querySelector(`[data-status-id="${wid}"]`);
				if (badge) {
					badge.className = "ai-status-badge ai-status-running";
					badge.textContent = "実行中...";
				}
			}
		}
	} else if (evt.type === "AgentExecutionCompleted") {
		const aiRoot = gridRef?.querySelector(
			`[data-ai-agent-id="${evt.agent_id}"]`,
		);
		if (aiRoot) {
			const wid = aiRoot.getAttribute("data-widget-id");
			if (wid) {
				const badge = gridRef?.querySelector(`[data-status-id="${wid}"]`);
				if (badge) {
					badge.className = "ai-status-badge ai-status-completed";
					badge.textContent = "完了";
				}
				const outEl = gridRef?.querySelector(`[data-output-id="${wid}"]`);
				if (outEl) outEl.textContent = evt.output;
			}
		}
	} else if (evt.type === "AgentExecutionFailed") {
		const aiRoot = gridRef?.querySelector(
			`[data-ai-agent-id="${evt.agent_id}"]`,
		);
		if (aiRoot) {
			const wid = aiRoot.getAttribute("data-widget-id");
			if (wid) {
				const badge = gridRef?.querySelector(`[data-status-id="${wid}"]`);
				if (badge) {
					badge.className = "ai-status-badge ai-status-failed";
					badge.textContent = "失敗";
				}
				const outEl = gridRef?.querySelector(`[data-output-id="${wid}"]`);
				if (outEl) outEl.textContent = evt.error;
			}
		}
	} else if (evt.type === "SubAgentCreated") {
		// 新しいサブエージェントパネルを動的に追加
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
		grid.addWidget({ w: 16, h: 8, content });
		refreshConnections();

		// オーケストレーターパネルにもサブエージェントバッジを追加
		const orchRoot = gridRef?.querySelector(
			`[data-ai-agent-id="${evt.orchestrator_agent_id}"]`,
		);
		if (orchRoot) {
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
	} else if (evt.type === "OrchestratorPlanProposed") {
		// オーケストレーターパネルにプランを表示
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
					// 承認/却下用にウィジェットにorchestration_run_idを保存
					orchRoot.setAttribute(
						"data-orchestration-run-id",
						evt.orchestration_run_id,
					);
				}
				const badge = gridRef?.querySelector(`[data-status-id="${wid}"]`);
				if (badge) {
					badge.className = "ai-status-badge ai-status-awaiting";
					badge.textContent = "承認待ち";
				}
			}
		}
	} else if (evt.type === "OrchestratorCompleted") {
		const orchRoot = gridRef?.querySelector(
			`[data-ai-agent-id="${evt.orchestrator_agent_id}"]`,
		);
		if (orchRoot) {
			const wid = orchRoot.getAttribute("data-widget-id");
			if (wid) {
				const badge = gridRef?.querySelector(`[data-status-id="${wid}"]`);
				if (badge) {
					badge.className = "ai-status-badge ai-status-completed";
					badge.textContent = "完了";
				}
				const outEl = gridRef?.querySelector(`[data-output-id="${wid}"]`);
				if (outEl) outEl.textContent = evt.output;
			}
		}
	} else if (evt.type === "OrchestratorFailed") {
		const orchRoot = gridRef?.querySelector(
			`[data-ai-agent-id="${evt.orchestrator_agent_id}"]`,
		);
		if (orchRoot) {
			const wid = orchRoot.getAttribute("data-widget-id");
			if (wid) {
				const badge = gridRef?.querySelector(`[data-status-id="${wid}"]`);
				if (badge) {
					badge.className = "ai-status-badge ai-status-failed";
					badge.textContent = "失敗";
				}
				const outEl = gridRef?.querySelector(`[data-output-id="${wid}"]`);
				if (outEl) outEl.textContent = evt.error;
			}
		}
	}
}
