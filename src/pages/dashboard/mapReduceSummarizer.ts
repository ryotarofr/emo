/**
 * Map-Reduce 要約エンジン
 * フォルダ出力を分割要約(Map)→統合(Reduce)し、トークン消費を削減する。
 * 差分キャッシュと連携して、未変更ファイルの再要約をスキップする。
 */

import { executeAgent } from "../../utils/agent";
import { updateStatusBadge } from "./domHelpers";
import {
	type SummaryCache,
	diffAgainstCache,
	hashContent,
	loadSummaryCache,
	saveSummaryCache,
} from "./summaryCache";

/** Map フェーズの1チャンク上限 (bytes) */
const MAP_CHUNK_SIZE = 10_000;

/** 並列実行数 (Gemini free tier 15 RPM 考慮) */
const MAX_CONCURRENCY = 3;

/** バッチ間の待機時間 (ms) */
const BATCH_DELAY_MS = 5_000;

/** 1回の Reduce で処理するファイル要約数の上限 */
const REDUCE_BATCH_SIZE = 30;

/** 429 レート制限時の最大リトライ回数 */
const MAX_RATE_LIMIT_RETRIES = 5;

/** Map プロンプトテンプレート */
const MAP_PROMPT = `以下のソースファイルを簡潔に要約してください。
ファイルパス、主要な型/関数/クラス、依存関係、重要なロジックを箇条書きで述べてください。
出力は500文字以内に収めてください。

--- ファイル: {filePath} ---
{content}
--- End ---`;

/** Reduce プロンプトテンプレート */
const REDUCE_PROMPT = `以下は複数のソースファイルの個別要約です。
これらを統合し、プロジェクト全体の概要として以下を含むレポートを作成してください:
- アーキテクチャの概要
- 主要モジュールと責務
- データフローと依存関係
- 技術スタックと設計パターン

{summaries}`;

export interface MapReduceResult {
	summary: string;
	stats: {
		totalFiles: number;
		cachedFiles: number;
		summarizedFiles: number;
		mapCallCount: number;
		reduceCallCount: number;
	};
}

export interface MapReduceOptions {
	agentId: string;
	dashboardId: string;
	sourceWidgetId: number;
	folderPath: string;
	signal: AbortSignal;
	gridRef: HTMLDivElement;
	files: { path: string; content: string }[];
}

interface FileChunk {
	relativePath: string;
	content: string;
	chunkIndex: number;
	totalChunks: number;
}

/**
 * 大きなファイルを行境界で MAP_CHUNK_SIZE 以下に分割する。
 * 小さなファイルはそのまま1チャンク。
 */
function chunkFileContent(
	content: string,
	relativePath: string,
): FileChunk[] {
	const encoder = new TextEncoder();
	const totalBytes = encoder.encode(content).length;

	if (totalBytes <= MAP_CHUNK_SIZE) {
		return [{ relativePath, content, chunkIndex: 0, totalChunks: 1 }];
	}

	const lines = content.split("\n");
	const chunks: FileChunk[] = [];
	let currentLines: string[] = [];
	let currentSize = 0;

	for (const line of lines) {
		const lineSize = encoder.encode(`${line}\n`).length;
		if (currentSize + lineSize > MAP_CHUNK_SIZE && currentLines.length > 0) {
			chunks.push({
				relativePath,
				content: currentLines.join("\n"),
				chunkIndex: chunks.length,
				totalChunks: 0, // 後で設定
			});
			currentLines = [];
			currentSize = 0;
		}
		currentLines.push(line);
		currentSize += lineSize;
	}

	if (currentLines.length > 0) {
		chunks.push({
			relativePath,
			content: currentLines.join("\n"),
			chunkIndex: chunks.length,
			totalChunks: 0,
		});
	}

	const total = chunks.length;
	for (const chunk of chunks) {
		chunk.totalChunks = total;
	}
	return chunks;
}

/**
 * 単一チャンクに対して要約AIを呼び出す。429 リトライ対応。
 */
