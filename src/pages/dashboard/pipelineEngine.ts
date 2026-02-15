import { executeAgent, orchestrateAgent } from "../../utils/agent";
import { TYPE_LABELS } from "./constants";
import { getWidgetType, setOutputText, updateStatusBadge } from "./domHelpers";
import type { PipelineEdge, WidgetType } from "./types";

/**
 * Kahnのアルゴリズムによるトポロジカルソート。
 * サイクルが検出された場合は null を返す。
 */
export function topologicalSort(
	edges: PipelineEdge[],
	widgetIds: number[],
): number[] | null {
	const inDegree = new Map<number, number>();
	const adj = new Map<number, number[]>();
	for (const id of widgetIds) {
		inDegree.set(id, 0);
		adj.set(id, []);
	}
	for (const edge of edges) {
		if (
			!inDegree.has(edge.sourceWidgetId) ||
			!inDegree.has(edge.targetWidgetId)
		)
			continue;
		adj.get(edge.sourceWidgetId)?.push(edge.targetWidgetId);
		inDegree.set(
			edge.targetWidgetId,
			(inDegree.get(edge.targetWidgetId) ?? 0) + 1,
		);
	}

	const queue: number[] = [];
	for (const [id, deg] of inDegree) {
		if (deg === 0) queue.push(id);
	}

	const sorted: number[] = [];
	while (queue.length > 0) {
		const node = queue.shift() as number;
		sorted.push(node);
		for (const next of adj.get(node) ?? []) {
			const newDeg = (inDegree.get(next) ?? 1) - 1;
			inDegree.set(next, newDeg);
			if (newDeg === 0) queue.push(next);
		}
	}

	return sorted.length === widgetIds.length ? sorted : null;
}

/** サイクルの有無を判定 */
export function hasCycle(edges: PipelineEdge[], widgetIds: number[]): boolean {
	return topologicalSort(edges, widgetIds) === null;
}

/**
 * 単一条件を評価する（複合条件の各パートを処理）。
 *
 * サポートする条件形式:
 * - "contains:キーワード"    — キーワード含有（大文字小文字区別なし）
 * - "not:キーワード"         — キーワード非含有
 * - "regex:パターン"         — 正規表現マッチ（大文字小文字区別なし）
 * - "startsWith:テキスト"    — 前方一致
 * - "endsWith:テキスト"      — 後方一致
 * - "equals:テキスト"        — 完全一致（trimされた出力と比較）
 * - "length>N" 等            — 出力長の数値比較
 * - その他                   — キーワード含有チェック（デフォルト）
 */
function evaluateSingleCondition(
	cond: string,
	sourceOutput: string,
): boolean {
	const trimmed = cond.trim();
	if (trimmed === "") return true;

	const lower = sourceOutput.toLowerCase();
	const condLower = trimmed.toLowerCase();

	// "contains:キーワード"
	if (condLower.startsWith("contains:")) {
		return lower.includes(condLower.slice(9).trim());
	}
	// "not:キーワード"
	if (condLower.startsWith("not:")) {
		return !lower.includes(condLower.slice(4).trim());
	}
	// "regex:パターン" — 正規表現マッチ
	if (trimmed.toLowerCase().startsWith("regex:")) {
		const pattern = trimmed.slice(6).trim();
		try {
			return new RegExp(pattern, "i").test(sourceOutput);
		} catch {
			// 不正な正規表現の場合はfalse
			return false;
		}
	}
	// "startsWith:テキスト"
	if (condLower.startsWith("startswith:")) {
		return lower.startsWith(condLower.slice(11).trim());
	}
	// "endsWith:テキスト"
	if (condLower.startsWith("endswith:")) {
		return lower.endsWith(condLower.slice(9).trim());
	}
	// "equals:テキスト"
	if (condLower.startsWith("equals:")) {
		return sourceOutput.trim().toLowerCase() === condLower.slice(7).trim();
	}
	// "length>N" 形式
	const lenMatch = condLower.match(/^length\s*([><=!]+)\s*(\d+)$/);
	if (lenMatch) {
		const op = lenMatch[1];
		const n = Number(lenMatch[2]);
		switch (op) {
			case ">": return sourceOutput.length > n;
			case "<": return sourceOutput.length < n;
			case ">=": return sourceOutput.length >= n;
			case "<=": return sourceOutput.length <= n;
			case "==": return sourceOutput.length === n;
			case "!=": return sourceOutput.length !== n;
			default: return true;
		}
	}
	// デフォルト: キーワード含有チェック
	return lower.includes(condLower);
}

/**
 * エッジ条件を評価: source出力が条件を満たすか判定。
 *
 * 複合条件のサポート:
 * - " AND " で区切ると全条件がtrueの場合のみtrue
 * - " OR "  で区切るといずれかの条件がtrueならtrue
 * - AND/ORの混在はサポートしない（ANDを優先）
 */
