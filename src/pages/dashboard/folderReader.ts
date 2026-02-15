import { isTauri } from "@tauri-apps/api/core";
import { detectFileContentType } from "../../utils/fileTypes";
import { escapeHtml } from "./widgetContent";

export interface FolderEntry {
	name: string;
	path: string;
	isDir: boolean;
	children?: FolderEntry[];
}

export interface FolderReadOptions {
	maxDepth: number;
	excludePatterns: string[];
	maxFiles: number;
}

/** ファイル単体の読み込みサイズ上限（50KB） */
const MAX_FILE_SIZE = 50 * 1024;
/** 全ファイル合計の出力サイズ上限（80KB）— API入力上限(100KB)を超えないよう余裕を持たせる */
const MAX_TOTAL_CONTENT_SIZE = 80 * 1024;

export const DEFAULT_EXCLUDE_PATTERNS = [
	"node_modules",
	".git",
	".svn",
	"__pycache__",
	".DS_Store",
	"Thumbs.db",
	"dist",
	"build",
	"target",
];

/** OS対応のパス結合（@tauri-apps/api/path の join を使用） */
async function joinPath(base: string, name: string): Promise<string> {
	const { join } = await import("@tauri-apps/api/path");
	return join(base, name);
}

/**
 * Tauri dialog でフォルダ選択ダイアログを開く。
 * ブラウザでは null を返す。
 */
export async function openFolderPicker(): Promise<string | null> {
	if (!isTauri()) return null;
	const { open } = await import("@tauri-apps/plugin-dialog");
	const selected = await open({
		directory: true,
		multiple: false,
		recursive: true,
	});
	if (typeof selected === "string") return selected;
	return null;
}

/**
 * 再帰的にディレクトリを読み込み FolderEntry[] を返す。
 * depth=0（トップレベル）ではエラーを呼び出し元に伝播する。
 * depth>0（サブディレクトリ）では読み込み失敗時に空配列を返す。
 */
export async function readDirRecursive(
	path: string,
	opts: FolderReadOptions,
	depth = 0,
): Promise<FolderEntry[]> {
	if (!isTauri()) return [];
	if (depth >= opts.maxDepth) return [];

	const { readDir } = await import("@tauri-apps/plugin-fs");
	const rawEntries = await readDir(path);
	const entries: FolderEntry[] = [];
	let fileCount = 0;

	for (const entry of rawEntries) {
		if (fileCount >= opts.maxFiles) break;

		const name = entry.name;
		if (!name) continue;

		// 除外パターンチェック
		if (opts.excludePatterns.some((pat) => name === pat)) continue;

		const entryPath = await joinPath(path, name);
		const isDir = entry.isDirectory;

		if (isDir) {
			let children: FolderEntry[] = [];
			try {
				children = await readDirRecursive(entryPath, opts, depth + 1);
			} catch (err) {
				// サブディレクトリの読み込み失敗はスキップ（権限不足等）
				console.warn(
					`[folderReader] skipping unreadable dir "${entryPath}":`,
					err,
				);
			}
			entries.push({ name, path: entryPath, isDir: true, children });
			fileCount += children.length;
		} else {
			entries.push({ name, path: entryPath, isDir: false });
			fileCount++;
		}
	}

	// ディレクトリ優先、名前順でソート
	entries.sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	return entries;
}

/**
 * テキストファイルのみ readTextFile で内容を読み込み、パス＋内容の配列を返す。
 */
export async function readFolderContents(
	entries: FolderEntry[],
): Promise<{ path: string; content: string }[]> {
	if (!isTauri()) return [];

	const { readTextFile } = await import("@tauri-apps/plugin-fs");
	const results: { path: string; content: string }[] = [];

	const collectFiles = (items: FolderEntry[]): FolderEntry[] => {
		const files: FolderEntry[] = [];
		for (const item of items) {
			if (item.isDir && item.children) {
				files.push(...collectFiles(item.children));
			} else if (!item.isDir) {
				files.push(item);
			}
		}
		return files;
	};

	const allFiles = collectFiles(entries);
	let totalSize = 0;
	let skippedBySize = 0;

	console.log(
		`[folderReader] readFolderContents: ${allFiles.length} files collected`,
	);

	for (const file of allFiles) {
		if (totalSize >= MAX_TOTAL_CONTENT_SIZE) {
			console.log(
				`[folderReader] total size limit reached (${totalSize} bytes), stopping`,
			);
			break;
		}

		const contentType = detectFileContentType(file.path);
		if (contentType !== "text") {
			console.log(
				`[folderReader] skipping non-text file: "${file.path}" (type=${contentType})`,
			);
			continue;
		}

		try {
			let content = await readTextFile(file.path);
			if (content.length > MAX_FILE_SIZE) {
				console.log(
					`[folderReader] truncating large file: "${file.path}" (${content.length} bytes → ${MAX_FILE_SIZE})`,
				);
				content = `${content.slice(0, MAX_FILE_SIZE)}\n\n[... ${content.length - MAX_FILE_SIZE} bytes truncated ...]`;
				skippedBySize++;
			}
			totalSize += content.length;
			results.push({ path: file.path, content });
		} catch (err) {
			console.warn(
				`[folderReader] failed to read text file "${file.path}":`,
				err,
			);
		}
	}

	console.log(
		`[folderReader] readFolderContents: ${results.length}/${allFiles.length} files read (${totalSize} bytes, ${skippedBySize} truncated)`,
	);
	return results;
}

/**
 * FolderEntry[] から HTML <details>/<summary> ツリーを生成
 */
export function buildTreeHtml(entries: FolderEntry[]): string {
	const renderEntries = (items: FolderEntry[]): string => {
		let html = "";
		for (const item of items) {
			if (item.isDir) {
				const childrenHtml =
					item.children && item.children.length > 0
						? renderEntries(item.children)
						: '<span class="folder-empty">（空）</span>';
				html += `<details class="folder-tree-dir"><summary>${escapeHtml(item.name)}/</summary><div class="folder-tree-children">${childrenHtml}</div></details>`;
			} else {
				html += `<div class="folder-file">${escapeHtml(item.name)}</div>`;
			}
		}
		return html;
	};

	return `<div class="folder-tree">${renderEntries(entries)}</div>`;
}

/**
 * パイプライン用の出力テキストを生成（ファイル一覧 + 各ファイル内容）
 */
export function buildFolderOutput(
	folderPath: string,
	entries: FolderEntry[],
	contents: { path: string; content: string }[],
): string {
	const lines: string[] = [];
	lines.push(`=== フォルダ: ${folderPath} ===`);
	lines.push("");
	lines.push("--- ファイル一覧 ---");

	const renderTree = (items: FolderEntry[], indent = ""): void => {
		for (const item of items) {
			if (item.isDir) {
				lines.push(`${indent}${item.name}/`);
				if (item.children) {
					renderTree(item.children, `${indent}  `);
				}
			} else {
				lines.push(`${indent}${item.name}`);
			}
		}
	};

	renderTree(entries);

	if (contents.length > 0) {
		lines.push("");
		lines.push("--- ファイル内容 ---");
		for (const file of contents) {
			// フォルダパスからの相対パスを使用
			const relativePath = file.path.startsWith(folderPath)
				? file.path.slice(folderPath.length + 1)
				: file.path;
			lines.push(`### ${relativePath} ###`);
			lines.push(file.content);
			lines.push("");
		}
	}

	return lines.join("\n");
}

