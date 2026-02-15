import { isTauri } from "@tauri-apps/api/core";
import type { DashboardTemplate, DashboardSnapshot } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TEMPLATES_STORAGE_KEY = "tebiki-templates";

// ---------------------------------------------------------------------------
// Template functions (localStorage-based)
// ---------------------------------------------------------------------------

/**
 * Save a template to localStorage.
 * If a template with the same `id` already exists it will be replaced.
 */
export function saveTemplate(template: DashboardTemplate): void {
	const templates = loadTemplates();
	const idx = templates.findIndex((t) => t.id === template.id);
	if (idx >= 0) {
		templates[idx] = template;
	} else {
		templates.push(template);
	}
	localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

/**
 * Load all saved templates from localStorage.
 * Returns an empty array when nothing has been saved yet or the stored value
 * is not valid JSON.
 */
export function loadTemplates(): DashboardTemplate[] {
	try {
		const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed as DashboardTemplate[];
	} catch {
		return [];
	}
}

/**
 * Delete a single template by its `id`.
 */
export function deleteTemplate(id: string): void {
	const templates = loadTemplates().filter((t) => t.id !== id);
	localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

// ---------------------------------------------------------------------------
// Snapshot functions
// ---------------------------------------------------------------------------

/**
 * Serialize a `DashboardSnapshot` to a JSON string.
 */
export function exportSnapshot(snapshot: DashboardSnapshot): string {
	return JSON.stringify(snapshot, null, 2);
}

/**
 * Parse a JSON string and validate that it conforms to the
 * `DashboardSnapshot` shape.  Returns `null` when the input is not valid
 * JSON or fails structural validation.
 */
export function importSnapshot(json: string): DashboardSnapshot | null {
	try {
		const parsed: unknown = JSON.parse(json);
		if (!isValidSnapshot(parsed)) return null;
		return parsed as DashboardSnapshot;
	} catch {
		return null;
	}
}

/**
 * Tauriネイティブの「名前を付けて保存」ダイアログでスナップショットを保存する。
 * 保存先のパスを返す。キャンセル時やブラウザ環境では null を返す。
 */
export async function downloadSnapshot(snapshot: DashboardSnapshot): Promise<string | null> {
	const json = exportSnapshot(snapshot);
	const safeName = snapshot.name.replace(/[^a-zA-Z0-9_-]/g, "-");
	const fileName = `${safeName}.json`;

	if (isTauri()) {
		const { save } = await import("@tauri-apps/plugin-dialog");
		const { writeTextFile } = await import("@tauri-apps/plugin-fs");
		const filePath = await save({
			defaultPath: fileName,
			filters: [{ name: "JSON", extensions: ["json"] }],
		});
		if (!filePath) return null;
		await writeTextFile(filePath, json);
		return filePath;
	}

	// ブラウザフォールバック
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
	return fileName;
}

/**
 * Encode a snapshot as a base64 URL hash fragment that can be shared.
 * The returned string is a full URL with `#snapshot=<base64>` appended.
 */
export function generateShareUrl(snapshot: DashboardSnapshot): string {
	const json = exportSnapshot(snapshot);
	const base64 = btoa(unescape(encodeURIComponent(json)));
	return `${window.location.origin}${window.location.pathname}#snapshot=${base64}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Minimal runtime check that `value` looks like a `DashboardSnapshot`.
 */
function isValidSnapshot(value: unknown): value is DashboardSnapshot {
	if (typeof value !== "object" || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj.version === "number" &&
		typeof obj.name === "string" &&
		typeof obj.dashboardId === "string" &&
		Array.isArray(obj.layout) &&
		Array.isArray(obj.edges) &&
		typeof obj.widgetCount === "number" &&
		typeof obj.exportedAt === "string"
	);
}
