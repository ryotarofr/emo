import { useNavigate } from "@solidjs/router";
import type { Accessor, ParentProps } from "solid-js";
import {
	createContext,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	Show,
} from "solid-js";
import {
	type NavItem,
	type PanelOption,
	Sidebar,
	type SidebarPosition,
} from "./components/Sidebar";
import { useAuth } from "./contexts/AuthContext";
import {
	ACCENT_PRESETS,
	applyWindowEffect,
	type ColorMode,
	DEFAULT_THEME,
	type GlassEffect,
	loadTheme,
	saveTheme,
	type ThemeSettings,
} from "./utils/theme";
import { loadWorkspace, saveWorkspace } from "./utils/workspace";
import "./App.css";

// NavItemsContext: allows child pages to look up nav items by id
export interface NavItemsContextValue {
	findItem: (id: string) => NavItem | undefined;
	getDocumentContent: (id: string) => string;
	setDocumentContent: (id: string, content: string) => void;
	saveNow: () => Promise<void>;
	dirty: Accessor<boolean>;
}
export const NavItemsContext = createContext<NavItemsContextValue>();

// ThemeContext
export interface ThemeContextValue {
	settings: Accessor<ThemeSettings>;
	setColorMode: (mode: ColorMode) => void;
	setGlassEffect: (effect: GlassEffect) => void;
	setBackgroundOpacity: (opacity: number) => void;
	setBlurStrength: (strength: number) => void;
	setAccentColor: (color: string) => void;
	resolvedDark: Accessor<boolean>;
}
export const ThemeContext = createContext<ThemeContextValue>();

// サンプルパネルオプション
const panelOptions: PanelOption[] = [
	{ label: "分析パネル", value: "ai-data" },
	{ label: "レポートパネル", value: "reports" },
];

// サンプルナビゲーションアイテム（フラット構造）
const initialNavItems: NavItem[] = [
	{ id: "1", name: "テキストボード", icon: "grid", order: 0 },
	{ id: "2", name: "タグ新規作成から更新", icon: "star", order: 1 },
	{
		id: "2-1",
		name: "自由なダッシュボード",
		icon: "grid",
		parentId: "2",
		order: 0,
	},
	{
		id: "2-2",
		name: "ほげ",
		icon: "grid",
		parentId: "2",
		order: 1,
	},
	{
		id: "3",
		name: "ほげほげ",
		icon: "tag",
		iconColor: "#9c27b0",
		order: 2,
	},
	{ id: "3-1", name: "ほげほげほげ", icon: "grid", parentId: "3", order: 0 },
	{
		id: "3-2",
		name: "ほげほげほげほげ",
		icon: "grid",
		parentId: "3",
		order: 1,
	},
];

