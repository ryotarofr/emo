import type { GridStack } from "gridstack";
import {
	approveOrchestration,
	executeAgent,
	orchestrateAgent,
	rejectOrchestration,
} from "../../utils/agent";

export interface GridEventHandlers {
	handleEditWidget: (widgetId: number) => void;
}

/**
 * グリッド上のウィジェットアクション用クリックイベント委譲を設定する。
 * リスナーを解除するクリーンアップ関数を返す。
 */
export function setupGridEventDelegation(
	gridRef: HTMLDivElement,
	grid: GridStack,
	handlers: GridEventHandlers,
): () => void {
	const ac = new AbortController();

	gridRef.addEventListener(
		"click",
		(e) => {
			const target = e.target as HTMLElement;

			// 0. AI実行ボタン
			const execBtn = target.closest(
				"[data-action='ai-execute']",
			) as HTMLElement | null;
			if (execBtn) {
				handleAiExecute(execBtn, gridRef, e);
				return;
			}

			// 0b. オーケストレーションボタン
			const orchBtn = target.closest(
				"[data-action='ai-orchestrate']",
			) as HTMLElement | null;
			if (orchBtn) {
				handleOrchestrate(orchBtn, gridRef, e);
				return;
			}

			// 0c. 承認ボタン
			const approveBtn = target.closest(
				"[data-action='ai-approve']",
			) as HTMLElement | null;
			if (approveBtn) {
				handleApprove(approveBtn, gridRef, e);
				return;
			}

			// 0d. 却下ボタン
			const rejectBtn = target.closest(
				"[data-action='ai-reject']",
			) as HTMLElement | null;
			if (rejectBtn) {
				handleReject(rejectBtn, gridRef, e);
				return;
			}

			// 1. メニューボタンクリック -> ドロップダウン切替
			const menuBtn = target.closest(".widget-menu-btn");
			if (menuBtn) {
				const menu = menuBtn.closest(".widget-menu") as HTMLElement | null;
				// 他の開いているメニューをすべて閉じる
				gridRef.querySelectorAll(".widget-menu.open").forEach((m) => {
					if (m !== menu) m.classList.remove("open");
				});
				menu?.classList.toggle("open");
				e.stopPropagation();
				return;
			}

			// 2. メニュー項目クリック -> アクション実行
			const menuItem = target.closest(
				".widget-menu-item",
			) as HTMLElement | null;
			if (menuItem) {
				const menu = menuItem.closest(".widget-menu") as HTMLElement | null;
				const wid = Number(menu?.getAttribute("data-widget-id"));
				const action = menuItem.getAttribute("data-action");
				menu?.classList.remove("open");
				if (!Number.isNaN(wid) && wid > 0) {
					if (action === "edit") {
						handlers.handleEditWidget(wid);
					} else if (action === "delete") {
						const items = grid.getGridItems();
						const el = items.find((item) =>
							item.querySelector(`[data-widget-id="${wid}"]`),
						);
						if (el) grid.removeWidget(el);
					}
				}
				e.stopPropagation();
				return;
			}

			// 3. グリッド内の他の場所をクリック -> 開いているメニューをすべて閉じる
			gridRef.querySelectorAll(".widget-menu.open").forEach((m) => {
				m.classList.remove("open");
			});
		},
		{ signal: ac.signal },
	);

	// グリッド外クリック時にメニューを閉じる
	document.addEventListener(
		"click",
		() => {
			gridRef.querySelectorAll(".widget-menu.open").forEach((m) => {
				m.classList.remove("open");
			});
		},
		{ signal: ac.signal },
	);

	return () => ac.abort();
}

function handleAiExecute(
	execBtn: HTMLElement,
	gridRef: HTMLDivElement,
	e: MouseEvent,
) {
	const wid = Number(execBtn.getAttribute("data-widget-id"));
	if (!Number.isNaN(wid) && wid > 0) {
		const aiRoot = gridRef.querySelector(
			`[data-widget-id="${wid}"][data-widget-type="ai"]`,
		);
		const prompt = aiRoot?.getAttribute("data-ai-prompt") ?? "";
		const agentId = aiRoot?.getAttribute("data-ai-agent-id") ?? "";
		if (!agentId) {
			const badge = gridRef.querySelector(`[data-status-id="${wid}"]`);
			if (badge) {
				badge.className = "ai-status-badge ai-status-failed";
				badge.textContent = "未設定";
			}
			const outputArea = gridRef.querySelector(`[data-output-id="${wid}"]`);
			if (outputArea)
				outputArea.textContent =
					"先にエージェント設定を行ってください。パネルを編集して設定してください。";
			e.stopPropagation();
			return;
		}
		if (prompt) {
			// ステータスバッジを更新
			const badge = gridRef.querySelector(`[data-status-id="${wid}"]`);
			if (badge) {
				badge.className = "ai-status-badge ai-status-running";
				badge.textContent = "実行中...";
			}
			const outputArea = gridRef.querySelector(`[data-output-id="${wid}"]`);
			if (outputArea) outputArea.textContent = "";

			executeAgent(agentId, prompt)
				.then((execution) => {
					const badgeEl = gridRef.querySelector(`[data-status-id="${wid}"]`);
					const outEl = gridRef.querySelector(`[data-output-id="${wid}"]`);
					if (execution.status === "completed") {
						if (badgeEl) {
							badgeEl.className = "ai-status-badge ai-status-completed";
							badgeEl.textContent = "完了";
						}
						if (outEl) outEl.textContent = execution.output_text ?? "";
					} else {
						if (badgeEl) {
							badgeEl.className = "ai-status-badge ai-status-failed";
							badgeEl.textContent = "失敗";
						}
						if (outEl)
							outEl.textContent = execution.error_message ?? "Unknown error";
					}
				})
				.catch((err) => {
					const badgeEl = gridRef.querySelector(`[data-status-id="${wid}"]`);
					const outEl = gridRef.querySelector(`[data-output-id="${wid}"]`);
					if (badgeEl) {
						badgeEl.className = "ai-status-badge ai-status-failed";
						badgeEl.textContent = "エラー";
					}
					if (outEl) outEl.textContent = String(err);
				});
		}
	}
	e.stopPropagation();
}

