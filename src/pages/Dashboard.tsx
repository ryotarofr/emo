import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useParams } from "@solidjs/router";
import {
	ArrowLeftIcon,
	BarChart3Icon,
	BookmarkIcon,
	BotIcon,
	BoxIcon,
	CheckIcon,
	ClockIcon,
	DownloadIcon,
	FileTextIcon,
	FolderIcon,
	FolderOpenIcon,
	MessageSquareIcon,
	MinusIcon,
	MoveHorizontalIcon,
	MoveVerticalIcon,
	PlayIcon,
	PlusIcon,
	SaveIcon,
	SettingsIcon,
	Share2Icon,
	SquareIcon,
	TableIcon,
	Trash2Icon,
	UploadIcon,
	WrenchIcon,
	XIcon,
	ZapIcon,
} from "lucide-solid";
import {
	createEffect,
	createSignal,
	For,
	on,
	onCleanup,
	onMount,
	Show,
	useContext,
} from "solid-js";
import { NavItemsContext } from "../App";
import PlainTextEditor from "../components/lexical/components/PlainTextEditor";
import RichTextEditor from "../components/lexical/components/RichTextEditor";
import { useAuth } from "../contexts/AuthContext";
import type { AgentMessage, EventEnvelope, LlmProvider } from "../utils/agent";
import {
	createAgent,
	createWorkflow,
	executeAgent,
	getExecutionMessages,
	getLlmProviders,
	updateToolPermissions,
} from "../utils/agent";
import {
	connectWebSocket,
	disconnectWebSocket,
	onExecutionEvent,
} from "../utils/ws";
import "./Dashboard.css";

import {
	computeConnections,
	computeDirectedConnections,
	connectionPath,
} from "./dashboard/connectionGeometry";
import {
	AVAILABLE_TOOLS,
	COLOR_PRESETS,
	PROVIDER_MODELS,
	VISUAL_SUBTYPES,
	WIDGET_DEFS,
	WORKFLOW_TEMPLATES,
} from "./dashboard/constants";
import {
	loadDrafts,
	pipelineStorageKey,
	saveDrafts,
	storageKey,
} from "./dashboard/drafts";
import {
	buildFolderOutput,
	buildTreeHtml,
	DEFAULT_EXCLUDE_PATTERNS,
	openFolderPicker,
	readDirRecursive,
	readFolderContents,
} from "./dashboard/folderReader";
import { setupGridEventDelegation } from "./dashboard/gridEventDelegation";
import {
	DEFAULT_ER_DIAGRAM,
	extractMermaidCode,
	renderDiagramsInGrid,
} from "./dashboard/mermaidRenderer";
import {
	buildAugmentedPrompt,
	collectUpstreamOutputs,
	executePipeline,
	getPanelOutput,
	type PipelineCallbacks,
} from "./dashboard/pipelineEngine";
import { setupPortDragHandler } from "./dashboard/portDragHandler";
import type {
	CollaborationUser,
	Connection,
	DashboardTemplate,
	PanelConfig,
	PanelDraft,
	PipelineEdge,
	PipelineStatus,
	TimelineEntry,
	ToolDefinition,
	VisualSubType,
	WidgetType,
} from "./dashboard/types";
import { defaultConfigFor, makeWidgetContent } from "./dashboard/widgetContent";
import { handleWsEvent } from "./dashboard/wsEventHandler";
import { ToastContainer, toastManager } from "../components/Toast";
import { createTimelineEntry } from "./dashboard/executionTimeline";
import {
	deleteTemplate,
	downloadSnapshot,
	importSnapshot,
	loadTemplates,
	saveTemplate,
} from "./dashboard/templateManager";
import { clearAllSummaryCaches } from "./dashboard/summaryCache";

// GridStackはデフォルトでtextContent（XSS対策）を使用する。
// ウィジェットHTML（チャート、テーブル、リッチテキスト等）を正しく描画するためinnerHTMLに上書きする。
GridStack.renderCB = (el, w) => {
	if (el && w?.content) el.innerHTML = w.content;
};

