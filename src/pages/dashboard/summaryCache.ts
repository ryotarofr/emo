/** 差分キャッシュ管理 — SHA-256ハッシュでファイル変更を検知し、localStorageに要約を永続化 */

export interface FileSummaryEntry {
	contentHash: string;
	summary: string;
	summarizedAt: number;
}

export interface SummaryCache {
	version: 1;
	folderPath: string;
	files: Record<string, FileSummaryEntry>;
	reducedSummary?: string;
	reducedAt?: number;
}

/** localStorage キー生成 */
function cacheKey(dashboardId: string, widgetId: number): string {
	return `summary-cache-${dashboardId}-${widgetId}`;
}

/** SHA-256 ハッシュ (hex) を計算 */
export async function hashContent(content: string): Promise<string> {
	const data = new TextEncoder().encode(content);
	const buf = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** キャッシュを読み込み (無効なら null) */
export function loadSummaryCache(
	dashboardId: string,
	widgetId: number,
): SummaryCache | null {
	try {
		const raw = localStorage.getItem(cacheKey(dashboardId, widgetId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as SummaryCache;
		if (parsed.version !== 1) return null;
		return parsed;
	} catch {
		return null;
	}
}

/** キャッシュを保存 */
export function saveSummaryCache(
	dashboardId: string,
	widgetId: number,
	cache: SummaryCache,
): void {
	try {
		localStorage.setItem(cacheKey(dashboardId, widgetId), JSON.stringify(cache));
	} catch (e) {
		console.warn("[summaryCache] Failed to save cache:", e);
	}
}

/** キャッシュを削除 */
export function clearSummaryCache(
	dashboardId: string,
	widgetId: number,
): void {
	localStorage.removeItem(cacheKey(dashboardId, widgetId));
}

/** ダッシュボード内の全要約キャッシュを削除 */
export function clearAllSummaryCaches(dashboardId: string): void {
	const prefix = `summary-cache-${dashboardId}-`;
	const keys: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith(prefix)) keys.push(key);
	}
	for (const key of keys) {
		localStorage.removeItem(key);
	}
}

/** キャッシュと現在のファイルを比較し、変更/未変更/削除を分類 */
export async function diffAgainstCache(
	cache: SummaryCache | null,
	files: { path: string; content: string }[],
	folderPath: string,
): Promise<{
	changed: { relativePath: string; content: string }[];
	unchanged: { relativePath: string; summary: string }[];
	removed: string[];
}> {
	const changed: { relativePath: string; content: string }[] = [];
	const unchanged: { relativePath: string; summary: string }[] = [];

	const currentPaths = new Set<string>();

	for (const file of files) {
		const relativePath = file.path.startsWith(folderPath)
			? file.path.slice(folderPath.length + 1)
			: file.path;
		currentPaths.add(relativePath);

		const hash = await hashContent(file.content);
		const cached = cache?.files[relativePath];

		if (cached && cached.contentHash === hash && cached.summary) {
			unchanged.push({ relativePath, summary: cached.summary });
		} else {
			changed.push({ relativePath, content: file.content });
		}
	}

	const removed: string[] = [];
	if (cache) {
		for (const path of Object.keys(cache.files)) {
			if (!currentPaths.has(path)) {
				removed.push(path);
			}
		}
	}

	return { changed, unchanged, removed };
}

/**
 * buildFolderOutput() の出力文字列をパースし、個別ファイルに分解する。
 * 区切り形式: "### {relativePath} ###"
 */
export function parseFolderOutput(
	folderOutput: string,
): { path: string; content: string }[] {
	const results: { path: string; content: string }[] = [];
	const marker = "--- ファイル内容 ---";
	const markerIdx = folderOutput.indexOf(marker);
	if (markerIdx === -1) return results;

	const contentSection = folderOutput.slice(markerIdx + marker.length);
	// 各ファイルヘッダ "### path ###" の位置を収集
	const headerRegex = /^### (.+?) ###$/gm;

	interface HeaderMatch {
		path: string;
		endOfHeader: number;
		startOfHeader: number;
	}
	const headers: HeaderMatch[] = [];

	for (
		let m = headerRegex.exec(contentSection);
		m !== null;
		m = headerRegex.exec(contentSection)
	) {
		headers.push({
			path: m[1],
			startOfHeader: m.index,
			endOfHeader: m.index + m[0].length,
		});
	}

	for (let i = 0; i < headers.length; i++) {
		const start = headers[i].endOfHeader;
		const end =
			i + 1 < headers.length
				? headers[i + 1].startOfHeader
				: contentSection.length;
		const content = contentSection.slice(start, end).trim();
		results.push({ path: headers[i].path, content });
	}

	return results;
}
