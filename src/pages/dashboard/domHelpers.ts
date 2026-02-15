import type { WidgetType } from "./types";

/** ステータスバッジのCSS状態名 */
export type BadgeStatus =
	| "running"
	| "completed"
	| "failed"
	| "awaiting"
	| "skipped";

/** ウィジェットのステータスバッジを更新する */
export function updateStatusBadge(
	gridRef: Element,
	widgetId: number | string,
	status: BadgeStatus,
	text: string,
): void {
	const badge = gridRef.querySelector(`[data-status-id="${widgetId}"]`);
	if (badge) {
		badge.className = `ai-status-badge ai-status-${status}`;
		badge.textContent = text;
	}
}

/** ウィジェットの出力エリアのテキストを設定する */
export function setOutputText(
	gridRef: Element,
	widgetId: number | string,
	text: string,
): void {
	const outEl = gridRef.querySelector(`[data-output-id="${widgetId}"]`);
	if (outEl) outEl.textContent = text;
}

/** data-widget-type属性からWidgetTypeを取得する */
export function getWidgetType(
	gridRef: Element,
	widgetId: number,
): WidgetType | "unknown" {
	const root = gridRef.querySelector(`[data-widget-id="${widgetId}"]`);
	return (root?.getAttribute("data-widget-type") as WidgetType) ?? "unknown";
}