export default function Dashboard() {
	const params = useParams<{ id: string }>();
	const navCtx = useContext(NavItemsContext);
	const auth = useAuth();
	let gridRef!: HTMLDivElement;
	let svgRef!: SVGSVGElement;
	const [grid, setGrid] = createSignal<GridStack | null>(null);
	const [widgetCount, setWidgetCount] = createSignal(0);
	const [llmProviders, setLlmProviders] = createSignal<LlmProvider[]>([]);

	// 編集モード: null = 新規、number = 編集中のウィジェットID
	const [editingWidgetId, setEditingWidgetId] = createSignal<number | null>(
		null,
	);

	// パネルビュー: タイプ選択またはエディター
	const [panelView, setPanelView] = createSignal<"select" | "editor">("select");

	// フローティングエディターパネル
	const [editorOpen, setEditorOpen] = createSignal(false);
	const [panelConfig, setPanelConfig] = createSignal<PanelConfig>(
		defaultConfigFor("text"),
	);
	const [configTab, setConfigTab] = createSignal<"content" | "settings">(
		"content",
	);

	// 下書き
	const [drafts, setDrafts] = createSignal<PanelDraft[]>(loadDrafts());
	const [draftsOpen, setDraftsOpen] = createSignal(false);

	// プレビュー（Alt長押しでオーバーレイを透過）
	const [peeking, setPeeking] = createSignal(false);

	// AIパネルと連携パネル間の接続線
	const [connections, setConnections] = createSignal<Connection[]>([]);
	const [dragging, setDragging] = createSignal(false);
	const [animKey, setAnimKey] = createSignal(0);

	// パイプライン
	const [pipelineEdges, setPipelineEdges] = createSignal<PipelineEdge[]>([]);
	const [pipelineStatus, setPipelineStatus] =
		createSignal<PipelineStatus>("idle");
	const [panelOutputs, setPanelOutputs] = createSignal<Record<number, string>>(
		{},
	);
	const [currentPipelineStep, setCurrentPipelineStep] = createSignal<
		number | null
	>(null);
	let pipelineAbortController: AbortController | null = null;

	// テンプレート進捗（null = 非表示、{ message } = 表示中）
	const [templateProgress, setTemplateProgress] = createSignal<{
		message: string;
	} | null>(null);

	// === 1. 実行タイムライン ===
	const [timelineEntries, setTimelineEntries] = createSignal<TimelineEntry[]>([]);
	const [timelineOpen, setTimelineOpen] = createSignal(false);

	// === 3. テンプレート保存 ===
	const [savedTemplates, setSavedTemplates] = createSignal<DashboardTemplate[]>(loadTemplates());
	const [templateModalOpen, setTemplateModalOpen] = createSignal(false);
	const [templateName, setTemplateName] = createSignal("");

	// === 5. 会話履歴 ===
	const [chatHistoryOpen, setChatHistoryOpen] = createSignal(false);
	const [chatMessages, setChatMessages] = createSignal<AgentMessage[]>([]);
	const [chatHistoryTitle, setChatHistoryTitle] = createSignal("");

	// === 6. プロバイダー管理 ===
	const [providerModalOpen, setProviderModalOpen] = createSignal(false);

	// === 8. スナップショットインポート ===
	const [snapshotImportOpen, setSnapshotImportOpen] = createSignal(false);
	const [snapshotJson, setSnapshotJson] = createSignal("");

	// === 9. ツール/プラグイン ===
	const [toolDefinitions, setToolDefinitions] = createSignal<ToolDefinition[]>([]);

	// === 10. コラボレーション ===
	// TODO: WebSocketイベントで setCollaborationUsers を呼び出す（バックエンド実装待ち）
	const [collaborationUsers, _setCollaborationUsers] = createSignal<
		CollaborationUser[]
	>([]);

	// エッジコンテキストメニュー
	const [edgeContextMenu, setEdgeContextMenu] = createSignal<{
		x: number;
		y: number;
		edgeId: string;
	} | null>(null);

	const refreshConnections = () => {
		if (!gridRef) return;
		const edges = pipelineEdges();
		if (edges.length > 0) {
			// パイプラインエッジがある場合は有向接続線を使用
			setConnections(computeDirectedConnections(gridRef, edges));
		} else {
			// フォールバック: 既存のaiLinkedPanels接続
			setConnections(computeConnections(gridRef));
		}
		setAnimKey((k) => k + 1);
	};

	// リアルタイムイベント用WebSocket接続 + LLMプロバイダー
	onMount(() => {
		connectWebSocket();
		getLlmProviders()
			.then((providers) => setLlmProviders(providers))
			.catch((err) => console.error("Failed to fetch LLM providers:", err));
		const unsub = onExecutionEvent((envelope: EventEnvelope) => {
			const g = grid();
			if (!g) return;
			handleWsEvent(
				envelope,
				gridRef,
				g,
				widgetCount,
				setWidgetCount,
				refreshConnections,
				{
					getPipelineEdges: () => pipelineEdges(),
					getPanelOutputs: () => panelOutputs(),
					setPanelOutput,
				},
			);
		});
		onCleanup(() => {
			unsub();
			disconnectWebSocket();
		});
	});

	// --- キーボードショートカット ---
	const handleKeyDown = (e: KeyboardEvent) => {
		// Escape -> モーダル / エディターを閉じる（モーダル優先）
		if (e.key === "Escape") {
			if (templateModalOpen()) { e.preventDefault(); setTemplateModalOpen(false); return; }
			if (chatHistoryOpen()) { e.preventDefault(); setChatHistoryOpen(false); return; }
			if (providerModalOpen()) { e.preventDefault(); setProviderModalOpen(false); return; }
			if (snapshotImportOpen()) { e.preventDefault(); setSnapshotImportOpen(false); return; }
			if (editorOpen()) {
				e.preventDefault();
				setEditingWidgetId(null);
				setEditorOpen(false);
				return;
			}
		}

		if (!editorOpen()) return;

		// Alt長押し -> プレビュー
		if (e.key === "Alt") {
			e.preventDefault();
			setPeeking(true);
		}

		// Ctrl+Enter -> パネル追加（エディタービュー時のみ）
		if (
			e.key === "Enter" &&
			(e.ctrlKey || e.metaKey) &&
			panelView() === "editor"
		) {
			e.preventDefault();
			handleAddWidget();
		}
	};

	const handleKeyUp = (e: KeyboardEvent) => {
		if (e.key === "Alt") {
			setPeeking(false);
		}
	};

	// ESCキーはモーダル閉じにも使うので常時登録
	onMount(() => {
		document.addEventListener("keydown", handleKeyDown);
	});

	createEffect(() => {
		if (editorOpen()) {
			document.addEventListener("keyup", handleKeyUp);
		} else {
			document.removeEventListener("keyup", handleKeyUp);
			setPeeking(false);
		}
	});

	onCleanup(() => {
		document.removeEventListener("keydown", handleKeyDown);
		document.removeEventListener("keyup", handleKeyUp);
	});

	const itemName = () => {
		const item = navCtx?.findItem(params.id);
		return item?.name ?? `Dashboard ${params.id}`;
	};

	const saveLayout = (g: GridStack, id: string) => {
		try {
			const layout = g.save();
			localStorage.setItem(storageKey(id), JSON.stringify(layout));
		} catch {
			// グリッドが破棄されている可能性がある
		}
	};

	const savePipelineEdges = (id: string, edges: PipelineEdge[]) => {
		localStorage.setItem(pipelineStorageKey(id), JSON.stringify(edges));
	};

	const loadPipelineEdges = (id: string): PipelineEdge[] => {
		try {
			const raw = localStorage.getItem(pipelineStorageKey(id));
			return raw ? JSON.parse(raw) : [];
		} catch {
			return [];
		}
	};

	/** 既存aiLinkedPanelsからパイプラインエッジへの自動マイグレーション */
	const migrateLinkedPanelsToEdges = (): PipelineEdge[] => {
		const edges: PipelineEdge[] = [];
		const seen = new Set<string>();
		const aiPanels = gridRef.querySelectorAll('[data-widget-type="ai"]');
		for (const aiRoot of aiPanels) {
			const targetId = Number(aiRoot.getAttribute("data-widget-id"));
			const linkedStr = aiRoot.getAttribute("data-ai-linked") ?? "";
			if (!linkedStr || Number.isNaN(targetId)) continue;
			const linkedIds = linkedStr
				.split(",")
				.map(Number)
				.filter((n) => !Number.isNaN(n) && n > 0);
			for (const sourceId of linkedIds) {
				const edgeId = `edge-${sourceId}-${targetId}`;
				if (!seen.has(edgeId)) {
					seen.add(edgeId);
					edges.push({
						id: edgeId,
						sourceWidgetId: sourceId,
						targetWidgetId: targetId,
						autoChain: false,
					});
				}
			}
		}
		return edges;
	};

	const setPanelOutput = (widgetId: number, output: string) => {
		setPanelOutputs((prev) => ({ ...prev, [widgetId]: output }));
	};

	const MAX_TIMELINE_ENTRIES = 200;

	const addTimelineEntry = (
		widgetId: number,
		status: "running" | "completed" | "failed",
		message: string,
		durationMs?: number,
	) => {
		const root = gridRef.querySelector(`[data-widget-id="${widgetId}"]`);
		const header = root?.closest(".grid-stack-item")?.querySelector(".widget-header span:first-child");
		const title = header?.textContent ?? `Widget #${widgetId}`;
		const entry = createTimelineEntry(widgetId, title, status, message);
		if (durationMs !== undefined) entry.durationMs = durationMs;
		setTimelineEntries((prev) => [...prev, entry].slice(-MAX_TIMELINE_ENTRIES));
	};

	const handlePipelineExecute = () => {
		const edges = pipelineEdges();
		if (edges.length === 0) return;

		pipelineAbortController = new AbortController();
		setPipelineStatus("running");
		toastManager.addToast({ id: `pl-start-${Date.now()}`, type: "info", title: "パイプライン実行開始" });

		const stepStartTimes: Record<number, number> = {};

		const callbacks: PipelineCallbacks = {
			onStepStart: (widgetId) => {
				setCurrentPipelineStep(widgetId);
				stepStartTimes[widgetId] = Date.now();
				addTimelineEntry(widgetId, "running", "実行開始");
				const badge = gridRef.querySelector(`[data-status-id="${widgetId}"]`);
				if (badge) {
					badge.className = "ai-status-badge ai-status-running";
					badge.textContent = "実行中...";
				}
			},
			onStepComplete: (widgetId, output) => {
				setPanelOutput(widgetId, output);
				const duration = stepStartTimes[widgetId] ? Date.now() - stepStartTimes[widgetId] : undefined;
				addTimelineEntry(widgetId, "completed", "完了", duration);
			},
			onStepFail: (widgetId, error) => {
				addTimelineEntry(widgetId, "failed", error);
				toastManager.addToast({ id: `step-fail-${widgetId}`, type: "error", title: `Panel #${widgetId} 失敗`, message: error.slice(0, 80) });
			},
			onPipelineComplete: () => {
				setPipelineStatus("completed");
				setCurrentPipelineStep(null);
				pipelineAbortController = null;
				toastManager.addToast({ id: `pl-done-${Date.now()}`, type: "success", title: "パイプライン完了" });
			},
			onPipelineFail: (error) => {
				setPipelineStatus("failed");
				setCurrentPipelineStep(null);
				pipelineAbortController = null;
				toastManager.addToast({ id: `pl-fail-${Date.now()}`, type: "error", title: "パイプライン失敗", message: error.slice(0, 100) });
			},
		};

		executePipeline(edges, gridRef, callbacks, pipelineAbortController.signal, params.id);
	};

	const handlePipelineStop = () => {
		if (pipelineAbortController) {
			pipelineAbortController.abort();
			pipelineAbortController = null;
		}
		setPipelineStatus("stopped");
		setCurrentPipelineStep(null);
	};

	const addPipelineEdge = (edge: PipelineEdge) => {
		const updated = [...pipelineEdges(), edge];
		setPipelineEdges(updated);
		savePipelineEdges(params.id, updated);
		refreshConnections();
	};

	const removePipelineEdge = (edgeId: string) => {
		const updated = pipelineEdges().filter((e) => e.id !== edgeId);
		setPipelineEdges(updated);
		savePipelineEdges(params.id, updated);
		refreshConnections();
	};

	const toggleEdgeAutoChain = (edgeId: string) => {
		const updated = pipelineEdges().map((e) =>
			e.id === edgeId ? { ...e, autoChain: !e.autoChain } : e,
		);
		setPipelineEdges(updated);
		savePipelineEdges(params.id, updated);
		refreshConnections();
	};

	const toggleEdgeSummarize = (edgeId: string) => {
		const updated = pipelineEdges().map((e) =>
			e.id === edgeId ? { ...e, summarize: !e.summarize } : e,
		);
		setPipelineEdges(updated);
		savePipelineEdges(params.id, updated);
	};

	const getAllWidgetIds = (): number[] => {
		const ids: number[] = [];
		const roots = gridRef.querySelectorAll("[data-widget-id]");
		for (const root of roots) {
			const id = Number(root.getAttribute("data-widget-id"));
			if (!Number.isNaN(id) && id > 0) ids.push(id);
		}
		return ids;
	};

	const openAddPanel = () => {
		if (editorOpen()) return;
		setPanelView("select");
		setEditorOpen(true);
	};

	const createFromTemplate = async (templateId: string) => {
		const tmpl = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
		if (!tmpl) return;
		const g = grid();
		if (!g) return;

		// LLMプロバイダー確認
		const providers = llmProviders();
		if (providers.length === 0) {
			console.error("LLMプロバイダーが未設定です");
			return;
		}
		const userId = auth.user()?.id;
		if (!userId) return;

		setTemplateProgress({ message: "フォルダを選択..." });

		// フォルダ選択
		const folderPath = await openFolderPicker();
		if (!folderPath) {
			setTemplateProgress(null);
			return;
		}

		try {
			// パネル作成
			setTemplateProgress({ message: "パネルを配置中..." });
			const createdWidgetIds: number[] = [];

			for (const panelDef of tmpl.panels) {
				const newId = widgetCount() + 1;
				setWidgetCount(newId);

				const cfg = defaultConfigFor(panelDef.type);
				cfg.title = panelDef.title;
				cfg.color = panelDef.color;
				cfg.w = panelDef.w;
				cfg.h = panelDef.h;

				if (panelDef.visualSubType) cfg.visualSubType = panelDef.visualSubType;
				if (panelDef.diagramCode !== undefined) cfg.diagramCode = panelDef.diagramCode;
				if (panelDef.needsFolderPath) cfg.folderPath = folderPath;
				if (panelDef.aiPrompt) cfg.aiPrompt = panelDef.aiPrompt;
				if (panelDef.aiSystemPrompt) cfg.aiSystemPrompt = panelDef.aiSystemPrompt;
				if (panelDef.aiModel) cfg.aiModel = panelDef.aiModel;
				if (panelDef.aiTemperature !== undefined) cfg.aiTemperature = panelDef.aiTemperature;
				if (panelDef.aiMaxTokens) cfg.aiMaxTokens = panelDef.aiMaxTokens;
				if (panelDef.aiEnabledTools) cfg.aiEnabledTools = panelDef.aiEnabledTools;
				if (panelDef.aiOrchestrationMode) cfg.aiOrchestrationMode = panelDef.aiOrchestrationMode;
				if (panelDef.textBody !== undefined) cfg.textBody = panelDef.textBody;
				if (panelDef.folderMaxDepth !== undefined) cfg.folderMaxDepth = panelDef.folderMaxDepth;

				// AIパネル用にエージェント自動作成
				if (panelDef.needsAgent) {
					// テンプレートで指定されたプロバイダー名からIDを解決
					const providerName = panelDef.aiProviderName;
					const matchedProvider = providerName
						? providers.find((p) => p.name === providerName)
						: undefined;
					const providerId = matchedProvider?.id ?? providers[0].id;
					cfg.aiProviderId = providerId;

					const workflow = await createWorkflow(userId, panelDef.title);
					const agent = await createAgent({
						workflow_id: workflow.id,
						llm_provider_id: providerId,
						name: panelDef.title,
						system_prompt: panelDef.aiSystemPrompt || undefined,
						model: cfg.aiModel,
						temperature: cfg.aiTemperature,
						max_tokens: panelDef.aiMaxTokens ?? cfg.aiMaxTokens,
					});
					cfg.aiAgentId = agent.id;

					// テンプレートで指定されたツール権限をバックエンドに同期
					if (panelDef.aiEnabledTools && panelDef.aiEnabledTools.length > 0) {
						await updateToolPermissions(
							agent.id,
							panelDef.aiEnabledTools.map((name) => ({
								tool_name: name,
								is_enabled: true,
							})),
						);
					}
				}

				g.addWidget({
					w: cfg.w,
					h: cfg.h,
					content: makeWidgetContent(cfg.type, newId, cfg.title, cfg.color, cfg),
				});
				createdWidgetIds.push(newId);
			}

			// エッジ作成
			for (const edgeDef of tmpl.edges) {
				const sourceId = createdWidgetIds[edgeDef.sourceIndex];
				const targetId = createdWidgetIds[edgeDef.targetIndex];
				const edge: PipelineEdge = {
					id: `edge-${sourceId}-${targetId}`,
					sourceWidgetId: sourceId,
					targetWidgetId: targetId,
					autoChain: true,
				};
				if (edgeDef.condition) edge.condition = edgeDef.condition;
				if (edgeDef.maxRetries !== undefined) edge.maxRetries = edgeDef.maxRetries;
				if (edgeDef.retryDelayMs !== undefined) edge.retryDelayMs = edgeDef.retryDelayMs;
				addPipelineEdge(edge);
			}

			// フォルダ読み込み
			setTemplateProgress({ message: "フォルダを読み込み中..." });
			const folderWidgetId = createdWidgetIds[
				tmpl.panels.findIndex((p) => p.needsFolderPath)
			];
			const folderPanelDef = tmpl.panels.find((p) => p.needsFolderPath);
			const templateMaxDepth = folderPanelDef?.folderMaxDepth ?? 3;
			const excludePatterns = DEFAULT_EXCLUDE_PATTERNS;
			const entries = await readDirRecursive(folderPath, {
				maxDepth: templateMaxDepth,
				excludePatterns,
				maxFiles: 500,
			});
			const treeHtml = buildTreeHtml(entries);
			const treeArea = gridRef.querySelector(
				`[data-folder-tree-id="${folderWidgetId}"]`,
			);
			if (treeArea) treeArea.innerHTML = treeHtml;

			const contents = await readFolderContents(entries);
			const folderOutput = buildFolderOutput(folderPath, entries, contents);
			setPanelOutput(folderWidgetId, folderOutput);

			// DOM上のフォルダ出力キャッシュにも反映
			const folderOutEl = gridRef.querySelector(
				`[data-output-id="${folderWidgetId}"]`,
			);
			if (folderOutEl) folderOutEl.textContent = folderOutput;

			// AIパネル実行
			const aiPanelIndices = tmpl.panels
				.map((p, i) => (p.needsAgent ? i : -1))
				.filter((i) => i >= 0);

			for (const aiIdx of aiPanelIndices) {
				const aiWidgetId = createdWidgetIds[aiIdx];
				const aiDef = tmpl.panels[aiIdx];
				setTemplateProgress({ message: "AIを実行中..." });

				// upstream出力を収集
				const currentOutputs: Record<number, string> = {};
				for (const [idx, wid] of createdWidgetIds.entries()) {
					if (idx === aiIdx) continue;
					const output = getPanelOutput(wid, gridRef);
					if (output) currentOutputs[wid] = output;
				}
				const upstream = collectUpstreamOutputs(
					aiWidgetId,
					pipelineEdges(),
					currentOutputs,
				);
				const augmentedPrompt = buildAugmentedPrompt(
					aiDef.aiPrompt ?? "",
					upstream,
				);

				// ステータスバッジ更新
				const badge = gridRef.querySelector(
					`[data-status-id="${aiWidgetId}"]`,
				);
				if (badge) {
					badge.className = "ai-status-badge ai-status-running";
					badge.textContent = "実行中...";
				}

				const agentId =
					gridRef
						.querySelector(`[data-widget-id="${aiWidgetId}"]`)
						?.getAttribute("data-ai-agent-id") ?? "";

				// 429レート制限リトライ付きで実行
				const MAX_RETRIES = 5;
				let execution: Awaited<ReturnType<typeof executeAgent>> | null = null;
				for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
					try {
						execution = await executeAgent(agentId, augmentedPrompt);
						break;
					} catch (err) {
						const errStr = String(err);
						if (errStr.includes("429") && attempt < MAX_RETRIES) {
							const waitSec = Math.min(15 * (attempt + 1), 90);
							if (badge) {
								badge.className = "ai-status-badge ai-status-running";
								badge.textContent = `レート制限... ${waitSec}秒待機`;
							}
							setTemplateProgress({ message: `レート制限のため${waitSec}秒待機中...` });
							await new Promise((r) => setTimeout(r, waitSec * 1000));
							if (badge) {
								badge.className = "ai-status-badge ai-status-running";
								badge.textContent = "リトライ中...";
							}
							continue;
						}
						throw err;
					}
				}

				if (execution && execution.status === "completed") {
					const output = execution.output_text ?? "";
					setPanelOutput(aiWidgetId, output);

					const outEl = gridRef.querySelector(
						`[data-output-id="${aiWidgetId}"]`,
					);
					if (outEl) outEl.textContent = output;
					if (badge) {
						badge.className = "ai-status-badge ai-status-completed";
						badge.textContent = "完了";
					}

					// ER図テンプレート: AI出力からMermaidコードを抽出してダイアグラムパネルに反映
					const diagramIdx = tmpl.panels.findIndex(
						(p) => p.type === "visual" && p.visualSubType === "diagram",
					);
					if (diagramIdx >= 0) {
						const diagramWidgetId = createdWidgetIds[diagramIdx];
						const mermaidCode = extractMermaidCode(output);
						const diagramRoot = gridRef.querySelector(
							`[data-widget-id="${diagramWidgetId}"]`,
						);
						if (diagramRoot) {
							diagramRoot.setAttribute("data-diagram-code", mermaidCode);
						}
						const diagramOutEl = gridRef.querySelector(
							`[data-output-id="${diagramWidgetId}"]`,
						);
						if (diagramOutEl) diagramOutEl.textContent = mermaidCode;
						setPanelOutput(diagramWidgetId, mermaidCode);
						renderDiagramsInGrid(gridRef);
					}
				} else {
					const errMsg = execution?.error_message ?? "実行失敗";
					if (badge) {
						badge.className = "ai-status-badge ai-status-failed";
						badge.textContent = "失敗";
					}
					const outEl = gridRef.querySelector(
						`[data-output-id="${aiWidgetId}"]`,
					);
					if (outEl) outEl.textContent = errMsg;
				}
			}

			setTemplateProgress({ message: "完了!" });
			setTimeout(() => setTemplateProgress(null), 2000);
			refreshConnections();
			saveLayout(g, params.id);
		} catch (err) {
			console.error("Template execution failed:", err);
			setTemplateProgress(null);
			toastManager.addToast({
				id: `tmpl-err-${Date.now()}`,
				type: "error",
				title: "テンプレート実行失敗",
				message: String(err).slice(0, 100),
			});
		}
	};

	const handleTypeCustomize = (type: WidgetType) => {
		const cfg = defaultConfigFor(type);
		// AIパネル用に最初のLLMプロバイダーを自動選択
		if (type === "ai" && !cfg.aiProviderId && llmProviders().length > 0) {
			cfg.aiProviderId = llmProviders()[0].id;
		}
		setPanelConfig(cfg);
		setConfigTab("content");
		setDraftsOpen(false);
		setPanelView("editor");
	};

	const handleQuickAdd = (type: WidgetType) => {
		const g = grid();
		if (!g) return;
		const cfg = defaultConfigFor(type);
		const newCount = widgetCount() + 1;
		setWidgetCount(newCount);
		g.addWidget({
			w: cfg.w,
			h: cfg.h,
			content: makeWidgetContent(cfg.type, newCount, cfg.title, cfg.color, cfg),
		});
	};

	const handleEditWidget = (widgetId: number) => {
		const g = grid();
		if (!g) return;

		const items = g.getGridItems();
		const el = items.find((item) =>
			item.querySelector(`[data-widget-id="${widgetId}"]`),
		);
		if (!el) return;

		const root = el.querySelector("[data-widget-type]");
		let rawType = root?.getAttribute("data-widget-type") ?? "text";
		let visualSubType: VisualSubType = "chart";

		// レガシータイプマッピング: 旧"chart"/"table" -> visual + subtype
		if (rawType === "chart" || rawType === "table") {
			visualSubType = rawType as VisualSubType;
			rawType = "visual";
		} else if (rawType === "visual") {
			visualSubType =
				(root?.getAttribute("data-widget-subtype") as VisualSubType) ?? "chart";
		}

		const type = rawType as WidgetType;
		const header = el.querySelector(".widget-header span:first-child");
		const title = header?.textContent ?? "";
		const headerEl = el.querySelector(".widget-header") as HTMLElement;
		const color = headerEl?.style.color ?? "#eb5e41";
		const body = el.querySelector(".widget-body");
		const textBody = type === "text" ? (body?.innerHTML ?? "") : "";

		// AIフィールド
		let aiPrompt = "";
		let aiLinkedPanels: number[] = [];
		let aiAgentId = "";
		if (type === "ai") {
			aiPrompt = root?.getAttribute("data-ai-prompt") ?? "";
			const linkedStr = root?.getAttribute("data-ai-linked") ?? "";
			aiLinkedPanels = linkedStr
				? linkedStr
						.split(",")
						.map(Number)
						.filter((n) => !Number.isNaN(n) && n > 0)
				: [];
			aiAgentId = root?.getAttribute("data-ai-agent-id") ?? "";
		}

		const node = el.gridstackNode;
		// オーケストレーションモード・有効ツール
		let aiOrchestrationMode = "none";
		let aiEnabledTools: string[] = [];
		if (type === "ai") {
			aiOrchestrationMode =
				root?.getAttribute("data-ai-orchestration-mode") ?? "none";
			const toolsAttr = root?.getAttribute("data-ai-enabled-tools") ?? "";
			aiEnabledTools = toolsAttr ? toolsAttr.split(",").filter(Boolean) : [];
		}

		// フォルダフィールド
		let folderPath = "";
		let folderMaxDepth = 3;
		let folderExcludePatterns = DEFAULT_EXCLUDE_PATTERNS.join("\n");
		if (type === "folder") {
			folderPath = root?.getAttribute("data-folder-path") ?? "";
			folderMaxDepth = Number(
				root?.getAttribute("data-folder-max-depth") ?? "3",
			);
			folderExcludePatterns =
				root?.getAttribute("data-folder-exclude") ||
				DEFAULT_EXCLUDE_PATTERNS.join("\n");
		}

		// ダイアグラムフィールド
		let diagramCode = "";
		if (type === "visual" && visualSubType === "diagram") {
			diagramCode = root?.getAttribute("data-diagram-code") ?? "";
		}

		// AI設定フィールド (DOM属性から復元)
		let aiSystemPrompt = "";
		let aiModel = "claude-sonnet-4-5-20250929";
		let aiTemperature = 0.7;
		let aiMaxTokens = 1024;
		let aiProviderId = "";
		if (type === "ai") {
			aiSystemPrompt = root?.getAttribute("data-ai-system-prompt") ?? "";
			aiModel = root?.getAttribute("data-ai-model") || "claude-sonnet-4-5-20250929";
			aiTemperature = Number(root?.getAttribute("data-ai-temperature") ?? "0.7") || 0.7;
			aiMaxTokens = Number(root?.getAttribute("data-ai-max-tokens") ?? "1024") || 1024;
			aiProviderId = root?.getAttribute("data-ai-provider-id") ?? "";
		}

		setPanelConfig({
			type,
			visualSubType,
			title,
			color,
			w: node?.w ?? 16,
			h: node?.h ?? 11,
			textBody,
			aiPrompt,
			aiLinkedPanels,
			aiAgentId,
			aiSystemPrompt,
			aiModel,
			aiTemperature,
			aiMaxTokens,
			aiProviderId,
			aiOrchestrationMode,
			aiEnabledTools,
			folderPath,
			folderMaxDepth,
			folderExcludePatterns,
			diagramCode,
		});

		setEditingWidgetId(widgetId);
		setConfigTab("content");
		setPanelView("editor");
		setEditorOpen(true);
	};

	const typeIcon = (type: WidgetType, size = 24) => {
		switch (type) {
			case "text":
				return <FileTextIcon size={size} />;
			case "visual":
				return <BarChart3Icon size={size} />;
			case "ai":
				return <BotIcon size={size} />;
			case "object":
				return <BoxIcon size={size} />;
			case "folder":
				return <FolderIcon size={size} />;
		}
	};

	interface GridPanelInfo {
		id: number;
		type: WidgetType;
		title: string;
	}

	const getGridPanels = (): GridPanelInfo[] => {
		const g = grid();
		if (!g) return [];
		const editId = editingWidgetId();
		const panels: GridPanelInfo[] = [];
		for (const item of g.getGridItems()) {
			const root = item.querySelector("[data-widget-id]");
			if (!root) continue;
			const id = Number(root.getAttribute("data-widget-id"));
			if (Number.isNaN(id) || id === editId) continue;
			let rawType = root.getAttribute("data-widget-type") ?? "text";
			if (rawType === "chart" || rawType === "table") rawType = "visual";
			const header = item.querySelector(".widget-header span:first-child");
			const title = header?.textContent ?? `Widget #${id}`;
			panels.push({ id, type: rawType as WidgetType, title });
		}
		return panels;
	};

	const toggleLinkedPanel = (panelId: number) => {
		const current = panelConfig().aiLinkedPanels;
		const next = current.includes(panelId)
			? current.filter((x) => x !== panelId)
			: [...current, panelId];
		updateConfig("aiLinkedPanels", next);
	};

	// ユーザーフィードバック用エラーメッセージ
	const [addError, setAddError] = createSignal("");

	const handleAddWidget = async () => {
		const g = grid();
		if (!g) return;
		let cfg = panelConfig();
		const editId = editingWidgetId();
		setAddError("");

		// 新規AIパネル用にワークフロー＋エージェントを自動作成
		if (cfg.type === "ai" && !cfg.aiAgentId) {
			if (!cfg.aiProviderId) {
				setAddError("LLMプロバイダーを選択してください。");
				return;
			}
			try {
				const userId = auth.user()?.id;
				if (!userId) {
					setAddError("ログインが必要です。");
					return;
				}
				const workflow = await createWorkflow(userId, cfg.title);
				const agent = await createAgent({
					workflow_id: workflow.id,
					llm_provider_id: cfg.aiProviderId,
					name: cfg.title,
					system_prompt: cfg.aiSystemPrompt || undefined,
					model: cfg.aiModel,
					temperature: cfg.aiTemperature,
					max_tokens: cfg.aiMaxTokens,
				});
				cfg = { ...cfg, aiAgentId: agent.id };
				setPanelConfig(cfg);

				// ツール権限をバックエンドに同期
				if (cfg.aiEnabledTools.length > 0) {
					await updateToolPermissions(
						agent.id,
						AVAILABLE_TOOLS.map((t) => ({
							tool_name: t.name,
							is_enabled: cfg.aiEnabledTools.includes(t.name),
						})),
					);
				}
			} catch (err) {
				console.error("Failed to create agent:", err);
				setAddError(`エージェント作成に失敗しました: ${err}`);
				return;
			}
		}

		// 既存エージェントのツール権限を更新
		if (cfg.aiAgentId && cfg.type === "ai") {
			try {
				await updateToolPermissions(
					cfg.aiAgentId,
					AVAILABLE_TOOLS.map((t) => ({
						tool_name: t.name,
						is_enabled: cfg.aiEnabledTools.includes(t.name),
					})),
				);
			} catch (err) {
				console.warn("Failed to sync tool permissions:", err);
			}
		}

		if (editId !== null) {
			// 編集モード: 既存ウィジェットを更新
			const items = g.getGridItems();
			const el = items.find((item) =>
				item.querySelector(`[data-widget-id="${editId}"]`),
			);
			if (el) {
				const newContent = makeWidgetContent(
					cfg.type,
					editId,
					cfg.title,
					cfg.color,
					cfg,
				);
				g.update(el, { content: newContent });
			}
			setEditingWidgetId(null);
		} else {
			// 新規ウィジェットモード
			const newCount = widgetCount() + 1;
			setWidgetCount(newCount);
			g.addWidget({
				w: cfg.w,
				h: cfg.h,
				content: makeWidgetContent(
					cfg.type,
					newCount,
					cfg.title,
					cfg.color,
					cfg,
				),
			});
		}

		setEditorOpen(false);
		refreshConnections();
		renderDiagramsInGrid(gridRef);
	};

	const updateConfig = <K extends keyof PanelConfig>(
		key: K,
		value: PanelConfig[K],
	) => {
		setPanelConfig((prev) => ({ ...prev, [key]: value }));
	};

	// プロバイダー読み込み時かつAIエディター表示中に最初のLLMプロバイダーを自動選択
	createEffect(() => {
		const providers = llmProviders();
		const cfg = panelConfig();
		if (cfg.type === "ai" && !cfg.aiProviderId && providers.length > 0) {
			updateConfig("aiProviderId", providers[0].id);
		}
	});

	// 下書き
	const saveDraft = () => {
		const cfg = panelConfig();
		const draft: PanelDraft = {
			id: `draft-${Date.now()}`,
			type: cfg.type,
			visualSubType: cfg.visualSubType,
			title: cfg.title,
			color: cfg.color,
			w: cfg.w,
			h: cfg.h,
			textBody: cfg.textBody,
			aiPrompt: cfg.aiPrompt,
			aiLinkedPanels: cfg.aiLinkedPanels,
			aiAgentId: cfg.aiAgentId,
			aiSystemPrompt: cfg.aiSystemPrompt,
			aiModel: cfg.aiModel,
			aiTemperature: cfg.aiTemperature,
			aiMaxTokens: cfg.aiMaxTokens,
			aiProviderId: cfg.aiProviderId,
			aiOrchestrationMode: cfg.aiOrchestrationMode,
			aiEnabledTools: cfg.aiEnabledTools,
			folderPath: cfg.folderPath,
			folderMaxDepth: cfg.folderMaxDepth,
			folderExcludePatterns: cfg.folderExcludePatterns,
			diagramCode: cfg.diagramCode,
			savedAt: new Date().toLocaleString("ja-JP"),
		};
		const updated = [draft, ...drafts()];
		setDrafts(updated);
		saveDrafts(updated);
	};

	const loadDraft = (draft: PanelDraft) => {
		setPanelConfig({
			type: draft.type,
			visualSubType: draft.visualSubType ?? "chart",
			title: draft.title,
			color: draft.color,
			w: draft.w,
			h: draft.h,
			textBody: draft.textBody,
			aiPrompt: draft.aiPrompt ?? "",
			aiLinkedPanels: draft.aiLinkedPanels ?? [],
			aiAgentId: draft.aiAgentId ?? "",
			aiSystemPrompt: draft.aiSystemPrompt ?? "",
			aiModel: draft.aiModel ?? "claude-sonnet-4-5-20250929",
			aiTemperature: draft.aiTemperature ?? 0.7,
			aiMaxTokens: draft.aiMaxTokens ?? 1024,
			aiProviderId: draft.aiProviderId ?? "",
			aiOrchestrationMode: draft.aiOrchestrationMode ?? "none",
			aiEnabledTools: draft.aiEnabledTools ?? [],
			folderPath: draft.folderPath ?? "",
			folderMaxDepth: draft.folderMaxDepth ?? 3,
			folderExcludePatterns:
				draft.folderExcludePatterns ?? DEFAULT_EXCLUDE_PATTERNS.join("\n"),
			diagramCode: draft.diagramCode ?? "",
		});
		setDraftsOpen(false);
	};

	const deleteDraft = (id: string) => {
		const updated = drafts().filter((d) => d.id !== id);
		setDrafts(updated);
		saveDrafts(updated);
	};

	// GridStack初期化
	createEffect(
		on(
			() => params.id,
			(id) => {
				const prev = grid();
				if (prev) {
					prev.destroy(false);
					setGrid(null);
				}
				if (gridRef) gridRef.innerHTML = "";

				const g = GridStack.init(
					{
						column: 48,
						cellHeight: 15,
						margin: 10,
						float: true,
						removable: ".dashboard-trash",
						acceptWidgets: true,
					},
					gridRef,
				);

				const saved = localStorage.getItem(storageKey(id));
				if (saved) {
					try {
						const layout = JSON.parse(saved);
						g.load(layout);
						let maxId = 0;
						for (const item of layout) {
							const match = item.content?.match(/#(\d+)/);
							if (match) {
								const num = Number.parseInt(match[1], 10);
								if (num > maxId) maxId = num;
							}
						}
						setWidgetCount(maxId);
					} catch {
						setWidgetCount(0);
					}
				} else {
					setWidgetCount(0);
				}

				// パイプラインエッジ読込 or マイグレーション
				const savedEdges = loadPipelineEdges(id);
				if (savedEdges.length > 0) {
					setPipelineEdges(savedEdges);
				} else {
					// 既存aiLinkedPanelsからマイグレーション
					const migrated = migrateLinkedPanelsToEdges();
					if (migrated.length > 0) {
						setPipelineEdges(migrated);
						savePipelineEdges(id, migrated);
					}
				}
				setPipelineStatus("idle");
				setPanelOutputs({});
				setCurrentPipelineStep(null);

				// 保存済みダイアグラムを描画
				renderDiagramsInGrid(gridRef);

				const autoSave = () => saveLayout(g, id);
				g.on("change", () => {
					autoSave();
					refreshConnections();
				});
				g.on("added", () => {
					autoSave();
					refreshConnections();
					renderDiagramsInGrid(gridRef);
				});
				g.on("removed", (_event: Event, items: unknown) => {
					autoSave();
					// パネル削除時に関連エッジをカスケード削除
					if (Array.isArray(items)) {
						for (const item of items) {
							const el = (item as { el?: HTMLElement }).el;
							const root = el?.querySelector("[data-widget-id]");
							const wid = Number(root?.getAttribute("data-widget-id"));
							if (!Number.isNaN(wid) && wid > 0) {
								const updated = pipelineEdges().filter(
									(edge) =>
										edge.sourceWidgetId !== wid && edge.targetWidgetId !== wid,
								);
								if (updated.length !== pipelineEdges().length) {
									setPipelineEdges(updated);
									savePipelineEdges(id, updated);
								}
							}
						}
					}
					refreshConnections();
				});
				g.on("dragstart", () => setDragging(true));
				g.on("dragstop", () => {
					setDragging(false);
					refreshConnections();
				});
				g.on("resizestart", () => setDragging(true));
				g.on("resizestop", () => {
					setDragging(false);
					refreshConnections();
				});

				// ウィジェットアクション用イベント委譲
				const cleanupDelegation = setupGridEventDelegation(gridRef, g, {
					handleEditWidget,
					getPipelineEdges: () => pipelineEdges(),
					getPanelOutputs: () => panelOutputs(),
					setPanelOutput,
				});
				onCleanup(() => cleanupDelegation());

				// ポートドラッグ接続
				if (svgRef) {
					const cleanupPortDrag = setupPortDragHandler(gridRef, svgRef, {
						getEdges: () => pipelineEdges(),
						addEdge: addPipelineEdge,
						getAllWidgetIds,
					});
					onCleanup(() => cleanupPortDrag());

					// エッジ右クリックコンテキストメニュー
					const edgeContextAc = new AbortController();
					svgRef.addEventListener(
						"contextmenu",
						(e) => {
							const target = e.target as Element;
							const edgeId = target.getAttribute("data-edge-id");
							if (edgeId) {
								e.preventDefault();
								setEdgeContextMenu({
									x: e.clientX,
									y: e.clientY,
									edgeId,
								});
							}
						},
						{ signal: edgeContextAc.signal },
					);
					// クリックでコンテキストメニューを閉じる
					document.addEventListener("click", () => setEdgeContextMenu(null), {
						signal: edgeContextAc.signal,
					});
					onCleanup(() => edgeContextAc.abort());
				}

				setGrid(g);
				refreshConnections();
			},
		),
	);

	onCleanup(() => {
		const g = grid();
		if (g) {
			g.destroy(false);
		}
	});

	// === 3. テンプレート保存 ===
	const handleSaveAsTemplate = () => {
		const g = grid();
		if (!g) return;
		const name = templateName().trim();
		if (!name) return;
		const layout = g.save() as unknown[];
		const template: DashboardTemplate = {
			id: `tmpl-${Date.now()}`,
			name,
			description: "",
			layout,
			edges: pipelineEdges(),
			widgetCount: widgetCount(),
			savedAt: new Date().toLocaleString("ja-JP"),
		};
		saveTemplate(template);
		setSavedTemplates(loadTemplates());
		setTemplateModalOpen(false);
		setTemplateName("");
		toastManager.addToast({ id: `tmpl-save-${Date.now()}`, type: "success", title: "テンプレート保存完了", message: name });
	};

	const handleLoadSavedTemplate = (template: DashboardTemplate) => {
		const g = grid();
		if (!g) return;
		g.removeAll();
		g.load(template.layout as Parameters<GridStack["load"]>[0]);
		setWidgetCount(template.widgetCount);
		setPipelineEdges(template.edges);
		savePipelineEdges(params.id, template.edges);
		refreshConnections();
		renderDiagramsInGrid(gridRef);
		setTemplateModalOpen(false);
		toastManager.addToast({ id: `tmpl-load-${Date.now()}`, type: "info", title: "テンプレート読込完了", message: template.name });
	};

	const handleDeleteSavedTemplate = (id: string) => {
		deleteTemplate(id);
		setSavedTemplates(loadTemplates());
	};

	// === 5. 会話履歴ビューア ===
	const viewChatHistory = async (widgetId: number) => {
		const root = gridRef.querySelector(`[data-widget-id="${widgetId}"]`);
		const agentId = root?.getAttribute("data-ai-agent-id") ?? "";
		const header = root?.closest(".grid-stack-item")?.querySelector(".widget-header span:first-child");
		setChatHistoryTitle(header?.textContent ?? `AI Panel #${widgetId}`);
		if (!agentId) {
			setChatMessages([]);
			setChatHistoryOpen(true);
			return;
		}
		// 出力エリアからexecution_idを取得（WebSocketイベントで設定される）
		const outEl = gridRef.querySelector(`[data-output-id="${widgetId}"]`);
		const outputText = outEl?.textContent ?? "";
		if (!outputText) {
			setChatMessages([]);
			setChatHistoryOpen(true);
			return;
		}
		try {
			// 最新のexecutionを取得してメッセージを表示
			const msgs = await getExecutionMessages(agentId);
			setChatMessages(msgs);
		} catch {
			setChatMessages([]);
		}
		setChatHistoryOpen(true);
	};

	// === 8. スナップショット ===
	const handleExportSnapshot = async () => {
		const g = grid();
		if (!g) return;
		const savedPath = await downloadSnapshot({
			version: 1,
			name: itemName(),
			dashboardId: params.id,
			layout: g.save() as unknown[],
			edges: pipelineEdges(),
			widgetCount: widgetCount(),
			exportedAt: new Date().toISOString(),
		});
		if (savedPath) {
			toastManager.addToast({
				id: `snap-export-${Date.now()}`,
				type: "success",
				title: "スナップショットを保存しました",
				message: savedPath,
			});
		}
	};

	const handleImportSnapshot = () => {
		const json = snapshotJson().trim();
		if (!json) return;
		const snapshot = importSnapshot(json);
		if (!snapshot) {
			toastManager.addToast({ id: `snap-err-${Date.now()}`, type: "error", title: "インポート失敗", message: "無効なJSONです" });
			return;
		}
		const g = grid();
		if (!g) return;
		g.removeAll();
		g.load(snapshot.layout as Parameters<GridStack["load"]>[0]);
		setWidgetCount(snapshot.widgetCount);
		setPipelineEdges(snapshot.edges);
		savePipelineEdges(params.id, snapshot.edges);
		refreshConnections();
		renderDiagramsInGrid(gridRef);
		setSnapshotImportOpen(false);
		setSnapshotJson("");
		toastManager.addToast({ id: `snap-import-${Date.now()}`, type: "success", title: "スナップショットをインポートしました" });
	};

	// === 9. ツール/プラグイン ===
	const addToolDefinition = () => {
		setToolDefinitions((prev) => [
			...prev,
			{
				id: `tool-${Date.now()}`,
				name: "",
				description: "",
				parameters: [],
			},
		]);
	};

	const removeToolDefinition = (id: string) => {
		setToolDefinitions((prev) => prev.filter((t) => t.id !== id));
	};

	const updateToolDefinition = (id: string, field: string, value: string) => {
		setToolDefinitions((prev) =>
			prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
		);
	};

	// === 7. 条件分岐エッジ設定 ===
	const updateEdgeCondition = (edgeId: string, condition: string) => {
		const updated = pipelineEdges().map((e) =>
			e.id === edgeId ? { ...e, condition } : e,
		);
		setPipelineEdges(updated);
		savePipelineEdges(params.id, updated);
	};

	const updateEdgeRetries = (edgeId: string, maxRetries: number) => {
		const updated = pipelineEdges().map((e) =>
			e.id === edgeId ? { ...e, maxRetries, retryDelayMs: e.retryDelayMs ?? 2000 } : e,
		);
		setPipelineEdges(updated);
		savePipelineEdges(params.id, updated);
	};

	return (
		<div class="dashboard-container">
			<div class="dashboard-header">
				<h1>{itemName()}</h1>
				<div class="dashboard-header-actions">
					<For each={WORKFLOW_TEMPLATES}>
						{(tmpl) => (
							<button
								type="button"
								class="btn-template"
								onClick={() => createFromTemplate(tmpl.id)}
								disabled={templateProgress() !== null}
								title={tmpl.description}
							>
								<ZapIcon size={14} />
								{tmpl.label}
							</button>
						)}
					</For>
					<button type="button" class="btn-add" onClick={openAddPanel}>
						<PlusIcon size={16} />
						Add Panel
					</button>
					<div class="header-separator" />
					<button type="button" class="btn-header-icon" onClick={() => setTemplateModalOpen(true)} title="テンプレート保存/読込">
						<BookmarkIcon size={16} />
					</button>
					<button type="button" class="btn-header-icon" onClick={handleExportSnapshot} title="スナップショットをエクスポート">
						<DownloadIcon size={16} />
					</button>
					<button type="button" class="btn-header-icon" onClick={() => setSnapshotImportOpen(true)} title="スナップショットをインポート">
						<UploadIcon size={16} />
					</button>
					<button type="button" class="btn-header-icon" onClick={() => setProviderModalOpen(true)} title="LLMプロバイダー設定">
						<SettingsIcon size={16} />
					</button>
					<button type="button" class="btn-header-icon" onClick={() => setTimelineOpen(!timelineOpen())} title="実行タイムライン" classList={{ "btn-header-icon-active": timelineOpen() }}>
						<ClockIcon size={16} />
					</button>
				</div>
			</div>

			{/* テンプレート進捗バー */}
			<Show when={templateProgress()}>
				{(p) => (
					<div class="template-progress-bar">
						<div class="template-progress-spinner" />
						<span>{p().message}</span>
					</div>
				)}
			</Show>

			{/* パイプラインツールバー */}
			<Show when={pipelineEdges().length > 0}>
				<div class="pipeline-toolbar">
					<button
						type="button"
						class="pipeline-btn pipeline-btn-run"
						disabled={pipelineStatus() === "running"}
						onClick={handlePipelineExecute}
					>
						<PlayIcon size={14} />
						パイプライン実行
					</button>
					<button
						type="button"
						class="pipeline-btn pipeline-btn-stop"
						disabled={pipelineStatus() !== "running"}
						onClick={handlePipelineStop}
					>
						<SquareIcon size={14} />
						停止
					</button>
					<span
						class="pipeline-status-badge"
						classList={{
							"pipeline-status-idle": pipelineStatus() === "idle",
							"pipeline-status-running": pipelineStatus() === "running",
							"pipeline-status-completed": pipelineStatus() === "completed",
							"pipeline-status-failed": pipelineStatus() === "failed",
							"pipeline-status-stopped": pipelineStatus() === "stopped",
						}}
					>
						{pipelineStatus() === "idle"
							? "待機中"
							: pipelineStatus() === "running"
								? "実行中"
								: pipelineStatus() === "completed"
									? "完了"
									: pipelineStatus() === "failed"
										? "失敗"
										: "停止"}
					</span>
					<Show when={currentPipelineStep() !== null}>
						<span class="pipeline-step-indicator">
							Step: #{currentPipelineStep()}
						</span>
					</Show>
					<button
						type="button"
						class="pipeline-btn pipeline-btn-cache-clear"
						disabled={pipelineStatus() === "running"}
						onClick={() => {
							clearAllSummaryCaches(params.id);
							toastManager.addToast({ id: `cache-clear-${Date.now()}`, type: "info", title: "要約キャッシュクリア", message: "全パネルの要約キャッシュをクリアしました" });
						}}
					>
						<Trash2Icon size={14} />
						キャッシュクリア
					</button>
					<span class="pipeline-edge-count">
						{pipelineEdges().length} エッジ
					</span>
				</div>
			</Show>

			<div class="dashboard-grid-area">
				<div ref={gridRef} class="grid-stack" />

				{/* パネル接続線（矢印付き有向グラフ） */}
				<svg
					ref={svgRef}
					class="connections-svg"
					role="img"
					aria-label="Panel connections"
					style={{ display: dragging() ? "none" : undefined }}
				>
					<defs>
						<marker
							id="arrowhead"
							markerWidth="8"
							markerHeight="6"
							refX="8"
							refY="3"
							orient="auto"
						>
							<polygon points="0 0, 8 3, 0 6" fill="#6a1b9a" />
						</marker>
						<marker
							id="arrowhead-autochain"
							markerWidth="8"
							markerHeight="6"
							refX="8"
							refY="3"
							orient="auto"
						>
							<polygon points="0 0, 8 3, 0 6" fill="#1565c0" />
						</marker>
					</defs>
					<For each={connections()}>
						{(c) => (
							<g
								data-anim={animKey()}
								data-edge-id={c.edgeId}
								class="connection-group"
							>
								<circle
									cx={c.fromX}
									cy={c.fromY}
									r={3.5}
									class="connection-dot"
									style={{ fill: c.color }}
								/>
								<circle
									cx={c.toX}
									cy={c.toY}
									r={3.5}
									class="connection-dot"
									style={{ fill: c.color }}
								/>
								<path
									d={connectionPath(c)}
									class={
										c.isAutoChain
											? "connection-line connection-line-autochain"
											: "connection-line"
									}
									style={{ stroke: c.isAutoChain ? "#1565c0" : c.color }}
									marker-end={
										c.edgeId
											? c.isAutoChain
												? "url(#arrowhead-autochain)"
												: "url(#arrowhead)"
											: undefined
									}
								/>
								{/* 接続線のヒットエリア（右クリック用） */}
								<Show when={c.edgeId}>
									<path
										d={connectionPath(c)}
										class="connection-hitarea"
										data-edge-id={c.edgeId}
									/>
								</Show>
							</g>
						)}
					</For>
				</svg>

				{/* パネルオーバーレイ（統合: 選択 + エディター） */}
				<Show when={editorOpen()}>
					<div
						class="panel-overlay"
						classList={{ "panel-overlay-peek": peeking() }}
					>
						{/* ヘッダー */}
						<div class="panel-overlay-header">
							<div class="fp-header-left">
								<Show when={panelView() === "editor"}>
									<button
										type="button"
										class="fp-icon-btn"
										title="タイプ選択に戻る"
										onClick={() => {
											setEditingWidgetId(null);
											setPanelView("select");
										}}
									>
										<ArrowLeftIcon size={16} />
									</button>
								</Show>
								<span class="panel-overlay-title">
									{panelView() === "select"
										? "パネルを追加"
										: editingWidgetId() !== null
											? `${WIDGET_DEFS.find((d) => d.type === panelConfig().type)?.label}パネルを編集`
											: `${WIDGET_DEFS.find((d) => d.type === panelConfig().type)?.label}パネル`}
								</span>
							</div>
							<div class="fp-header-right">
								<Show when={panelView() === "editor"}>
									<button
										type="button"
										class="fp-icon-btn"
										title="一時保存一覧"
										onClick={() => setDraftsOpen(!draftsOpen())}
									>
										<FolderOpenIcon size={16} />
									</button>
								</Show>
								<button
									type="button"
									class="fp-icon-btn"
									title="閉じる"
									onClick={() => {
										setEditingWidgetId(null);
										setEditorOpen(false);
									}}
								>
									<XIcon size={16} />
								</button>
							</div>
						</div>

						{/* === 選択ビュー === */}
						<Show when={panelView() === "select"}>
							<div class="fp-select-body">
								<div class="fp-type-grid">
									<For each={WIDGET_DEFS}>
										{(def) => (
											<div class={`fp-type-card ${def.colorClass}`}>
												<div class="fp-type-card-icon">
													{typeIcon(def.type)}
												</div>
												<div class="fp-type-card-info">
													<span class="fp-type-card-label">{def.label}</span>
													<span class="fp-type-card-desc">
														{def.description}
													</span>
												</div>
												<div class="fp-type-card-actions">
													<button
														type="button"
														class="fp-btn fp-btn-customize"
														onClick={() => handleTypeCustomize(def.type)}
													>
														カスタマイズ
													</button>
													<button
														type="button"
														class="fp-btn fp-btn-quick"
														onClick={() => handleQuickAdd(def.type)}
													>
														<ZapIcon size={14} />
														即追加
													</button>
												</div>
											</div>
										)}
									</For>
								</div>

								<Show when={drafts().length > 0}>
									<div class="fp-recent-drafts">
										<div class="fp-recent-drafts-title">最近の下書き</div>
										<For each={drafts().slice(0, 3)}>
											{(draft) => (
												<button
													type="button"
													class="fp-recent-draft-item"
													onClick={() => {
														loadDraft(draft);
														setPanelView("editor");
													}}
												>
													<span class="fp-recent-draft-name">
														{draft.title}
													</span>
													<span class="fp-recent-draft-meta">
														{
															WIDGET_DEFS.find((d) => d.type === draft.type)
																?.label
														}{" "}
														· {draft.savedAt}
													</span>
												</button>
											)}
										</For>
									</div>
								</Show>
							</div>
						</Show>

						{/* === エディタービュー === */}
						<Show when={panelView() === "editor"}>
							{/* タブ */}
							<div class="fp-tabs">
								<button
									type="button"
									class="fp-tab"
									classList={{ active: configTab() === "content" }}
									onClick={() => setConfigTab("content")}
								>
									コンテンツ
								</button>
								<button
									type="button"
									class="fp-tab"
									classList={{ active: configTab() === "settings" }}
									onClick={() => setConfigTab("settings")}
								>
									スタイル
								</button>
							</div>

							{/* 本文 */}
							<div class="fp-body">
								<Show when={configTab() === "content"}>
									{/* テキスト -> リッチテキストエディター */}
									<Show when={panelConfig().type === "text"}>
										<div class="fp-editor-area">
											<RichTextEditor
												onHtmlChange={(html) => updateConfig("textBody", html)}
											/>
										</div>
									</Show>

									{/* ビジュアル -> サブタイプセレクター */}
									<Show when={panelConfig().type === "visual"}>
										<div class="fp-visual-selector">
											<div class="fp-field-label">表示形式</div>
											<div class="fp-visual-subtype-grid">
												<For each={VISUAL_SUBTYPES}>
													{(sub) => (
														<button
															type="button"
															class="fp-visual-subtype-card"
															classList={{
																selected:
																	panelConfig().visualSubType === sub.type,
															}}
															onClick={() =>
																updateConfig("visualSubType", sub.type)
															}
														>
															<div class="fp-visual-subtype-icon">
																{sub.type === "chart" ? (
																	<BarChart3Icon size={20} />
																) : sub.type === "table" ? (
																	<TableIcon size={20} />
																) : (
																	<Share2Icon size={20} />
																)}
															</div>
															<span class="fp-visual-subtype-label">
																{sub.label}
															</span>
															<span class="fp-visual-subtype-desc">
																{sub.description}
															</span>
														</button>
													)}
												</For>
											</div>
										</div>

										{/* ダイアグラム -> Mermaidコード入力 */}
										<Show
											when={panelConfig().visualSubType === "diagram"}
										>
											<div class="fp-diagram-editor">
												<div class="fp-field-label">Mermaidコード</div>
												<div class="fp-diagram-template-btns">
													<button
														type="button"
														class="fp-btn fp-btn-ghost"
														onClick={() =>
															updateConfig(
																"diagramCode",
																DEFAULT_ER_DIAGRAM,
															)
														}
													>
														ER図テンプレート
													</button>
												</div>
												<textarea
													class="fp-diagram-textarea"
													value={panelConfig().diagramCode}
													onInput={(e) =>
														updateConfig(
															"diagramCode",
															e.currentTarget.value,
														)
													}
													placeholder={`erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ...`}
													rows={12}
												/>
											</div>
										</Show>
									</Show>

									{/* AI -> エージェント設定 + プロンプト + 連携パネル */}
									<Show when={panelConfig().type === "ai"}>
										<div class="fp-ai-content">
											<div class="fp-ai-section fp-ai-agent-config">
												<div class="fp-field-label">エージェント設定</div>
												<div class="fp-ai-field">
													<label class="fp-ai-field-label">
														LLMプロバイダー
														<select
															class="fp-ai-select"
															ref={(el) => {
																createEffect(() => {
																	el.value = panelConfig().aiProviderId;
																});
															}}
															on:change={(e) => {
																const newProvId = (e.target as HTMLSelectElement).value;
																updateConfig("aiProviderId", newProvId);
																// プロバイダー変更時にモデルを自動選択
																const prov = llmProviders().find((p) => p.id === newProvId);
																const models = PROVIDER_MODELS[prov?.name ?? ""] ?? [];
																if (models.length > 0) {
																	updateConfig("aiModel", models[0].id);
																}
															}}
														>
															<option value="">選択してください</option>
															<For each={llmProviders()}>
																{(provider) => (
																	<option value={provider.id}>
																		{provider.display_name || provider.name}
																	</option>
																)}
															</For>
														</select>
													</label>
												</div>
												<div class="fp-ai-field">
													<label class="fp-ai-field-label">
														モデル名
														<select
															class="fp-ai-select"
															value={panelConfig().aiModel}
															on:change={(e) =>
																updateConfig(
																	"aiModel",
																	(e.target as HTMLSelectElement).value,
																)
															}
														>
															{(() => {
																const provId = panelConfig().aiProviderId;
																const prov = llmProviders().find((p) => p.id === provId);
																const models = PROVIDER_MODELS[prov?.name ?? ""] ?? [];
																if (models.length === 0) {
																	return <option value={panelConfig().aiModel}>{panelConfig().aiModel || "モデル未設定"}</option>;
																}
																return (
																	<For each={models}>
																		{(m) => (
																			<option value={m.id}>{m.label}</option>
																		)}
																	</For>
																);
															})()}
														</select>
													</label>
												</div>
												<div class="fp-ai-field">
													<label class="fp-ai-field-label">
														System Prompt
														<textarea
															class="fp-ai-textarea"
															value={panelConfig().aiSystemPrompt}
															onInput={(e) =>
																updateConfig(
																	"aiSystemPrompt",
																	e.currentTarget.value,
																)
															}
															placeholder="システムプロンプトを入力..."
															rows={3}
														/>
													</label>
												</div>
												<div class="fp-ai-field">
													<label class="fp-ai-field-label">
														Temperature
														<div class="fp-ai-slider-row">
															<input
																type="range"
																class="fp-size-slider"
																min={0}
																max={1}
																step={0.1}
																value={panelConfig().aiTemperature}
																onInput={(e) =>
																	updateConfig(
																		"aiTemperature",
																		Number.parseFloat(e.currentTarget.value),
																	)
																}
															/>
															<span class="fp-ai-slider-value">
																{panelConfig().aiTemperature.toFixed(1)}
															</span>
														</div>
													</label>
												</div>
												<div class="fp-ai-field">
													<label class="fp-ai-field-label">
														Max Tokens
														<input
															type="number"
															class="fp-ai-number-input"
															value={panelConfig().aiMaxTokens}
															onInput={(e) =>
																updateConfig(
																	"aiMaxTokens",
																	Number.parseInt(e.currentTarget.value, 10) ||
																		1024,
																)
															}
															min={1}
															max={100000}
														/>
													</label>
												</div>
												<div class="fp-ai-field">
													<label class="fp-ai-field-label">
														オーケストレーションモード
														<select
															class="fp-ai-select"
															ref={(el) => {
																createEffect(() => {
																	el.value = panelConfig().aiOrchestrationMode;
																});
															}}
															on:change={(e) => {
																updateConfig(
																	"aiOrchestrationMode",
																	(e.target as HTMLSelectElement).value,
																);
															}}
														>
															<option value="none">
																なし（単一エージェント）
															</option>
															<option value="automatic">自動モード</option>
															<option value="approval">承認モード</option>
														</select>
													</label>
												</div>
												<div class="fp-ai-field">
													<div class="fp-ai-field-label">
														使用ツール
													</div>
													<div class="fp-ai-tools-grid">
														<For each={AVAILABLE_TOOLS}>
															{(tool) => {
																const isEnabled = () =>
																	panelConfig().aiEnabledTools.includes(
																		tool.name,
																	);
																return (
																	<button
																		type="button"
																		class="fp-ai-tool-chip"
																		classList={{
																			enabled: isEnabled(),
																		}}
																		onClick={() => {
																			const current =
																				panelConfig().aiEnabledTools;
																			if (isEnabled()) {
																				updateConfig(
																					"aiEnabledTools",
																					current.filter(
																						(t) => t !== tool.name,
																					),
																				);
																			} else {
																				updateConfig(
																					"aiEnabledTools",
																					[...current, tool.name],
																				);
																			}
																		}}
																		title={tool.description}
																	>
																		<span class="fp-ai-tool-check">
																			<Show when={isEnabled()}>
																				<CheckIcon size={12} />
																			</Show>
																		</span>
																		<span class="fp-ai-tool-label">
																			{tool.label}
																		</span>
																	</button>
																);
															}}
														</For>
													</div>
												</div>
											</div>
											<div class="fp-ai-section">
												<div class="fp-field-label">入力プロンプト</div>
												<div class="fp-ai-prompt-editor">
													<PlainTextEditor
														onTextChange={(text) =>
															updateConfig("aiPrompt", text)
														}
														initialText={panelConfig().aiPrompt}
														placeholder="AIへのプロンプトを入力..."
													/>
												</div>
											</div>
											<div class="fp-ai-section">
												<div class="fp-field-label">連携データ</div>
												{(() => {
													const panels = getGridPanels();
													if (panels.length === 0) {
														return (
															<div class="fp-ai-empty">
																ダッシュボードにパネルがありません。先にパネルを追加してください。
															</div>
														);
													}
													return (
														<div class="fp-ai-panel-list">
															<For each={panels}>
																{(panel) => {
																	const isSelected = () =>
																		panelConfig().aiLinkedPanels.includes(
																			panel.id,
																		);
																	return (
																		<button
																			type="button"
																			class="fp-ai-panel-item"
																			classList={{
																				selected: isSelected(),
																			}}
																			onClick={() =>
																				toggleLinkedPanel(panel.id)
																			}
																		>
																			<div class="fp-ai-panel-check">
																				<Show when={isSelected()}>
																					<CheckIcon size={14} />
																				</Show>
																			</div>
																			<div class="fp-ai-panel-icon">
																				{typeIcon(panel.type, 16)}
																			</div>
																			<span class="fp-ai-panel-title">
																				{panel.title}
																			</span>
																			<span class="fp-ai-panel-id">
																				#{panel.id}
																			</span>
																		</button>
																	);
																}}
															</For>
														</div>
													);
												})()}
											</div>
										</div>
									</Show>

									{/* オブジェクト -> プレースホルダー */}
									<Show when={panelConfig().type === "object"}>
										<div class="fp-placeholder-msg">
											オブジェクトパネルの設定は後日追加予定です。
										</div>
									</Show>

									{/* フォルダ -> パス選択・深さ・除外パターン */}
									<Show when={panelConfig().type === "folder"}>
										<div class="fp-folder-content">
											<div class="fp-folder-section">
												<div class="fp-field-label">フォルダパス</div>
												<div class="fp-folder-path-row">
													<input
														type="text"
														class="fp-field-input"
														value={panelConfig().folderPath}
														onInput={(e) =>
															updateConfig("folderPath", e.currentTarget.value)
														}
														placeholder="フォルダパスを入力..."
													/>
													<button
														type="button"
														class="fp-btn fp-btn-folder-pick"
														onClick={async () => {
															const picked = await openFolderPicker();
															if (picked) {
																updateConfig("folderPath", picked);
															}
														}}
													>
														<FolderOpenIcon size={14} />
														選択
													</button>
												</div>
											</div>
											<div class="fp-folder-section">
												<label class="fp-field-label">
													深さ制限
													<div class="fp-ai-slider-row">
														<input
															type="range"
															class="fp-size-slider"
															min={1}
															max={10}
															step={1}
															value={panelConfig().folderMaxDepth}
															onInput={(e) =>
																updateConfig(
																	"folderMaxDepth",
																	Number.parseInt(e.currentTarget.value, 10),
																)
															}
														/>
														<span class="fp-ai-slider-value">
															{panelConfig().folderMaxDepth}
														</span>
													</div>
												</label>
											</div>
											<div class="fp-folder-section">
												<label class="fp-field-label">
													除外パターン（改行区切り）
													<textarea
														class="fp-ai-textarea"
														value={panelConfig().folderExcludePatterns}
														onInput={(e) =>
															updateConfig(
																"folderExcludePatterns",
																e.currentTarget.value,
															)
														}
														placeholder={"node_modules\n.git\ndist"}
														rows={6}
													/>
												</label>
											</div>
										</div>
									</Show>
								</Show>

								<Show when={configTab() === "settings"}>
									<div class="fp-settings">
										<div class="fp-field">
											<label class="fp-field-label">
												タイトル
												<input
													type="text"
													class="fp-field-input"
													value={panelConfig().title}
													onInput={(e) =>
														updateConfig("title", e.currentTarget.value)
													}
												/>
											</label>
										</div>
										<div class="fp-field">
											<span class="fp-field-label">パネルカラー</span>
											<div class="fp-color-grid">
												<For each={COLOR_PRESETS}>
													{(c) => (
														<button
															type="button"
															class="fp-color-swatch"
															classList={{
																selected: panelConfig().color === c.value,
															}}
															style={{ background: c.value }}
															title={c.label}
															onClick={() => updateConfig("color", c.value)}
														/>
													)}
												</For>
											</div>
										</div>
										<div class="fp-field">
											<span class="fp-field-label">パネルサイズ</span>
											<div class="fp-size-controls">
												<div class="fp-size-control">
													<div class="fp-size-control-header">
														<MoveHorizontalIcon size={14} />
														<span>幅</span>
													</div>
													<div class="fp-size-control-row">
														<div class="fp-size-stepper">
															<button
																type="button"
																class="fp-stepper-btn"
																onClick={() =>
																	updateConfig(
																		"w",
																		Math.max(1, panelConfig().w - 1),
																	)
																}
															>
																<MinusIcon size={14} />
															</button>
															<span class="fp-stepper-value">
																{panelConfig().w}
															</span>
															<button
																type="button"
																class="fp-stepper-btn"
																onClick={() =>
																	updateConfig(
																		"w",
																		Math.min(48, panelConfig().w + 1),
																	)
																}
															>
																<PlusIcon size={14} />
															</button>
														</div>
														<input
															type="range"
															class="fp-size-slider"
															min={1}
															max={48}
															value={panelConfig().w}
															onInput={(e) =>
																updateConfig(
																	"w",
																	Number.parseInt(e.currentTarget.value, 10),
																)
															}
														/>
													</div>
												</div>
												<div class="fp-size-control">
													<div class="fp-size-control-header">
														<MoveVerticalIcon size={14} />
														<span>高さ</span>
													</div>
													<div class="fp-size-control-row">
														<div class="fp-size-stepper">
															<button
																type="button"
																class="fp-stepper-btn"
																onClick={() =>
																	updateConfig(
																		"h",
																		Math.max(1, panelConfig().h - 1),
																	)
																}
															>
																<MinusIcon size={14} />
															</button>
															<span class="fp-stepper-value">
																{panelConfig().h}
															</span>
															<button
																type="button"
																class="fp-stepper-btn"
																onClick={() =>
																	updateConfig(
																		"h",
																		Math.min(42, panelConfig().h + 1),
																	)
																}
															>
																<PlusIcon size={14} />
															</button>
														</div>
														<input
															type="range"
															class="fp-size-slider"
															min={1}
															max={42}
															value={panelConfig().h}
															onInput={(e) =>
																updateConfig(
																	"h",
																	Number.parseInt(e.currentTarget.value, 10),
																)
															}
														/>
													</div>
												</div>
											</div>
											<div class="fp-size-grid-visual">
												<div
													class="fp-size-grid-indicator"
													style={{
														width: `${(panelConfig().w / 48) * 100}%`,
														height: `${(panelConfig().h / 42) * 100}%`,
														background: `${panelConfig().color}25`,
														"border-color": panelConfig().color,
													}}
												/>
											</div>
										</div>
										<div class="fp-field">
											<span class="fp-field-label">プレビュー</span>
											<div
												class="fp-preview"
												style={{ "border-color": panelConfig().color }}
											>
												<div
													class="fp-preview-header"
													style={{
														background: `${panelConfig().color}20`,
														color: panelConfig().color,
													}}
												>
													{panelConfig().title}
												</div>
												<div class="fp-preview-body">
													{panelConfig().w} x {panelConfig().h} セル
												</div>
											</div>
										</div>
									{/* ツール/プラグイン設定（AIパネル時のみ） */}
									<Show when={panelConfig().type === "ai"}>
										<div class="fp-field">
											<span class="fp-field-label"><WrenchIcon size={14} /> ツール/プラグイン</span>
											<div class="tool-config-inline">
												<For each={toolDefinitions()}>
													{(tool) => (
														<div class="tool-item">
															<input
																type="text"
																class="modal-input"
																placeholder="ツール名"
																value={tool.name}
																onInput={(e) => updateToolDefinition(tool.id, "name", e.currentTarget.value)}
															/>
															<input
																type="text"
																class="modal-input"
																placeholder="説明"
																value={tool.description}
																onInput={(e) => updateToolDefinition(tool.id, "description", e.currentTarget.value)}
															/>
															<button type="button" class="fp-icon-btn fp-icon-btn-danger" onClick={() => removeToolDefinition(tool.id)}>
																<Trash2Icon size={12} />
															</button>
														</div>
													)}
												</For>
												<button type="button" class="fp-btn fp-btn-ghost" onClick={addToolDefinition}>
													<PlusIcon size={12} /> ツール追加
												</button>
											</div>
										</div>
									</Show>
									</div>
								</Show>
							</div>

							{/* フッター */}
							<Show when={addError()}>
								<div class="fp-error-bar">{addError()}</div>
							</Show>
							<div class="fp-footer">
								<button
									type="button"
									class="fp-btn fp-btn-ghost"
									onClick={saveDraft}
								>
									<SaveIcon size={14} />
									下書き保存
								</button>
								<Show when={panelConfig().type === "ai" && editingWidgetId() !== null}>
									<button
										type="button"
										class="fp-btn fp-btn-ghost"
										onClick={() => { const id = editingWidgetId(); if (id !== null) viewChatHistory(id); }}
									>
										<MessageSquareIcon size={14} />
										履歴
									</button>
								</Show>
								<div class="fp-footer-spacer" />
								<span class="fp-shortcut-hint">Ctrl+Enter</span>
								<button
									type="button"
									class="fp-btn fp-btn-secondary"
									onClick={() => {
										setEditingWidgetId(null);
										setEditorOpen(false);
									}}
								>
									キャンセル
								</button>
								<button
									type="button"
									class="fp-btn fp-btn-primary"
									onClick={handleAddWidget}
								>
									{editingWidgetId() !== null ? "更新" : "追加"}
								</button>
							</div>

							{/* 下書きドロワー */}
							<Show when={draftsOpen()}>
								<div class="fp-drafts">
									<div class="fp-drafts-header">
										<span>一時保存一覧</span>
										<button
											type="button"
											class="fp-icon-btn"
											onClick={() => setDraftsOpen(false)}
										>
											<XIcon size={14} />
										</button>
									</div>
									<div class="fp-drafts-list">
										<Show
											when={drafts().length > 0}
											fallback={
												<div class="fp-drafts-empty">
													保存されたドラフトはありません。
												</div>
											}
										>
											<For each={drafts()}>
												{(draft) => (
													<div class="fp-draft-item">
														<div class="fp-draft-info">
															<span class="fp-draft-title">{draft.title}</span>
															<span class="fp-draft-meta">
																{
																	WIDGET_DEFS.find((d) => d.type === draft.type)
																		?.label
																}{" "}
																· {draft.savedAt}
															</span>
														</div>
														<div class="fp-draft-actions">
															<button
																type="button"
																class="fp-icon-btn"
																title="読み込む"
																onClick={() => loadDraft(draft)}
															>
																<FolderOpenIcon size={14} />
															</button>
															<button
																type="button"
																class="fp-icon-btn fp-icon-btn-danger"
																title="削除"
																onClick={() => deleteDraft(draft.id)}
															>
																<Trash2Icon size={14} />
															</button>
														</div>
													</div>
												)}
											</For>
										</Show>
									</div>
								</div>
							</Show>
						</Show>
					</div>
				</Show>
			</div>

			{/* エッジコンテキストメニュー（条件分岐・リトライ設定追加） */}
			<Show when={edgeContextMenu()}>
				{(menu) => {
					const edge = () => pipelineEdges().find((e) => e.id === menu().edgeId);
					return (
						<div
							class="edge-context-menu"
							style={{
								left: `${menu().x}px`,
								top: `${menu().y}px`,
							}}
						>
							<button
								type="button"
								class="edge-context-menu-item"
								onClick={() => {
									toggleEdgeAutoChain(menu().edgeId);
									setEdgeContextMenu(null);
								}}
							>
								{edge()?.autoChain ? "Auto-chain 無効化" : "Auto-chain 有効化"}
							</button>
							<button
								type="button"
								class="edge-context-menu-item"
								onClick={() => {
									toggleEdgeSummarize(menu().edgeId);
									setEdgeContextMenu(null);
								}}
							>
								{edge()?.summarize ? "要約パイプライン 無効化" : "要約パイプライン 有効化"}
							</button>
							<div class="edge-context-separator" />
							<div class="edge-context-field">
								<label for="edge-condition">条件 (contains:, not:, length&gt;)</label>
								<input
									id="edge-condition"
									type="text"
									class="edge-context-input"
									value={edge()?.condition ?? ""}
									placeholder="例: contains:成功"
									onInput={(e) => updateEdgeCondition(menu().edgeId, e.currentTarget.value)}
								/>
							</div>
							<div class="edge-context-field">
								<label for="edge-retries">リトライ回数</label>
								<input
									id="edge-retries"
									type="number"
									class="edge-context-input"
									min={0}
									max={10}
									value={edge()?.maxRetries ?? 0}
									onInput={(e) => updateEdgeRetries(menu().edgeId, Number(e.currentTarget.value))}
								/>
							</div>
							<div class="edge-context-separator" />
							<button
								type="button"
								class="edge-context-menu-item edge-context-menu-item-danger"
								onClick={() => {
									removePipelineEdge(menu().edgeId);
									setEdgeContextMenu(null);
								}}
							>
								エッジを削除
							</button>
						</div>
					);
				}}
			</Show>

			{/* === 1. タイムラインドロワー === */}
			<Show when={timelineOpen()}>
				<div class="timeline-drawer">
					<div class="timeline-drawer-header">
						<ClockIcon size={16} />
						<span>実行タイムライン</span>
						<button type="button" class="fp-icon-btn" onClick={() => setTimelineOpen(false)}>
							<XIcon size={14} />
						</button>
					</div>
					<div class="timeline-drawer-body">
						<Show when={timelineEntries().length > 0} fallback={<p class="timeline-empty">実行ログはありません</p>}>
							<For each={timelineEntries()}>
								{(entry) => (
									<div class={`tl-entry tl-entry-${entry.status}`}>
										<span class="tl-time">{new Date(entry.timestamp).toLocaleTimeString("ja-JP")}</span>
										<span class="tl-title">#{entry.widgetId} {entry.widgetTitle}</span>
										<span class="tl-message">{entry.message}</span>
										<Show when={entry.durationMs}>
											<span class="tl-duration">{((entry.durationMs ?? 0) / 1000).toFixed(1)}s</span>
										</Show>
									</div>
								)}
							</For>
						</Show>
					</div>
				</div>
			</Show>

			{/* === 3. テンプレート保存/読込モーダル === */}
			<Show when={templateModalOpen()}>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop */}
				{/* biome-ignore lint/a11y/useSemanticElements: modal backdrop */}
				<div class="modal-overlay" role="button" tabIndex={-1} onClick={() => setTemplateModalOpen(false)}>
					<div class="modal-content" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
						<div class="modal-header">
							<BookmarkIcon size={18} />
							<span>テンプレート管理</span>
							<button type="button" class="fp-icon-btn" onClick={() => setTemplateModalOpen(false)}>
								<XIcon size={14} />
							</button>
						</div>
						<div class="modal-body">
							<div class="modal-section">
								<h4>現在のレイアウトを保存</h4>
								<div class="modal-save-row">
									<input
										type="text"
										class="modal-input"
										placeholder="テンプレート名"
										value={templateName()}
										onInput={(e) => setTemplateName(e.currentTarget.value)}
									/>
									<button type="button" class="fp-btn fp-btn-primary" onClick={handleSaveAsTemplate}>
										<SaveIcon size={14} />
										保存
									</button>
								</div>
							</div>
							<div class="modal-section">
								<h4>保存済みテンプレート</h4>
								<Show when={savedTemplates().length > 0} fallback={<p class="modal-empty">保存済みテンプレートはありません</p>}>
									<For each={savedTemplates()}>
										{(tmpl) => (
											<div class="modal-template-item">
												<div class="modal-template-info">
													<span class="modal-template-name">{tmpl.name}</span>
													<span class="modal-template-meta">{tmpl.savedAt} · {tmpl.edges.length} エッジ</span>
												</div>
												<div class="modal-template-actions">
													<button type="button" class="fp-btn fp-btn-ghost" onClick={() => handleLoadSavedTemplate(tmpl)}>読込</button>
													<button type="button" class="fp-icon-btn fp-icon-btn-danger" onClick={() => handleDeleteSavedTemplate(tmpl.id)}>
														<Trash2Icon size={14} />
													</button>
												</div>
											</div>
										)}
									</For>
								</Show>
							</div>
						</div>
					</div>
				</div>
			</Show>

			{/* === 5. 会話履歴モーダル === */}
			<Show when={chatHistoryOpen()}>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop */}
				{/* biome-ignore lint/a11y/useSemanticElements: modal backdrop */}
				<div class="modal-overlay" role="button" tabIndex={-1} onClick={() => setChatHistoryOpen(false)}>
					<div class="modal-content modal-chat" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
						<div class="modal-header">
							<MessageSquareIcon size={18} />
							<span>{chatHistoryTitle()}</span>
							<button type="button" class="fp-icon-btn" onClick={() => setChatHistoryOpen(false)}>
								<XIcon size={14} />
							</button>
						</div>
						<div class="modal-body chat-body">
							<Show when={chatMessages().length > 0} fallback={<p class="modal-empty">会話履歴はありません</p>}>
								<For each={chatMessages()}>
									{(msg) => (
										<div class={`chat-msg chat-msg-${msg.role}`}>
											<span class="chat-role">{msg.role === "user" ? "User" : "AI"}</span>
											<div class="chat-content">{msg.content}</div>
										</div>
									)}
								</For>
							</Show>
						</div>
					</div>
				</div>
			</Show>

			{/* === 6. LLMプロバイダー管理モーダル === */}
			<Show when={providerModalOpen()}>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop */}
				{/* biome-ignore lint/a11y/useSemanticElements: modal backdrop */}
				<div class="modal-overlay" role="button" tabIndex={-1} onClick={() => setProviderModalOpen(false)}>
					<div class="modal-content" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
						<div class="modal-header">
							<SettingsIcon size={18} />
							<span>LLMプロバイダー設定</span>
							<button type="button" class="fp-icon-btn" onClick={() => setProviderModalOpen(false)}>
								<XIcon size={14} />
							</button>
						</div>
						<div class="modal-body">
							<Show when={llmProviders().length > 0} fallback={<p class="modal-empty">プロバイダーが登録されていません</p>}>
								<For each={llmProviders()}>
									{(provider) => (
										<div class="provider-item">
											<div class="provider-info">
												<span class="provider-name">{provider.display_name || provider.name}</span>
												<span class="provider-meta">{provider.api_base_url ?? "デフォルトURL"}</span>
											</div>
											<span class={`provider-status ${provider.is_enabled ? "provider-enabled" : "provider-disabled"}`}>
												{provider.is_enabled ? "有効" : "無効"}
											</span>
										</div>
									)}
								</For>
							</Show>
						</div>
					</div>
				</div>
			</Show>

			{/* === 8. スナップショットインポートモーダル === */}
			<Show when={snapshotImportOpen()}>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop */}
				{/* biome-ignore lint/a11y/useSemanticElements: modal backdrop */}
				<div class="modal-overlay" role="button" tabIndex={-1} onClick={() => setSnapshotImportOpen(false)}>
					<div class="modal-content" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
						<div class="modal-header">
							<UploadIcon size={18} />
							<span>スナップショットインポート</span>
							<button type="button" class="fp-icon-btn" onClick={() => setSnapshotImportOpen(false)}>
								<XIcon size={14} />
							</button>
						</div>
						<div class="modal-body">
							<textarea
								class="snapshot-textarea"
								placeholder="エクスポートしたJSONをペーストしてください..."
								value={snapshotJson()}
								onInput={(e) => setSnapshotJson(e.currentTarget.value)}
								rows={10}
							/>
							<button type="button" class="fp-btn fp-btn-primary" style={{ "margin-top": "0.5rem" }} onClick={handleImportSnapshot}>
								インポート実行
							</button>
						</div>
					</div>
				</div>
			</Show>

			{/* === 10. コラボレーション表示 === */}
			<Show when={collaborationUsers().length > 0}>
				<div class="collab-bar">
					<For each={collaborationUsers()}>
						{(user) => (
							<span class="collab-avatar" style={{ background: user.color }} title={user.name}>
								{user.name.charAt(0).toUpperCase()}
							</span>
						)}
					</For>
				</div>
			</Show>

			{/* トースト通知 */}
			<ToastContainer />
		</div>
	);
}