function handleOrchestrate(
	orchBtn: HTMLElement,
	gridRef: HTMLDivElement,
	e: MouseEvent,
) {
	const wid = Number(orchBtn.getAttribute("data-widget-id"));
	if (!Number.isNaN(wid) && wid > 0) {
		const aiRoot = gridRef.querySelector(
			`[data-widget-id="${wid}"][data-widget-type="ai"]`,
		);
		const prompt = aiRoot?.getAttribute("data-ai-prompt") ?? "";
		const agentId = aiRoot?.getAttribute("data-ai-agent-id") ?? "";
		const orchMode =
			aiRoot?.getAttribute("data-ai-orchestration-mode") ?? "automatic";
		if (!agentId) {
			const badge = gridRef.querySelector(`[data-status-id="${wid}"]`);
			if (badge) {
				badge.className = "ai-status-badge ai-status-failed";
				badge.textContent = "未設定";
			}
			e.stopPropagation();
			return;
		}
		if (prompt) {
			const badge = gridRef.querySelector(`[data-status-id="${wid}"]`);
			if (badge) {
				badge.className = "ai-status-badge ai-status-running";
				badge.textContent = "オーケストレーション中...";
			}
			const outputArea = gridRef.querySelector(`[data-output-id="${wid}"]`);
			if (outputArea) outputArea.textContent = "";

			orchestrateAgent(agentId, prompt, orchMode)
				.then((run) => {
					console.log("[dashboard] Orchestration started:", run.id);
					// 承認/却下用にrun IDを保存
					aiRoot?.setAttribute("data-orchestration-run-id", run.id);
				})
				.catch((err) => {
					const badgeEl = gridRef.querySelector(`[data-status-id="${wid}"]`);
					if (badgeEl) {
						badgeEl.className = "ai-status-badge ai-status-failed";
						badgeEl.textContent = "エラー";
					}
					const outEl = gridRef.querySelector(`[data-output-id="${wid}"]`);
					if (outEl) outEl.textContent = String(err);
				});
		}
	}
	e.stopPropagation();
}

function handleApprove(
	approveBtn: HTMLElement,
	gridRef: HTMLDivElement,
	e: MouseEvent,
) {
	const wid = Number(approveBtn.getAttribute("data-widget-id"));
	if (!Number.isNaN(wid) && wid > 0) {
		const aiRoot = gridRef.querySelector(
			`[data-widget-id="${wid}"][data-widget-type="ai"]`,
		);
		const runId = aiRoot?.getAttribute("data-orchestration-run-id") ?? "";
		if (runId) {
			const badge = gridRef.querySelector(`[data-status-id="${wid}"]`);
			if (badge) {
				badge.className = "ai-status-badge ai-status-running";
				badge.textContent = "実行中...";
			}
			const planArea = gridRef.querySelector(
				`[data-plan-id="${wid}"]`,
			) as HTMLElement | null;
			if (planArea) planArea.style.display = "none";

			approveOrchestration(runId).catch((err) => {
				const badgeEl = gridRef.querySelector(`[data-status-id="${wid}"]`);
				if (badgeEl) {
					badgeEl.className = "ai-status-badge ai-status-failed";
					badgeEl.textContent = "エラー";
				}
				const outEl = gridRef.querySelector(`[data-output-id="${wid}"]`);
				if (outEl) outEl.textContent = String(err);
			});
		}
	}
	e.stopPropagation();
}

function handleReject(
	rejectBtn: HTMLElement,
	gridRef: HTMLDivElement,
	e: MouseEvent,
) {
	const wid = Number(rejectBtn.getAttribute("data-widget-id"));
	if (!Number.isNaN(wid) && wid > 0) {
		const aiRoot = gridRef.querySelector(
			`[data-widget-id="${wid}"][data-widget-type="ai"]`,
		);
		const runId = aiRoot?.getAttribute("data-orchestration-run-id") ?? "";
		if (runId) {
			const badge = gridRef.querySelector(`[data-status-id="${wid}"]`);
			if (badge) {
				badge.className = "ai-status-badge ai-status-failed";
				badge.textContent = "却下";
			}
			const planArea = gridRef.querySelector(
				`[data-plan-id="${wid}"]`,
			) as HTMLElement | null;
			if (planArea) planArea.style.display = "none";

			rejectOrchestration(runId).catch((err) => {
				console.error("Failed to reject:", err);
			});
		}
	}
	e.stopPropagation();
}