function App(props: ParentProps) {
	const auth = useAuth();
	const navigate = useNavigate();

	// Auth guard: redirect to login if not authenticated
	createEffect(() => {
		if (!auth.loading() && !auth.user()) {
			navigate("/login");
		}
	});
	const [selectedPanel, setSelectedPanel] = createSignal("ai-data");
	const [selectedItem, setSelectedItem] = createSignal<NavItem | null>(null);
	const [navItems, setNavItems] = createSignal<NavItem[]>(initialNavItems);
	const [documents, setDocuments] = createSignal<Record<string, string>>({});
	const [dirty, setDirty] = createSignal(false);
	const [sidebarPosition, setSidebarPosition] =
		createSignal<SidebarPosition>("left");
	const [sidebarWidth, setSidebarWidth] = createSignal(280);
	const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);

	// --- Theme ---
	const [themeSettings, setThemeSettings] = createSignal<ThemeSettings>({
		...DEFAULT_THEME,
	});

	// テーマ起動時ロード
	let themeLoaded = false;
	let themeUserChanged = false;
	createEffect(() => {
		if (themeLoaded) return;
		themeLoaded = true;
		loadTheme().then((data) => {
			setThemeSettings(data);
			// ロード直後の setThemeSettings による effect 発火を無視するため、
			// 次のマイクロタスクでユーザー操作フラグを有効化
			queueMicrotask(() => {
				themeUserChanged = true;
			});
		});
	});

	// テーマ変更時デバウンス保存（ユーザー操作時のみ）
	let themeSaveTimer: ReturnType<typeof setTimeout> | undefined;
	createEffect(
		on(
			themeSettings,
			() => {
				if (!themeUserChanged) return;
				if (themeSaveTimer != null) clearTimeout(themeSaveTimer);
				themeSaveTimer = setTimeout(() => {
					saveTheme(themeSettings());
				}, 500);
			},
			{ defer: true },
		),
	);

	// システムダークモード検出
	const [systemDark, setSystemDark] = createSignal(
		window.matchMedia("(prefers-color-scheme: dark)").matches,
	);
	createEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
		mq.addEventListener("change", handler);
		onCleanup(() => mq.removeEventListener("change", handler));
	});

	const resolvedDark = createMemo(() => {
		const mode = themeSettings().colorMode;
		if (mode === "dark") return true;
		if (mode === "light") return false;
		return systemDark();
	});

	// ダークモード適用
	createEffect(() => {
		document.documentElement.classList.toggle("dark", resolvedDark());
	});

	// アクセントカラー適用
	createEffect(() => {
		const preset = ACCENT_PRESETS[themeSettings().accentColor];
		if (!preset) return;
		const dark = resolvedDark();
		const el = document.documentElement;
		el.style.setProperty(
			"--demo-coral-solid",
			dark ? preset.darkSolid : preset.solid,
		);
		el.style.setProperty(
			"--demo-coral-emphasized",
			dark ? preset.darkEmphasized : preset.emphasized,
		);
		el.style.setProperty(
			"--demo-coral-muted",
			dark ? preset.darkMuted : preset.muted,
		);
		el.style.setProperty(
			"--demo-coral-subtle",
			dark ? preset.darkSubtle : preset.subtle,
		);
		el.style.setProperty("--demo-coral-fg", dark ? preset.darkFg : preset.fg);
		el.style.setProperty(
			"--demo-coral-contrast",
			dark ? preset.darkContrast : preset.contrast,
		);
		el.style.setProperty(
			"--demo-coral-focus-ring",
			dark ? preset.darkFocusRing : preset.focusRing,
		);
	});

	// 背景透過度適用
	createEffect(() => {
		document.documentElement.style.setProperty(
			"--demo-bg-opacity",
			String(themeSettings().backgroundOpacity),
		);
	});

	// ぼかし強度適用 (0~100 → 0~20px)
	createEffect(() => {
		document.documentElement.style.setProperty(
			"--demo-blur-strength",
			`${themeSettings().blurStrength * 0.2}px`,
		);
	});

	// ネイティブウィンドウ効果適用 + 不透明度/ぼかしの自動調整
	createEffect(
		on(
			() => themeSettings().glassEffect,
			(effect, prevEffect) => {
				applyWindowEffect(effect);
				// ガラス効果ON時: 不透明度とぼかしを自動設定（デフォルト値のままなら）
				if (
					effect !== "none" &&
					(prevEffect === undefined || prevEffect === "none")
				) {
					setThemeSettings((prev) => ({
						...prev,
						...(prev.backgroundOpacity >= 1.0
							? { backgroundOpacity: 0.8 }
							: {}),
						...(prev.blurStrength <= 0 ? { blurStrength: 50 } : {}),
					}));
				}
				// ガラス効果OFF時: 不透明度とぼかしをデフォルトに戻す
				if (effect === "none" && prevEffect && prevEffect !== "none") {
					setThemeSettings((prev) => ({
						...prev,
						backgroundOpacity: 1.0,
						blurStrength: 0,
					}));
				}
			},
		),
	);

	const themeCtx: ThemeContextValue = {
		settings: themeSettings,
		setColorMode: (mode) =>
			setThemeSettings((prev) => ({ ...prev, colorMode: mode })),
		setGlassEffect: (effect) =>
			setThemeSettings((prev) => ({ ...prev, glassEffect: effect })),
		setBackgroundOpacity: (opacity) =>
			setThemeSettings((prev) => ({ ...prev, backgroundOpacity: opacity })),
		setBlurStrength: (strength) =>
			setThemeSettings((prev) => ({ ...prev, blurStrength: strength })),
		setAccentColor: (color) =>
			setThemeSettings((prev) => ({ ...prev, accentColor: color })),
		resolvedDark,
	};

	// 起動時ロード
	let loaded = false;
	createEffect(() => {
		if (loaded) return;
		loaded = true;
		loadWorkspace().then((data) => {
			if (data) {
				setNavItems(data.navItems);
				setDocuments(data.documents);
			}
		});
	});

	// デバウンス自動保存
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	const DEBOUNCE_MS = 1500;

	const scheduleSave = () => {
		setDirty(true);
		if (debounceTimer != null) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			doSave();
		}, DEBOUNCE_MS);
	};

	const doSave = async () => {
		if (debounceTimer != null) {
			clearTimeout(debounceTimer);
			debounceTimer = undefined;
		}
		await saveWorkspace({ navItems: navItems(), documents: documents() });
		setDirty(false);
	};

	// navItems 変更監視（初回スキップ）
	createEffect(
		on(
			navItems,
			() => {
				if (loaded) scheduleSave();
			},
			{ defer: true },
		),
	);

	// documents 変更監視（初回スキップ）
	createEffect(
		on(
			documents,
			() => {
				if (loaded) scheduleSave();
			},
			{ defer: true },
		),
	);

	onCleanup(() => {
		if (debounceTimer != null) clearTimeout(debounceTimer);
		if (themeSaveTimer != null) clearTimeout(themeSaveTimer);
	});

	const handleItemSelect = (item: NavItem) => {
		setSelectedItem(item);
		if (item.type === "folder") return;
		if (item.type === "file") {
			navigate(`/file/${item.id}`);
		} else if (item.type === "document") {
			navigate(`/document/${item.id}`);
		} else {
			navigate(`/dashboard/${item.id}`);
		}
	};

	const handleFileDrop = (newFileItems: NavItem[]) => {
		setNavItems((prev) => [...prev, ...newFileItems]);
		if (newFileItems.length === 1) {
			handleItemSelect(newFileItems[0]);
		}
	};

	const navItemsCtx: NavItemsContextValue = {
		findItem: (id: string) => navItems().find((item) => item.id === id),
		getDocumentContent: (id: string) => documents()[id] ?? "",
		setDocumentContent: (id: string, content: string) => {
			setDocuments((prev) => ({ ...prev, [id]: content }));
		},
		saveNow: doSave,
		dirty,
	};

	return (
		<Show when={!auth.loading() && auth.user()}>
			<ThemeContext.Provider value={themeCtx}>
				<NavItemsContext.Provider value={navItemsCtx}>
					<div
						class="app-layout"
						classList={{
							"sidebar-right": sidebarPosition() === "right",
						}}
					>
						<Sidebar
							panels={panelOptions}
							items={navItems()}
							selectedPanel={selectedPanel()}
							selectedItemId={selectedItem()?.id}
							position={sidebarPosition()}
							width={sidebarWidth()}
							collapsed={sidebarCollapsed()}
							onPanelChange={setSelectedPanel}
							onItemSelect={handleItemSelect}
							onItemsChange={setNavItems}
							onPositionChange={setSidebarPosition}
							onWidthChange={setSidebarWidth}
							onCollapsedChange={setSidebarCollapsed}
							onFileDrop={handleFileDrop}
						/>
						<main class="main-content">{props.children}</main>
					</div>
				</NavItemsContext.Provider>
			</ThemeContext.Provider>
		</Show>
	);
}

export default App;
