import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useParams } from "@solidjs/router";
import {
	ArrowLeftIcon,
	BarChart3Icon,
	BotIcon,
	BoxIcon,
	CheckIcon,
	FileTextIcon,
	FolderOpenIcon,
	MinusIcon,
	MoveHorizontalIcon,
	MoveVerticalIcon,
	PlusIcon,
	SaveIcon,
	TableIcon,
	Trash2Icon,
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
import type { EventEnvelope, LlmProvider } from "../utils/agent";
import { createAgent, createWorkflow, getLlmProviders } from "../utils/agent";
import {
	connectWebSocket,
	disconnectWebSocket,
	onExecutionEvent,
} from "../utils/ws";
import "./Dashboard.css";

import {
	computeConnections,
	connectionPath,
} from "./dashboard/connectionGeometry";
import {
	COLOR_PRESETS,
	VISUAL_SUBTYPES,
	WIDGET_DEFS,
} from "./dashboard/constants";
import { loadDrafts, saveDrafts, storageKey } from "./dashboard/drafts";
import { setupGridEventDelegation } from "./dashboard/gridEventDelegation";
import type {
	Connection,
	PanelConfig,
	PanelDraft,
	VisualSubType,
	WidgetType,
} from "./dashboard/types";
import { defaultConfigFor, makeWidgetContent } from "./dashboard/widgetContent";
import { handleWsEvent } from "./dashboard/wsEventHandler";

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

	const refreshConnections = () => {
		if (!gridRef) return;
		setConnections(computeConnections(gridRef));
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
			);
		});
		onCleanup(() => {
			unsub();
			disconnectWebSocket();
		});
	});

	// --- キーボードショートカット ---
	const handleKeyDown = (e: KeyboardEvent) => {
		if (!editorOpen()) return;

		// Alt長押し -> プレビュー
		if (e.key === "Alt") {
			e.preventDefault();
			setPeeking(true);
		}

		// Escape -> 閉じる
		if (e.key === "Escape") {
			e.preventDefault();
			setEditingWidgetId(null);
			setEditorOpen(false);
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

	createEffect(() => {
		if (editorOpen()) {
			document.addEventListener("keydown", handleKeyDown);
			document.addEventListener("keyup", handleKeyUp);
		} else {
			document.removeEventListener("keydown", handleKeyDown);
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

	const openAddPanel = () => {
		if (editorOpen()) return;
		setPanelView("select");
		setEditorOpen(true);
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
		// オーケストレーションモード
		let aiOrchestrationMode = "none";
		if (type === "ai") {
			aiOrchestrationMode =
				root?.getAttribute("data-ai-orchestration-mode") ?? "none";
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
			aiSystemPrompt: "",
			aiModel: "claude-sonnet-4-5-20250929",
			aiTemperature: 0.7,
			aiMaxTokens: 1024,
			aiProviderId: "",
			aiOrchestrationMode,
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
			} catch (err) {
				console.error("Failed to create agent:", err);
				setAddError(`エージェント作成に失敗しました: ${err}`);
				return;
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

				const autoSave = () => saveLayout(g, id);
				g.on("change", () => {
					autoSave();
					refreshConnections();
				});
				g.on("added", () => {
					autoSave();
					refreshConnections();
				});
				g.on("removed", () => {
					autoSave();
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
				});
				onCleanup(() => cleanupDelegation());

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

	return (
		<div class="dashboard-container">
			<div class="dashboard-header">
				<h1>{itemName()}</h1>
				<button type="button" class="btn-add" onClick={openAddPanel}>
					<PlusIcon size={16} />
					Add Panel
				</button>
			</div>

			<div class="dashboard-grid-area">
				<div ref={gridRef} class="grid-stack" />

				{/* AIパネルと連携パネル間の接続線 */}
				<Show when={!dragging()}>
					<svg
						class="connections-svg"
						role="img"
						aria-label="Panel connections"
					>
						<For each={connections()}>
							{(c) => (
								<g data-anim={animKey()}>
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
										class="connection-line"
										style={{ stroke: c.color }}
									/>
								</g>
							)}
						</For>
					</svg>
				</Show>

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
																) : (
																	<TableIcon size={20} />
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
																updateConfig(
																	"aiProviderId",
																	(e.target as HTMLSelectElement).value,
																);
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
														<input
															type="text"
															class="fp-field-input"
															value={panelConfig().aiModel}
															onInput={(e) =>
																updateConfig("aiModel", e.currentTarget.value)
															}
															placeholder="claude-sonnet-4-5-20250929"
														/>
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
		</div>
	);
}
