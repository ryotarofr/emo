import { DRAFTS_STORAGE_KEY } from "./constants";
import type { PanelDraft } from "./types";

export function loadDrafts(): PanelDraft[] {
	try {
		const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

export function saveDrafts(drafts: PanelDraft[]) {
	localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

export function storageKey(id: string): string {
	return `dashboard-layout-${id}`;
}
