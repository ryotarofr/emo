import type { TimelineEntry } from "./types";

/**
 * Create a new timeline entry for a widget execution event.
 */
export function createTimelineEntry(
	widgetId: number,
	widgetTitle: string,
	status: "running" | "completed" | "failed",
	message: string,
): TimelineEntry {
	return {
		id: `tl-${widgetId}-${Date.now()}`,
		widgetId,
		widgetTitle,
		status,
		message,
		timestamp: Date.now(),
		durationMs: undefined,
	};
}
