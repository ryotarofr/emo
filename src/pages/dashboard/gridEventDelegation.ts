import type { GridStack } from "gridstack";
import {
	approveOrchestration,
	executeAgent,
	orchestrateAgent,
	rejectOrchestration,
} from "../../utils/agent";
import { TYPE_LABELS } from "./constants";
import { setOutputText, updateStatusBadge } from "./domHelpers";
import {
	buildFolderOutput,
	buildTreeHtml,
	DEFAULT_EXCLUDE_PATTERNS,
	openFolderPicker,
	readDirRecursive,
	readFolderContents,
} from "./folderReader";
import {
	buildAugmentedPrompt,
	collectUpstreamOutputs,
	getPanelOutput,
} from "./pipelineEngine";
import type { PipelineEdge, WidgetDataContext, WidgetType } from "./types";

export interface GridEventHandlers extends WidgetDataContext {
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
				handleAiExecute(execBtn, gridRef, e, handlers);
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

			// 0e. フォルダ読み込みボタン
			const folderBtn = target.closest(
				"[data-action='folder-load']",
			) as HTMLElement | null;
			if (folderBtn) {
				handleFolderLoad(folderBtn, gridRef, e, handlers);
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
	handlers: GridEventHandlers,
) {
	const wid = Number(execBtn.getAttribute("data-widget-id"));
	if (!Number.isNaN(wid) && wid > 0) {
		const aiRoot = gridRef.querySelector(
			`[data-widget-id="${wid}"][data-widget-type="ai"]`,
		);
		const prompt = aiRoot?.getAttribute("data-ai-prompt") ?? "";
		const agentId = aiRoot?.getAttribute("data-ai-agent-id") ?? "";
		if (!agentId) {
			updateStatusBadge(gridRef, wid, "failed", "未設定");
			setOutputText(gridRef, wid, "先にエージェント設定を行ってください。パネルを編集して設定してください。");
			e.stopPropagation();
			return;
		}
		if (prompt) {
			// upstream出力を収集してプロンプトに注入
			const edges = handlers.getPipelineEdges();
			const currentOutputs = handlers.getPanelOutputs();

			// pipelineEdges + aiLinkedPanels を統合してupstreamを収集
			const pipelineSourceIds = new Set(
				edges
					.filter((edge) => edge.targetWidgetId === wid)
					.map((edge) => edge.sourceWidgetId),
			);
			const linkedStr = aiRoot?.getAttribute("data-ai-linked") ?? "";
			const linkedIds = linkedStr
				? linkedStr
						.split(",")
						.map(Number)
						.filter((n) => !Number.isNaN(n) && n > 0)
				: [];
			const mergedEdges: PipelineEdge[] = [...edges];
			for (const linkedId of linkedIds) {
				if (!pipelineSourceIds.has(linkedId)) {
					mergedEdges.push({
						id: `linked-${linkedId}-${wid}`,
						sourceWidgetId: linkedId,
						targetWidgetId: wid,
						autoChain: false,
					});
				}
			}

			// upstreamパネルの最新出力をDOMから再取得
			const freshOutputs = { ...currentOutputs };
			for (const edge of mergedEdges) {
				if (edge.targetWidgetId === wid) {
					const srcOutput = getPanelOutput(edge.sourceWidgetId, gridRef);
					if (srcOutput) {
						freshOutputs[edge.sourceWidgetId] = srcOutput;
						handlers.setPanelOutput(edge.sourceWidgetId, srcOutput);
					}
				}
			}

			const upstream = collectUpstreamOutputs(wid, mergedEdges, freshOutputs).map(
				(u) => {
					const srcRoot = gridRef.querySelector(
						`[data-widget-id="${u.widgetId}"]`,
					);
					const type = (srcRoot?.getAttribute("data-widget-type") ?? "unknown") as WidgetType;
					return { ...u, label: TYPE_LABELS[type] ?? "Widget" };
				},
			);
			const augmentedPrompt = buildAugmentedPrompt(prompt, upstream);

			updateStatusBadge(gridRef, wid, "running", "実行中...");
			setOutputText(gridRef, wid, "");

			executeAgent(agentId, augmentedPrompt)
				.then((execution) => {
					if (execution.status === "completed") {
						updateStatusBadge(gridRef, wid, "completed", "完了");
						const outputText = execution.output_text ?? "";
						setOutputText(gridRef, wid, outputText);
						handlers.setPanelOutput(wid, outputText);
					} else {
						updateStatusBadge(gridRef, wid, "failed", "失敗");
						setOutputText(gridRef, wid, execution.error_message ?? "Unknown error");
					}
				})
				.catch((err) => {
					updateStatusBadge(gridRef, wid, "failed", "エラー");
					setOutputText(gridRef, wid, String(err));
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
			updateStatusBadge(gridRef, wid, "failed", "未設定");
			e.stopPropagation();
			return;
		}
		if (prompt) {
			updateStatusBadge(gridRef, wid, "running", "オーケストレーション中...");
			setOutputText(gridRef, wid, "");

			orchestrateAgent(agentId, prompt, orchMode)
				.then((run) => {
					console.log("[dashboard] Orchestration started:", run.id);
					aiRoot?.setAttribute("data-orchestration-run-id", run.id);
				})
				.catch((err) => {
					updateStatusBadge(gridRef, wid, "failed", "エラー");
					setOutputText(gridRef, wid, String(err));
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
			updateStatusBadge(gridRef, wid, "running", "実行中...");
			const planArea = gridRef.querySelector(
				`[data-plan-id="${wid}"]`,
			) as HTMLElement | null;
			if (planArea) planArea.style.display = "none";

			approveOrchestration(runId).catch((err) => {
				updateStatusBadge(gridRef, wid, "failed", "エラー");
				setOutputText(gridRef, wid, String(err));
			});
		}
	}
	e.stopPropagation();
}

async function handleFolderLoad(
	folderBtn: HTMLElement,
	gridRef: HTMLDivElement,
	e: MouseEvent,
	handlers: GridEventHandlers,
) {
	const wid = Number(folderBtn.getAttribute("data-widget-id"));
	if (Number.isNaN(wid) || wid <= 0) return;
	e.stopPropagation();

	const folderRoot = gridRef.querySelector(
		`[data-widget-id="${wid}"][data-widget-type="folder"]`,
	);
	if (!folderRoot) return;

	let folderPath = folderRoot.getAttribute("data-folder-path") ?? "";
	const maxDepth = Number(
		folderRoot.getAttribute("data-folder-max-depth") ?? "3",
	);
	const excludeStr = folderRoot.getAttribute("data-folder-exclude") ?? "";
	const excludePatterns =
		excludeStr.trim().length > 0
			? excludeStr.split("\n").filter((s) => s.trim().length > 0)
			: DEFAULT_EXCLUDE_PATTERNS;

	// パスが空の場合はフォルダ選択ダイアログを開く
	if (!folderPath) {
		const picked = await openFolderPicker();
		if (!picked) return;
		folderPath = picked;
		folderRoot.setAttribute("data-folder-path", folderPath);
		// パスラベルを更新
		const pathLabel = folderRoot.querySelector(".folder-path-label");
		if (pathLabel) pathLabel.textContent = folderPath;
	}

	// 読み込みボタンをローディング表示に
	const btn = folderBtn as HTMLButtonElement;
	const originalText = btn.textContent;
	btn.textContent = "読み込み中...";
	btn.disabled = true;

	try {
		const entries = await readDirRecursive(folderPath, {
			maxDepth,
			excludePatterns,
			maxFiles: 200,
		});

		// ツリーHTMLを生成して挿入
		const treeHtml = buildTreeHtml(entries);
		const treeArea = gridRef.querySelector(`[data-folder-tree-id="${wid}"]`);
		if (treeArea) treeArea.innerHTML = treeHtml;

		// ファイル内容を読み込み
		const contents = await readFolderContents(entries);
		console.log(
			`[dashboard] folder #${wid}: ${contents.length} file contents loaded`,
		);

		// パイプライン用出力テキストを生成してキャッシュ
		const outputText = buildFolderOutput(folderPath, entries, contents);
		console.log(
			`[dashboard] folder #${wid}: output text length = ${outputText.length}`,
		);
		const outEl = gridRef.querySelector(`[data-output-id="${wid}"]`);
		if (outEl) outEl.textContent = outputText;

		// パイプライン用出力を登録
		handlers.setPanelOutput(wid, outputText);
	} catch (err) {
		const treeArea = gridRef.querySelector(`[data-folder-tree-id="${wid}"]`);
		if (treeArea)
			treeArea.innerHTML = `<div class="folder-error">読み込みエラー: ${String(err)}</div>`;
	} finally {
		btn.textContent = originalText;
		btn.disabled = false;
	}
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
			updateStatusBadge(gridRef, wid, "failed", "却下");
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
