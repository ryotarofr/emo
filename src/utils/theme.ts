import { isTauri } from "@tauri-apps/api/core";

export type ColorMode = "light" | "dark" | "system";
export type GlassEffect = "none" | "mica" | "acrylic" | "blur" | "tabbed";

export interface AccentColorPreset {
	name: string;
	solid: string;
	emphasized: string;
	muted: string;
	subtle: string;
	fg: string;
	contrast: string;
	focusRing: string;
	darkSolid: string;
	darkEmphasized: string;
	darkMuted: string;
	darkSubtle: string;
	darkFg: string;
	darkContrast: string;
	darkFocusRing: string;
}

export interface ThemeSettings {
	colorMode: ColorMode;
	glassEffect: GlassEffect;
	backgroundOpacity: number;
	blurStrength: number;
	accentColor: string;
}

export const ACCENT_PRESETS: Record<string, AccentColorPreset> = {
	coral: {
		name: "Coral",
		solid: "#eb5e41",
		emphasized: "#de5045",
		muted: "#ffdbda",
		subtle: "#ffe5e4",
		fg: "#c9453b",
		contrast: "white",
		focusRing: "#ffb2a8",
		darkSolid: "#eb5e41",
		darkEmphasized: "#ef6b4e",
		darkMuted: "#722b25",
		darkSubtle: "#55221e",
		darkFg: "#f47a5c",
		darkContrast: "white",
		darkFocusRing: "#e2503f",
	},
	blue: {
		name: "Blue",
		solid: "#3b82f6",
		emphasized: "#2563eb",
		muted: "#bfdbfe",
		subtle: "#dbeafe",
		fg: "#1d4ed8",
		contrast: "white",
		focusRing: "#93c5fd",
		darkSolid: "#3b82f6",
		darkEmphasized: "#60a5fa",
		darkMuted: "#1e3a5f",
		darkSubtle: "#172554",
		darkFg: "#60a5fa",
		darkContrast: "white",
		darkFocusRing: "#2563eb",
	},
	green: {
		name: "Green",
		solid: "#22c55e",
		emphasized: "#16a34a",
		muted: "#bbf7d0",
		subtle: "#dcfce7",
		fg: "#15803d",
		contrast: "white",
		focusRing: "#86efac",
		darkSolid: "#22c55e",
		darkEmphasized: "#4ade80",
		darkMuted: "#14532d",
		darkSubtle: "#052e16",
		darkFg: "#4ade80",
		darkContrast: "white",
		darkFocusRing: "#16a34a",
	},
	purple: {
		name: "Purple",
		solid: "#a855f7",
		emphasized: "#9333ea",
		muted: "#e9d5ff",
		subtle: "#f3e8ff",
		fg: "#7c3aed",
		contrast: "white",
		focusRing: "#c4b5fd",
		darkSolid: "#a855f7",
		darkEmphasized: "#c084fc",
		darkMuted: "#3b0764",
		darkSubtle: "#2e1065",
		darkFg: "#c084fc",
		darkContrast: "white",
		darkFocusRing: "#9333ea",
	},
	amber: {
		name: "Amber",
		solid: "#f59e0b",
		emphasized: "#d97706",
		muted: "#fde68a",
		subtle: "#fef3c7",
		fg: "#b45309",
		contrast: "white",
		focusRing: "#fcd34d",
		darkSolid: "#f59e0b",
		darkEmphasized: "#fbbf24",
		darkMuted: "#451a03",
		darkSubtle: "#78350f",
		darkFg: "#fbbf24",
		darkContrast: "white",
		darkFocusRing: "#d97706",
	},
};

export const DEFAULT_THEME: ThemeSettings = {
	colorMode: "system",
	glassEffect: "none",
	backgroundOpacity: 1.0,
	blurStrength: 0,
	accentColor: "coral",
};

const STORAGE_KEY = "tebiki-theme";

const THEME_FILE = "theme.json";

export async function loadTheme(): Promise<ThemeSettings> {
	try {
		if (isTauri()) {
			const { appDataDir, join } = await import("@tauri-apps/api/path");
			const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
			const dir = await appDataDir();
			const filePath = await join(dir, THEME_FILE);
			if (!(await exists(filePath))) {
				return { ...DEFAULT_THEME };
			}
			const text = await readTextFile(filePath);
			return { ...DEFAULT_THEME, ...JSON.parse(text) };
		}
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_THEME };
		return { ...DEFAULT_THEME, ...JSON.parse(raw) };
	} catch (e) {
		console.error("Failed to load theme:", e);
		return { ...DEFAULT_THEME };
	}
}

export async function saveTheme(data: ThemeSettings): Promise<void> {
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
			await writeTextFile(await join(dir, THEME_FILE), json);
		} else {
			localStorage.setItem(STORAGE_KEY, json);
		}
	} catch (e) {
		console.error("Failed to save theme:", e);
	}
}

export async function applyWindowEffect(
	glassEffect: GlassEffect,
): Promise<void> {
	if (!isTauri()) return;
	try {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		const win = getCurrentWindow();

		// 既存の効果を必ずクリアしてから新しい効果を適用する。
		// Windows では Tabbed 等の効果を setEffects だけで上書きできないため。
		await win.clearEffects();

		if (glassEffect === "none") {
			return;
		}

		const { Effect } = await import("@tauri-apps/api/window");
		const effectMap: Record<
			Exclude<GlassEffect, "none">,
			(typeof Effect)[keyof typeof Effect]
		> = {
			mica: Effect.Mica,
			acrylic: Effect.Acrylic,
			blur: Effect.Blur,
			tabbed: Effect.Tabbed,
		};

		await win.setEffects({ effects: [effectMap[glassEffect]] });
	} catch (e) {
		console.error("Failed to apply window effect:", e);
	}
}