async function summarizeChunk(
	agentId: string,
	chunk: FileChunk,
	signal: AbortSignal,
): Promise<string> {
	const label =
		chunk.totalChunks > 1
			? `${chunk.relativePath} (part ${chunk.chunkIndex + 1}/${chunk.totalChunks})`
			: chunk.relativePath;
	const prompt = MAP_PROMPT.replace("{filePath}", label).replace(
		"{content}",
		chunk.content,
	);

	let rateLimitRetries = 0;
	for (;;) {
		if (signal.aborted) throw new Error("Aborted");

		try {
			const execution = await executeAgent(agentId, prompt);
			if (execution.status === "completed") {
				return execution.output_text ?? "";
			}
			throw new Error(execution.error_message ?? "Map phase execution failed");
		} catch (err) {
			const errStr = String(err);
			if (
				errStr.includes("429") &&
				rateLimitRetries < MAX_RATE_LIMIT_RETRIES
			) {
				rateLimitRetries++;
				const waitSec = Math.min(15 * rateLimitRetries, 90);
				console.log(
					`[mapReduce] Rate limited on ${chunk.relativePath}, waiting ${waitSec}s...`,
				);
				await new Promise((r) => setTimeout(r, waitSec * 1000));
				continue;
			}
			throw err;
		}
	}
}

/**
 * Map フェーズ: 変更ファイルを並列で要約する。
 * MAX_CONCURRENCY 件ずつバッチ実行し、バッチ間に BATCH_DELAY_MS の間隔を置く。
 */
async function executeMapPhase(
	changedFiles: { relativePath: string; content: string }[],
	agentId: string,
	signal: AbortSignal,
	gridRef: HTMLDivElement,
	widgetId: number,
): Promise<Map<string, string>> {
	// 全ファイルをチャンクに展開
	const allChunks: FileChunk[] = [];
	for (const file of changedFiles) {
		allChunks.push(...chunkFileContent(file.content, file.relativePath));
	}

	const chunkSummaries = new Map<string, string[]>();
	let completed = 0;
	const total = allChunks.length;

	// バッチ処理
	for (let i = 0; i < allChunks.length; i += MAX_CONCURRENCY) {
		if (signal.aborted) throw new Error("Aborted");

		const batch = allChunks.slice(i, i + MAX_CONCURRENCY);
		updateStatusBadge(
			gridRef,
			widgetId,
			"running",
			`要約中 (${completed}/${total})...`,
		);

		const results = await Promise.allSettled(
			batch.map((chunk) => summarizeChunk(agentId, chunk, signal)),
		);

		for (let j = 0; j < results.length; j++) {
			const chunk = batch[j];
			const result = results[j];
			if (result.status === "fulfilled") {
				const existing = chunkSummaries.get(chunk.relativePath) ?? [];
				existing[chunk.chunkIndex] = result.value;
				chunkSummaries.set(chunk.relativePath, existing);
			} else {
				console.error(
					`[mapReduce] Failed to summarize ${chunk.relativePath}:`,
					result.reason,
				);
				// 失敗したチャンクは空文字として記録
				const existing = chunkSummaries.get(chunk.relativePath) ?? [];
				existing[chunk.chunkIndex] = "";
				chunkSummaries.set(chunk.relativePath, existing);
			}
			completed++;
		}

		// 最後のバッチ以外は待機
		if (i + MAX_CONCURRENCY < allChunks.length) {
			await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
		}
	}

	// 複数チャンクのファイルは要約を結合
	const fileSummaries = new Map<string, string>();
	for (const [path, chunks] of chunkSummaries) {
		fileSummaries.set(path, chunks.filter(Boolean).join("\n"));
	}

	return fileSummaries;
}

/**
 * Reduce フェーズ: ファイル要約を統合してプロジェクト概要を生成する。
 * 要約数が REDUCE_BATCH_SIZE を超える場合は階層的に reduce する。
 */
async function executeReducePhase(
	fileSummaries: Map<string, string>,
	agentId: string,
	signal: AbortSignal,
	gridRef: HTMLDivElement,
	widgetId: number,
): Promise<{ summary: string; callCount: number }> {
	updateStatusBadge(gridRef, widgetId, "running", "統合中...");

	// ファイル要約を文字列配列にフォーマット
	let sections: string[] = [];
	for (const [path, summary] of fileSummaries) {
		sections.push(`[${path}]\n${summary}`);
	}

	let callCount = 0;

	// 階層的 reduce: REDUCE_BATCH_SIZE を超える場合はバッチ分割
	while (sections.length > REDUCE_BATCH_SIZE) {
		const reducedBatches: string[] = [];
		for (let i = 0; i < sections.length; i += REDUCE_BATCH_SIZE) {
			if (signal.aborted) throw new Error("Aborted");

			const batch = sections.slice(i, i + REDUCE_BATCH_SIZE);
			const prompt = REDUCE_PROMPT.replace("{summaries}", batch.join("\n\n"));
			const execution = await executeAgent(agentId, prompt);
			callCount++;
			if (execution.status === "completed") {
				reducedBatches.push(execution.output_text ?? "");
			} else {
				throw new Error(
					execution.error_message ?? "Reduce phase execution failed",
				);
			}
		}
		sections = reducedBatches;
	}

	// 最終 reduce
	if (signal.aborted) throw new Error("Aborted");
	const finalPrompt = REDUCE_PROMPT.replace(
		"{summaries}",
		sections.join("\n\n"),
	);
	const execution = await executeAgent(agentId, finalPrompt);
	callCount++;

	if (execution.status !== "completed") {
		throw new Error(
			execution.error_message ?? "Final reduce execution failed",
		);
	}

	return { summary: execution.output_text ?? "", callCount };
}