export function evaluateEdgeCondition(
	condition: string | undefined,
	sourceOutput: string,
): boolean {
	if (!condition || condition.trim() === "") return true;

	const trimmed = condition.trim();

	// OR 複合条件
	if (trimmed.includes(" OR ")) {
		const parts = trimmed.split(" OR ");
		return parts.some((part) => evaluateSingleCondition(part, sourceOutput));
	}

	// AND 複合条件
	if (trimmed.includes(" AND ")) {
		const parts = trimmed.split(" AND ");
		return parts.every((part) => evaluateSingleCondition(part, sourceOutput));
	}

	// 単一条件
	return evaluateSingleCondition(trimmed, sourceOutput);
}

/** targetパネルのupstream出力を収集（条件付きエッジをフィルタ） */
export function collectUpstreamOutputs(
	targetId: number,
	edges: PipelineEdge[],
	outputs: Record<number, string>,
): { widgetId: number; output: string }[] {
	const result: { widgetId: number; output: string }[] = [];
	for (const edge of edges) {
		if (edge.targetWidgetId === targetId) {
			const output = outputs[edge.sourceWidgetId];
			if (output !== undefined && output !== "") {
				// 条件付きエッジ: 条件不成立ならスキップ
				if (!evaluateEdgeCondition(edge.condition, output)) continue;
				result.push({ widgetId: edge.sourceWidgetId, output });
			}
		}
	}
	return result;
}

/** API入力の最大バイト数 */
const MAX_INPUT_BYTES = 95_000;

/** 元プロンプトにupstream出力を注入（API入力上限を超えないよう切り詰め） */
export function buildAugmentedPrompt(
	prompt: string,
	upstreamOutputs: { widgetId: number; output: string; label?: string }[],
): string {
	if (upstreamOutputs.length === 0) return prompt;

	// upstream出力を構築
	const sections = upstreamOutputs.map(
		(u) =>
			`--- Panel #${u.widgetId} (${u.label ?? "Widget"}) の出力 ---\n${u.output}\n--- End ---`,
	);
	let combined = `${sections.join("\n\n")}\n\n${prompt}`;

	// API入力上限を超える場合は upstream 出力を切り詰め
	const encoder = new TextEncoder();
	if (encoder.encode(combined).length > MAX_INPUT_BYTES) {
		const promptBytes = encoder.encode(prompt).length;
		const budget = MAX_INPUT_BYTES - promptBytes - 200; // ヘッダ余裕分

		if (budget <= 0) {
			// ユーザーのプロンプトだけで上限近い場合は upstream を省略
			return prompt;
		}

		// upstream出力を予算内で切り詰め
		const truncatedSections: string[] = [];
		let used = 0;
		for (const section of sections) {
			const sectionBytes = encoder.encode(section).length;
			if (used + sectionBytes <= budget) {
				truncatedSections.push(section);
				used += sectionBytes;
			} else {
				const remaining = budget - used;
				if (remaining > 200) {
					// 残り予算で部分的に含める
					const chars = Math.max(0, Math.floor(remaining * 0.9));
					truncatedSections.push(
						`${section.slice(0, chars)}\n\n[... 入力サイズ上限により省略 ...]`,
					);
				}
				break;
			}
		}

		combined = `${truncatedSections.join("\n\n")}\n\n${prompt}`;
	}

	return combined;
}

/** パネルタイプ別の出力取得 */
export function getPanelOutput(
	widgetId: number,
	gridRef: HTMLDivElement,
): string {
	const root = gridRef.querySelector(`[data-widget-id="${widgetId}"]`);
	if (!root) return "";
	const type = root.getAttribute("data-widget-type") ?? "";
	switch (type) {
		case "ai": {
			const outEl = gridRef.querySelector(`[data-output-id="${widgetId}"]`);
			return outEl?.textContent ?? "";
		}
		case "text": {
			const body = root.querySelector(".widget-body") as HTMLElement | null;
			return body?.innerText ?? "";
		}
		case "visual": {
			const subtype = root.getAttribute("data-widget-subtype");
			if (subtype === "diagram") {
				const outEl = gridRef.querySelector(`[data-output-id="${widgetId}"]`);
				return outEl?.textContent ?? root.getAttribute("data-diagram-code") ?? "";
			}
			const body = root.querySelector(".widget-body") as HTMLElement | null;
			return body?.innerText ?? "";
		}
		case "object":
			return "";
		case "folder": {
			const outEl = gridRef.querySelector(`[data-output-id="${widgetId}"]`);
			return outEl?.textContent ?? "";
		}
		default:
			return "";
	}
}


export interface PipelineCallbacks {
	onStepStart: (widgetId: number) => void;
	onStepComplete: (widgetId: number, output: string) => void;
	onStepFail: (widgetId: number, error: string) => void;
	onPipelineComplete: () => void;
	onPipelineFail: (error: string) => void;
}

/**
 * DAG全体を順序実行する。
 * 非AIパネルはコンテンツをoutputsにキャッシュ。
 * AIパネルはexecuteAgent/orchestrateAgentを呼出。
 */
