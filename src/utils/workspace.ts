import { isTauri } from "@tauri-apps/api/core";
import type { NavItem } from "../components/Sidebar";

export interface WorkspaceData {
	navItems: NavItem[];
	documents: Record<string, string>;
}

const STORAGE_KEY = "tebiki-workspace";
const WORKSPACE_FILE = "workspace.json";

export async function loadWorkspace(): Promise<WorkspaceData | null> {
	try {
		if (isTauri()) {
			const { appDataDir, join } = await import("@tauri-apps/api/path");
			const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
			const dir = await appDataDir();
			const filePath = await join(dir, WORKSPACE_FILE);
			if (!(await exists(filePath))) {
				return null;
			}
			const text = await readTextFile(filePath);
			return JSON.parse(text) as WorkspaceData;
		}
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as WorkspaceData;
	} catch (e) {
		console.error("Failed to load workspace:", e);
		return null;
	}
}

export async function saveWorkspace(data: WorkspaceData): Promise<void> {
	try {
		const json = JSON.stringify(data, null, 2);
		if (isTauri()) {
			const { appDataDir, join } = await import("@tauri-apps/api/path");
			const { writeTextFile, exists, mkdir } = await import(
				"@tauri-apps/plugin-fs"
			);
			const dir = await appDataDir();
			if (!(await exists(dir))) {
				await mkdir(dir, { recursive: true });
			}
			await writeTextFile(await join(dir, WORKSPACE_FILE), json);
		} else {
			localStorage.setItem(STORAGE_KEY, json);
		}
	} catch (e) {
		console.error("Failed to save workspace:", e);
	}
}