/**
 * メインエントリポイント: フォルダ出力に対して Map-Reduce 要約を実行する。
 * 差分キャッシュにより、未変更ファイルの再要約をスキップする。
 */
export async function summarizeFolderOutput(
	opts: MapReduceOptions,
): Promise<MapReduceResult> {
	const {
		agentId,
		dashboardId,
		sourceWidgetId,
		folderPath,
		signal,
		gridRef,
		files,
	} = opts;

	// 1. キャッシュ読み込み & 差分検出
	const cache = loadSummaryCache(dashboardId, sourceWidgetId);
	const diff = await diffAgainstCache(cache, files, folderPath);

	console.log(
		`[mapReduce] Diff result: ${diff.changed.length} changed, ${diff.unchanged.length} cached, ${diff.removed.length} removed`,
	);

	// 全ファイルがキャッシュヒットし、reduced summary もある場合はそのまま返す
	if (
		diff.changed.length === 0 &&
		diff.removed.length === 0 &&
		cache?.reducedSummary
	) {
		console.log("[mapReduce] Full cache hit — returning cached summary");
		return {
			summary: cache.reducedSummary,
			stats: {
				totalFiles: files.length,
				cachedFiles: diff.unchanged.length,
				summarizedFiles: 0,
				mapCallCount: 0,
				reduceCallCount: 0,
			},
		};
	}

	// 2. Map フェーズ: 変更ファイルを要約
	let mapCallCount = 0;
	const newSummaries = new Map<string, string>();

	if (diff.changed.length > 0) {
		const mapResult = await executeMapPhase(
			diff.changed,
			agentId,
			signal,
			gridRef,
			sourceWidgetId,
		);
		mapCallCount = mapResult.size;
		for (const [path, summary] of mapResult) {
			newSummaries.set(path, summary);
		}
	}

	// キャッシュ済みの要約をマージ
	const allSummaries = new Map<string, string>();
	for (const item of diff.unchanged) {
		allSummaries.set(item.relativePath, item.summary);
	}
	for (const [path, summary] of newSummaries) {
		allSummaries.set(path, summary);
	}

	// 3. Reduce フェーズ: 全要約を統合
	const reduceResult = await executeReducePhase(
		allSummaries,
		agentId,
		signal,
		gridRef,
		sourceWidgetId,
	);

	// 4. キャッシュ更新
	const updatedFiles: Record<
		string,
		{ contentHash: string; summary: string; summarizedAt: number }
	> = {};
	const now = Date.now();

	// 既存のキャッシュエントリを維持 (未変更ファイル)
	for (const item of diff.unchanged) {
		const existing = cache?.files[item.relativePath];
		if (existing) {
			updatedFiles[item.relativePath] = existing;
		}
	}

	// 新しく要約したファイルを追加
	for (const file of diff.changed) {
		const hash = await hashContent(file.content);
		const summary = newSummaries.get(file.relativePath) ?? "";
		updatedFiles[file.relativePath] = {
			contentHash: hash,
			summary,
			summarizedAt: now,
		};
	}

	const updatedCache: SummaryCache = {
		version: 1,
		folderPath,
		files: updatedFiles,
		reducedSummary: reduceResult.summary,
		reducedAt: now,
	};
	saveSummaryCache(dashboardId, sourceWidgetId, updatedCache);

	return {
		summary: reduceResult.summary,
		stats: {
			totalFiles: files.length,
			cachedFiles: diff.unchanged.length,
			summarizedFiles: diff.changed.length,
			mapCallCount,
			reduceCallCount: reduceResult.callCount,
		},
	};
}