export async function executePipeline(
	edges: PipelineEdge[],
	gridRef: HTMLDivElement,
	callbacks: PipelineCallbacks,
	signal: AbortSignal,
): Promise<void> {
	// グリッド上の全ウィジェットIDを収集
	const widgetIds: number[] = [];
	const widgetRoots = gridRef.querySelectorAll("[data-widget-id]");
	for (const root of widgetRoots) {
		const id = Number(root.getAttribute("data-widget-id"));
		if (!Number.isNaN(id) && id > 0) widgetIds.push(id);
	}

	// エッジに関与するウィジェットのみフィルタ
	const involvedIds = new Set<number>();
	for (const edge of edges) {
		involvedIds.add(edge.sourceWidgetId);
		involvedIds.add(edge.targetWidgetId);
	}
	const pipelineIds = widgetIds.filter((id) => involvedIds.has(id));

	const sorted = topologicalSort(edges, pipelineIds);
	if (!sorted) {
		callbacks.onPipelineFail(
			"サイクルが検出されました。パイプラインを実行できません。",
		);
		return;
	}

	const outputs: Record<number, string> = {};

	for (const widgetId of sorted) {
		if (signal.aborted) {
			callbacks.onPipelineFail("パイプラインが停止されました。");
			return;
		}

		callbacks.onStepStart(widgetId);

		if (getWidgetType(gridRef, widgetId) !== "ai") {
			// 非AIパネル: コンテンツをキャッシュ
			const output = getPanelOutput(widgetId, gridRef);
			outputs[widgetId] = output;
			callbacks.onStepComplete(widgetId, output);
			continue;
		}

		// AIパネル: upstream出力を注入して実行
		const aiRoot = gridRef.querySelector(
			`[data-widget-id="${widgetId}"][data-widget-type="ai"]`,
		);
		const prompt = aiRoot?.getAttribute("data-ai-prompt") ?? "";
		const agentId = aiRoot?.getAttribute("data-ai-agent-id") ?? "";
		const orchMode =
			aiRoot?.getAttribute("data-ai-orchestration-mode") ?? "none";

		if (!agentId) {
			callbacks.onStepFail(widgetId, "エージェント未設定");
			callbacks.onPipelineFail(
				`Panel #${widgetId}: エージェントが設定されていません。`,
			);
			return;
		}

		// 条件分岐チェック: すべてのupstreamエッジ条件を満たさない場合スキップ
		const incomingEdges = edges.filter((e) => e.targetWidgetId === widgetId);
		const hasConditionalInput = incomingEdges.some((e) => e.condition);
		if (hasConditionalInput) {
			const anyPassing = incomingEdges.some((e) => {
				const srcOutput = outputs[e.sourceWidgetId] ?? "";
				return evaluateEdgeCondition(e.condition, srcOutput);
			});
			if (!anyPassing) {
				// 条件不成立: スキップ
				outputs[widgetId] = "";
				callbacks.onStepComplete(widgetId, "");
				updateStatusBadge(gridRef, widgetId, "skipped", "スキップ");
				continue;
			}
		}

		const upstream = collectUpstreamOutputs(widgetId, edges, outputs).map(
			(u) => ({
				...u,
				label: TYPE_LABELS[getWidgetType(gridRef, u.widgetId) as WidgetType] ?? "Widget",
			}),
		);
		const augmentedPrompt = buildAugmentedPrompt(prompt, upstream);

		// リトライ設定を収集
		const maxRetries = Math.max(
			0,
			...incomingEdges.map((e) => e.maxRetries ?? 0),
		);
		const retryDelay = Math.max(
			1000,
			...incomingEdges.map((e) => e.retryDelayMs ?? 1000),
		);

		let lastError = "";
		let succeeded = false;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (signal.aborted) {
				callbacks.onPipelineFail("パイプラインが停止されました。");
				return;
			}

			if (attempt > 0) {
				updateStatusBadge(gridRef, widgetId, "running", `リトライ ${attempt}/${maxRetries}...`);
				await new Promise((r) => setTimeout(r, retryDelay));
			}

			try {
				let output: string;
				if (orchMode !== "none") {
					const run = await orchestrateAgent(agentId, augmentedPrompt, orchMode);
					output = `[orchestration:${run.id}]`;
				} else {
					const execution = await executeAgent(agentId, augmentedPrompt);
					if (execution.status === "completed") {
						output = execution.output_text ?? "";
					} else {
						throw new Error(execution.error_message ?? "実行失敗");
					}
				}

				outputs[widgetId] = output;
				callbacks.onStepComplete(widgetId, output);

				setOutputText(gridRef, widgetId, output);
				updateStatusBadge(gridRef, widgetId, "completed", "完了");
				succeeded = true;
				break;
			} catch (err) {
				lastError = String(err);
			}
		}

		if (!succeeded) {
			callbacks.onStepFail(widgetId, lastError);
			callbacks.onPipelineFail(`Panel #${widgetId}: ${lastError}`);
			updateStatusBadge(gridRef, widgetId, "failed", "失敗");
			setOutputText(gridRef, widgetId, lastError);
			return;
		}
	}

	callbacks.onPipelineComplete();
}
