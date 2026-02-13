import { Dialog } from "@ark-ui/solid/dialog";
import { Field } from "@ark-ui/solid/field";
import { RadioGroup } from "@ark-ui/solid/radio-group";
import { createListCollection, Select } from "@ark-ui/solid/select";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
	createDroppable,
	createSortable,
	DragDropProvider,
	DragDropSensors,
	type DragEvent,
	DragOverlay,
	SortableProvider,
} from "@thisbeyond/solid-dnd";
import {
	ChevronDownIcon,
	ChevronRightIcon,
	ChevronsLeftIcon,
	ChevronsRightIcon,
	FilePlusIcon,
	FileTextIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderPlusIcon,
	GripVerticalIcon,
	ImageIcon,
	LayoutGridIcon,
	SearchIcon,
	SettingsIcon,
	StarIcon,
	TagIcon,
	TriangleAlertIcon,
	UserIcon,
	XIcon,
} from "lucide-solid";
import type { Accessor, JSX } from "solid-js";
import {
	batch,
	createContext,
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	Show,
	useContext,
} from "solid-js";
import { Portal } from "solid-js/web";
import { ThemeContext } from "../../App";
import {
	detectFileContentType,
	getFileMimeType,
	getFileName,
	getIconForFile,
} from "../../utils/fileTypes";
import { ACCENT_PRESETS, type GlassEffect } from "../../utils/theme";
import styles from "./index.module.css";

// ファイルコンテンツタイプ
export type FileContentType = "image" | "text";

// アイコンタイプの定義
type IconType =
	| "grid"
	| "star"
	| "tag"
	| "alert"
	| "user"
	| "file"
	| "image"
	| "folder";

// ドロップ位置の型
type DropPosition = "before" | "after" | "inside" | null;

// サイドバー位置の型
export type SidebarPosition = "left" | "right";

// フラット構造のナビゲーションアイテム型定義
export interface NavItem {
	id: string;
	name: string;
	icon: IconType;
	iconColor?: string;
	parentId?: string | null;
	order?: number;
	type?: "dashboard" | "file" | "document" | "folder";
	filePath?: string;
	fileUrl?: string;
	fileContentType?: FileContentType;
	fileMimeType?: string;
}

// 階層構造用の内部型
interface TreeNode extends NavItem {
	children: TreeNode[];
	depth: number;
}

// 作成中アイテムの状態
interface CreatingItem {
	parentId: string | null;
	kind: "dashboard" | "document" | "folder";
	afterItemId?: string | null;
}

// 編集中アイテムの状態
interface EditingItem {
	id: string;
}

// コンテキストメニューの状態
interface ContextMenuState {
	x: number;
	y: number;
	targetItemId: string | null;
}

// パネルオプションの型定義
export interface PanelOption {
	label: string;
	value: string;
}

// サイドバーの幅設定（単位: px）
const DEFAULT_WIDTH = 280; // デフォルト幅
const MIN_WIDTH = 200; // 最小幅
const MAX_WIDTH = 500; // 最大幅
const COLLAPSED_WIDTH = 48; // 折り畳み時の幅

// Sidebarのプロパティ
export interface SidebarProps {
	panels: PanelOption[];
	items: NavItem[];
	selectedPanel?: string;
	selectedItemId?: string;
	position?: SidebarPosition;
	width?: number;
	minWidth?: number;
	maxWidth?: number;
	collapsed?: boolean;
	onPanelChange?: (value: string) => void;
	onItemSelect?: (item: NavItem) => void;
	onItemsChange?: (items: NavItem[]) => void;
	onPositionChange?: (position: SidebarPosition) => void;
	onWidthChange?: (width: number) => void;
	onCollapsedChange?: (collapsed: boolean) => void;
	searchPlaceholder?: string;
	onFileDrop?: (items: NavItem[]) => void;
}

// ドラッグコンテキスト
interface DragContextValue {
	activeId: Accessor<string | null>;
	overId: Accessor<string | null>;
	dropPosition: Accessor<DropPosition>;
}

const DragContext = createContext<DragContextValue>();

// アイコンコンポーネント
const NavIcon = (props: {
	type: IconType;
	color?: string;
	expanded?: boolean;
}) => {
	const iconStyle = (): JSX.CSSProperties => ({
		color: props.color || "currentColor",
	});

	switch (props.type) {
		case "grid":
			return <LayoutGridIcon style={iconStyle()} />;
		case "star":
			return <StarIcon style={iconStyle()} />;
		case "tag":
			return <TagIcon style={iconStyle()} />;
		case "alert":
			return <TriangleAlertIcon style={iconStyle()} />;
		case "user":
			return <UserIcon style={iconStyle()} />;
		case "file":
			return <FileTextIcon style={iconStyle()} />;
		case "image":
			return <ImageIcon style={iconStyle()} />;
		case "folder":
			return props.expanded ? (
				<FolderOpenIcon style={iconStyle()} />
			) : (
				<FolderIcon style={iconStyle()} />
			);
		default:
			return <LayoutGridIcon style={iconStyle()} />;
	}
};

// フラットなアイテムから階層構造を構築
const buildTree = (items: NavItem[]): TreeNode[] => {
	const itemMap = new Map<string, TreeNode>();
	const roots: TreeNode[] = [];

	// 全アイテムをマップに登録
	for (const item of items) {
		itemMap.set(item.id, { ...item, children: [], depth: 0 });
	}

	// 親子関係を構築
	for (const item of items) {
		const node = itemMap.get(item.id);
		if (!node) continue;
		if (item.parentId && itemMap.has(item.parentId)) {
			const parent = itemMap.get(item.parentId);
			if (parent) {
				node.depth = parent.depth + 1;
				parent.children.push(node);
			}
		} else {
			roots.push(node);
		}
	}

	// orderでソート
	const sortByOrder = (nodes: TreeNode[]): TreeNode[] => {
		return nodes
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map((node) => ({
				...node,
				children: sortByOrder(node.children),
			}));
	};

	return sortByOrder(roots);
};

// 階層構造をフラット化（表示順）
const flattenTree = (nodes: TreeNode[]): TreeNode[] => {
	const result: TreeNode[] = [];
	const traverse = (items: TreeNode[]) => {
		for (const item of items) {
			result.push(item);
			if (item.children.length > 0) {
				traverse(item.children);
			}
		}
	};
	traverse(nodes);
	return result;
};

// インライン入力コンポーネント
interface InlineInputProps {
	depth: number;
	kind: "dashboard" | "document" | "folder" | "rename";
	initialValue?: string;
	onConfirm: (name: string) => void;
	onCancel: () => void;
}

const InlineInput = (props: InlineInputProps) => {
	let inputRef: HTMLInputElement | undefined;
	let confirmed = false;

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const value = inputRef?.value.trim() ?? "";
			if (value) {
				confirmed = true;
				props.onConfirm(value);
			} else {
				props.onCancel();
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			props.onCancel();
		}
	};

	const handleBlur = () => {
		if (!confirmed) {
			props.onCancel();
		}
	};

	return (
		<li class={styles.NavItem}>
			<div class={styles.InlineInputRow} style={{ "--depth": props.depth }}>
				<span class={styles.NavItemIcon}>
					<NavIcon
						type={
							props.kind === "folder"
								? "folder"
								: props.kind === "document"
									? "file"
									: "grid"
						}
					/>
				</span>
				<input
					ref={(el) => {
						inputRef = el;
						queueMicrotask(() => {
							el.focus();
							el.select();
						});
					}}
					class={styles.InlineInput}
					type="text"
					value={props.initialValue ?? ""}
					onKeyDown={handleKeyDown}
					onBlur={handleBlur}
				/>
			</div>
		</li>
	);
};

// コンテキストメニューコンポーネント
interface ContextMenuProps {
	x: number;
	y: number;
	targetItemId: string | null;
	onNewDashboard: () => void;
	onNewDocument: () => void;
	onNewFolder: () => void;
	onRename: () => void;
	onDelete: () => void;
	onClose: () => void;
}

const ContextMenu = (props: ContextMenuProps) => {
	const handleClick = (action: () => void) => {
		action();
		props.onClose();
	};

	// 外側クリックで閉じる
	const handleOutsideClick = (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		if (!target.closest(`.${styles.ContextMenu}`)) {
			props.onClose();
		}
	};

	// 他の右クリックで閉じる
	const handleContextMenu = () => {
		props.onClose();
	};

	createEffect(() => {
		document.addEventListener("click", handleOutsideClick);
		document.addEventListener("contextmenu", handleContextMenu);
		onCleanup(() => {
			document.removeEventListener("click", handleOutsideClick);
			document.removeEventListener("contextmenu", handleContextMenu);
		});
	});

	return (
		<Portal>
			<div
				class={styles.ContextMenu}
				style={{ left: `${props.x}px`, top: `${props.y}px` }}
			>
				<button
					type="button"
					class={styles.ContextMenuItem}
					onClick={() => handleClick(props.onNewDashboard)}
				>
					<LayoutGridIcon />
					<span>新規ダッシュボード</span>
				</button>
				<button
					type="button"
					class={styles.ContextMenuItem}
					onClick={() => handleClick(props.onNewDocument)}
				>
					<FileTextIcon />
					<span>新規ドキュメント</span>
				</button>
				<button
					type="button"
					class={styles.ContextMenuItem}
					onClick={() => handleClick(props.onNewFolder)}
				>
					<FolderPlusIcon />
					<span>新規フォルダ</span>
				</button>
				<Show when={props.targetItemId !== null}>
					<div class={styles.ContextMenuSeparator} />
					<button
						type="button"
						class={styles.ContextMenuItem}
						onClick={() => handleClick(props.onRename)}
					>
						<span>名前変更</span>
					</button>
					<button
						type="button"
						class={styles.ContextMenuItemDanger}
						onClick={() => handleClick(props.onDelete)}
					>
						<span>削除</span>
					</button>
				</Show>
			</div>
		</Portal>
	);
};

// 自動展開の遅延時間（ミリ秒）
const AUTO_EXPAND_DELAY = 500;

export const Sidebar = (props: SidebarProps) => {
	const [searchQuery, setSearchQuery] = createSignal("");
	const [expandedItems, setExpandedItems] = createSignal<string[]>([]);
	const [selectedItem, setSelectedItem] = createSignal<string>(
		props.selectedItemId || "",
	);
	const [activeId, setActiveId] = createSignal<string | null>(null);
	const [overId, setOverId] = createSignal<string | null>(null);
	const [dropPosition, setDropPosition] = createSignal<DropPosition>(null);
	const [creatingItem, setCreatingItem] = createSignal<CreatingItem | null>(
		null,
	);
	const [editingItem, setEditingItem] = createSignal<EditingItem | null>(null);
	const [contextMenu, setContextMenu] = createSignal<ContextMenuState | null>(
		null,
	);

	// 自動展開用のタイマー
	let expandTimerRef: ReturnType<typeof setTimeout> | null = null;

	// props.selectedItemId の変更を監視して同期
	createEffect(() => {
		const newSelectedId = props.selectedItemId;
		if (newSelectedId !== undefined && newSelectedId !== selectedItem()) {
			setSelectedItem(newSelectedId);
		}
	});

	// マウス位置を追跡し、ドロップ位置を更新
	const handleMouseMove = (e: MouseEvent) => {
		const currentOverId = overId();
		if (!currentOverId) return;

		const droppableElement = document.querySelector(
			`[data-item-id="${currentOverId}"]`,
		);
		if (!droppableElement) return;

		const rect = droppableElement.getBoundingClientRect();
		const relativeY = e.clientY - rect.top;
		const threshold = rect.height / 3;

		// 子を持つアイテムの場合のみ'inside'を許可
		const itemHasChildren = hasChildren(currentOverId);

		let newPosition: DropPosition;
		if (relativeY < threshold) {
			newPosition = "before";
		} else if (relativeY > rect.height - threshold) {
			newPosition = "after";
		} else if (itemHasChildren) {
			newPosition = "inside";
		} else {
			newPosition = "after";
		}

		// 位置が変わった場合のみ更新
		if (dropPosition() !== newPosition) {
			setDropPosition(newPosition);
		}
	};

	// マウスイベントリスナーを設定
	createEffect(() => {
		if (activeId()) {
			document.addEventListener("mousemove", handleMouseMove);
		} else {
			document.removeEventListener("mousemove", handleMouseMove);
		}
	});

	// 自動展開: createEffectでリアクティブに監視
	createEffect(() => {
		const currentOverId = overId();
		const currentDropPosition = dropPosition();
		const currentActiveId = activeId();

		// タイマーをクリア
		if (expandTimerRef) {
			clearTimeout(expandTimerRef);
			expandTimerRef = null;
		}

		// ドラッグ中でない、またはホバーしていない場合は何もしない
		if (!currentActiveId || !currentOverId) return;

		// 子を持つ閉じたアイテムの中央部分にホバーしている場合
		const itemHasChildren = hasChildren(currentOverId);
		const isCollapsed = !expandedItems().includes(currentOverId);
		const isHoveringInside = currentDropPosition === "inside";

		if (itemHasChildren && isCollapsed && isHoveringInside) {
			expandTimerRef = setTimeout(() => {
				// タイマー発火時にまだ同じ条件を満たしているか確認
				if (
					overId() === currentOverId &&
					dropPosition() === "inside" &&
					activeId()
				) {
					setExpandedItems((prev) => [...prev, currentOverId]);
				}
			}, AUTO_EXPAND_DELAY);
		}
	});

	// クリーンアップ
	onCleanup(() => {
		document.removeEventListener("mousemove", handleMouseMove);
		if (expandTimerRef) {
			clearTimeout(expandTimerRef);
			expandTimerRef = null;
		}
		// リサイズ中にコンポーネントがアンマウントされた場合のクリーンアップ
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
	});

	// OS ファイルドラッグ＆ドロップ（Tauriウィンドウイベント）
	const [isOsFileDragOver, setIsOsFileDragOver] = createSignal(false);

	createEffect(() => {
		if (!isTauri()) return;
		let unlisten: (() => void) | null = null;
		getCurrentWindow()
			.onDragDropEvent((event) => {
				if (event.payload.type === "over") {
					setIsOsFileDragOver(true);
				} else if (event.payload.type === "drop") {
					setIsOsFileDragOver(false);
					const paths: string[] = event.payload.paths;
					const newItems: NavItem[] = [];
					for (const filePath of paths) {
						const contentType = detectFileContentType(filePath);
						if (!contentType) continue;
						const name = getFileName(filePath);
						const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
						newItems.push({
							id,
							name,
							icon: getIconForFile(filePath),
							type: "file",
							filePath,
							fileContentType: contentType,
							fileMimeType: getFileMimeType(filePath),
							order:
								props.items.filter((i) => !i.parentId).length + newItems.length,
						});
					}
					if (newItems.length > 0) {
						props.onFileDrop?.(newItems);
					}
				} else {
					// cancel
					setIsOsFileDragOver(false);
				}
			})
			.then((fn) => {
				unlisten = fn;
			});

		onCleanup(() => {
			unlisten?.();
		});
	});

	// パネルコレクション
	const panelCollection = createMemo(() =>
		createListCollection({
			items: props.panels,
			itemToValue: (item) => item.value,
			itemToString: (item) => item.label,
		}),
	);

	// 階層構造を構築
	const tree = createMemo(() => buildTree(props.items));

	// フラット化されたアイテム（表示用）
	const flatItems = createMemo(() => {
		const allFlat = flattenTree(tree());
		const query = searchQuery().toLowerCase();

		if (!query) {
			// 展開されていないアイテムの子は表示しない
			return allFlat.filter((item) => {
				if (!item.parentId) return true;
				// 全ての祖先が展開されているか確認
				let currentParentId: string | null | undefined = item.parentId;
				while (currentParentId) {
					if (!expandedItems().includes(currentParentId)) return false;
					const parent = allFlat.find((i) => i.id === currentParentId);
					currentParentId = parent?.parentId;
				}
				return true;
			});
		}

		// 検索時はマッチしたアイテムとその祖先を表示
		const matchedIds = new Set<string>();
		for (const item of allFlat) {
			if (item.name.toLowerCase().includes(query)) {
				matchedIds.add(item.id);
				// 祖先も追加
				let currentParentId: string | null | undefined = item.parentId;
				while (currentParentId) {
					matchedIds.add(currentParentId);
					const parent = allFlat.find((i) => i.id === currentParentId);
					currentParentId = parent?.parentId;
				}
			}
		}

		return allFlat.filter((item) => matchedIds.has(item.id));
	});

	// フォルダかどうかを判定
	const isFolder = (id: string) =>
		props.items.find((i) => i.id === id)?.type === "folder";

	// 子を持つかどうかを判定（フォルダは常にtrue）
	const hasChildren = (id: string) => {
		return isFolder(id) || props.items.some((item) => item.parentId === id);
	};

	// 展開/折りたたみのトグル
	const toggleExpanded = (id: string) => {
		setExpandedItems((prev) =>
			prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
		);
	};

	// アイテム選択ハンドラ
	const handleItemSelect = (item: NavItem) => {
		setSelectedItem(item.id);
		props.onItemSelect?.(item);
	};

	// 作成位置の決定
	const getCreationPosition = (
		kind: "dashboard" | "document" | "folder",
	): CreatingItem => {
		const selId = selectedItem();
		if (selId) {
			const selItem = props.items.find((i) => i.id === selId);
			if (selItem) {
				if (selItem.type === "folder") {
					// フォルダの子として挿入、自動展開
					if (!expandedItems().includes(selId)) {
						setExpandedItems((prev) => [...prev, selId]);
					}
					return { parentId: selId, kind, afterItemId: null };
				}
				// ファイル/ダッシュボードの兄弟として挿入
				return { parentId: selItem.parentId ?? null, kind, afterItemId: selId };
			}
		}
		// 未選択時はルート末尾
		return { parentId: null, kind, afterItemId: null };
	};

	// 作成確定ハンドラ
	const handleCreateConfirm = (name: string) => {
		const creating = creatingItem();
		if (!creating) return;

		const newId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const siblings = props.items.filter(
			(i) => (i.parentId ?? null) === creating.parentId,
		);

		let newOrder: number;
		if (creating.afterItemId) {
			const afterItem = siblings.find((i) => i.id === creating.afterItemId);
			newOrder = (afterItem?.order ?? 0) + 1;
		} else if (siblings.length > 0) {
			newOrder = creating.parentId
				? 0 // 親の最初の子
				: Math.max(...siblings.map((i) => i.order ?? 0)) + 1; // ルート末尾
		} else {
			newOrder = 0;
		}

		// 兄弟のorderを再計算して隙間を作る
		const updatedItems = props.items.map((item) => {
			if (
				(item.parentId ?? null) === creating.parentId &&
				(item.order ?? 0) >= newOrder
			) {
				return { ...item, order: (item.order ?? 0) + 1 };
			}
			return item;
		});

		const iconMap = {
			folder: "folder",
			dashboard: "grid",
			document: "file",
		} as const;
		const typeMap = {
			folder: "folder",
			dashboard: "dashboard",
			document: "document",
		} as const;

		const newItem: NavItem = {
			id: newId,
			name,
			icon: iconMap[creating.kind],
			type: typeMap[creating.kind],
			parentId: creating.parentId ?? undefined,
			order: newOrder,
		};

		props.onItemsChange?.([...updatedItems, newItem]);
		setSelectedItem(newId);
		setCreatingItem(null);
	};

	// リネーム確定ハンドラ
	const handleRenameConfirm = (itemId: string, newName: string) => {
		const updatedItems = props.items.map((item) =>
			item.id === itemId ? { ...item, name: newName } : item,
		);
		props.onItemsChange?.(updatedItems);
		setEditingItem(null);
	};

	// 削除ハンドラ
	const handleDelete = (itemId: string) => {
		// 再帰的に子孫IDを収集
		const collectDescendantIds = (id: string): string[] => {
			const childIds = props.items
				.filter((i) => i.parentId === id)
				.map((i) => i.id);
			return [id, ...childIds.flatMap(collectDescendantIds)];
		};
		const idsToRemove = new Set(collectDescendantIds(itemId));
		const filteredItems = props.items.filter((i) => !idsToRemove.has(i.id));
		props.onItemsChange?.(filteredItems);
		// 削除対象が選択中なら選択解除
		if (idsToRemove.has(selectedItem())) {
			setSelectedItem("");
		}
	};

	// インライン入力の挿入位置を計算
	const inlineInputPosition = createMemo(() => {
		const creating = creatingItem();
		if (!creating) return null;

		const flat = flatItems();

		if (creating.afterItemId) {
			const idx = flat.findIndex((i) => i.id === creating.afterItemId);
			if (idx >= 0) {
				const parentDepth = creating.parentId
					? (flat.find((i) => i.id === creating.parentId)?.depth ?? 0)
					: -1;
				return { index: idx + 1, depth: parentDepth + 1 };
			}
		}

		if (creating.parentId) {
			const parentIdx = flat.findIndex((i) => i.id === creating.parentId);
			if (parentIdx >= 0) {
				const parentDepth = flat[parentIdx].depth;
				return { index: parentIdx + 1, depth: parentDepth + 1 };
			}
		}

		// ルート末尾
		return { index: flat.length, depth: 0 };
	});

	// コンテキストメニューハンドラ
	const handleNavContextMenu = (e: MouseEvent, targetItemId: string | null) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY, targetItemId });
	};

	const handleContextMenuNewItem = (
		kind: "dashboard" | "document" | "folder",
	) => {
		const ctx = contextMenu();
		if (!ctx) return;
		const targetId = ctx.targetItemId;
		if (targetId) {
			const target = props.items.find((i) => i.id === targetId);
			if (target?.type === "folder") {
				if (!expandedItems().includes(targetId)) {
					setExpandedItems((prev) => [...prev, targetId]);
				}
				setCreatingItem({
					parentId: targetId,
					kind,
					afterItemId: null,
				});
			} else if (target) {
				setCreatingItem({
					parentId: target.parentId ?? null,
					kind,
					afterItemId: targetId,
				});
			}
		} else {
			setCreatingItem({ parentId: null, kind, afterItemId: null });
		}
		if (searchQuery()) setSearchQuery("");
	};

	const handleContextMenuRename = () => {
		const ctx = contextMenu();
		if (ctx?.targetItemId) {
			setEditingItem({ id: ctx.targetItemId });
		}
	};

	const handleContextMenuDelete = () => {
		const ctx = contextMenu();
		if (ctx?.targetItemId) {
			handleDelete(ctx.targetItemId);
		}
	};

	// ドラッグ開始ハンドラ
	const onDragStart = ({ draggable }: DragEvent) => {
		setActiveId(String(draggable.id));
		setCreatingItem(null);
	};

	// ドラッグオーバーハンドラ（droppableの上にドラッグされた時）
	const onDragOver = (event: DragEvent) => {
		const { droppable } = event;

		if (!droppable) {
			setOverId(null);
			setDropPosition(null);
			return;
		}

		const droppableId = String(droppable.id);
		setOverId(droppableId);
		// dropPositionはhandleMouseMoveで更新される
	};

	// ドラッグ終了ハンドラ
	const onDragEnd = (event: DragEvent) => {
		const { draggable, droppable } = event;

		if (!droppable) {
			resetDragState();
			return;
		}

		const dragId = String(draggable.id);
		const dropId = String(droppable.id);

		if (dragId === dropId) {
			resetDragState();
			return;
		}

		const items = [...props.items];
		const dragItem = items.find((i) => i.id === dragId);
		const dropItem = items.find((i) => i.id === dropId);

		if (!dragItem || !dropItem) {
			resetDragState();
			return;
		}

		const currentDropPosition = dropPosition();

		batch(() => {
			let newParentId: string | null | undefined;
			let newOrder: number;

			if (currentDropPosition === "inside") {
				// 子として追加
				newParentId = dropId;
				const siblings = items.filter((i) => i.parentId === dropId);
				newOrder = siblings.length;
				// 親を展開
				if (!expandedItems().includes(dropId)) {
					setExpandedItems((prev) => [...prev, dropId]);
				}
			} else {
				// 同じ親の兄弟として追加
				newParentId = dropItem.parentId;
				const siblings = items.filter(
					(i) => i.parentId === dropItem.parentId && i.id !== dragId,
				);
				const dropItemIndex = siblings.findIndex((i) => i.id === dropId);
				newOrder =
					currentDropPosition === "before" ? dropItemIndex : dropItemIndex + 1;
			}

			// 新しいアイテム配列を作成
			const newItems = items.map((item) => {
				if (item.id === dragId) {
					return {
						...item,
						parentId: newParentId,
						order: newOrder,
					};
				}
				// 同じ親の兄弟のorderを再計算
				if (item.parentId === newParentId && item.id !== dragId) {
					const siblings = items.filter(
						(i) => i.parentId === newParentId && i.id !== dragId,
					);
					const currentIndex = siblings.findIndex((i) => i.id === item.id);
					return {
						...item,
						order: currentIndex >= newOrder ? currentIndex + 1 : currentIndex,
					};
				}
				return item;
			});

			props.onItemsChange?.(newItems);
		});

		resetDragState();
	};

	const resetDragState = () => {
		setActiveId(null);
		setOverId(null);
		setDropPosition(null);
	};

	const ids = createMemo(() => flatItems().map((item) => item.id));

	const dragContextValue: DragContextValue = {
		activeId,
		overId,
		dropPosition,
	};

	// 設定ダイアログの状態
	const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);

	// テーマコンテキスト
	const theme = useContext(ThemeContext);

	// 現在の位置（propsから取得、デフォルトは'left'）
	const currentPosition = () => props.position || "left";

	// 幅の設定
	const currentWidth = () => props.width ?? DEFAULT_WIDTH;
	const minWidth = () => props.minWidth ?? MIN_WIDTH;
	const maxWidth = () => props.maxWidth ?? MAX_WIDTH;

	// 折り畳み状態
	const isCollapsed = () => props.collapsed ?? false;

	// 折り畳みトグル
	const toggleCollapsed = () => {
		props.onCollapsedChange?.(!isCollapsed());
	};

	// リサイズ状態
	const [isResizing, setIsResizing] = createSignal(false);

	// リサイズハンドラ
	const handleResizeStart = (e: MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);

		const startX = e.clientX;
		const startWidth = currentWidth();
		const isRight = currentPosition() === "right";

		const handleResizeMove = (moveEvent: MouseEvent) => {
			const deltaX = moveEvent.clientX - startX;
			// 右側サイドバーの場合は方向を反転
			const newWidth = isRight ? startWidth - deltaX : startWidth + deltaX;
			const clampedWidth = Math.min(Math.max(newWidth, minWidth()), maxWidth());
			props.onWidthChange?.(clampedWidth);
		};

		const handleResizeEnd = () => {
			setIsResizing(false);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			document.removeEventListener("mousemove", handleResizeMove);
			document.removeEventListener("mouseup", handleResizeEnd);
		};

		// リサイズ中はカーソルとユーザー選択を固定
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", handleResizeMove);
		document.addEventListener("mouseup", handleResizeEnd);
	};

	// 位置変更ハンドラ
	const handlePositionChange = (details: { value: string | null }) => {
		if (details.value) {
			props.onPositionChange?.(details.value as SidebarPosition);
		}
	};

	return (
		<aside
			class={styles.Sidebar}
			classList={{
				[styles.SidebarRight]: currentPosition() === "right",
				[styles.SidebarResizing]: isResizing(),
				[styles.SidebarCollapsed]: isCollapsed(),
				[styles.SidebarFileDragOver]: isOsFileDragOver(),
			}}
			style={{
				width: isCollapsed() ? `${COLLAPSED_WIDTH}px` : `${currentWidth()}px`,
			}}
		>
			{/* リサイズハンドル（折り畳み時は非表示） */}
			<Show when={!isCollapsed()}>
				<button
					type="button"
					aria-label="サイドバーの幅を調整"
					class={styles.ResizeHandle}
					classList={{
						[styles.ResizeHandleRight]: currentPosition() === "left",
						[styles.ResizeHandleLeft]: currentPosition() === "right",
					}}
					onMouseDown={handleResizeStart}
					onKeyDown={(e) => {
						// キーボードでもリサイズ可能にする
						const step = e.shiftKey ? 50 : 10;
						if (e.key === "ArrowLeft") {
							const newWidth =
								currentPosition() === "left"
									? currentWidth() - step
									: currentWidth() + step;
							props.onWidthChange?.(
								Math.min(Math.max(newWidth, minWidth()), maxWidth()),
							);
						} else if (e.key === "ArrowRight") {
							const newWidth =
								currentPosition() === "left"
									? currentWidth() + step
									: currentWidth() - step;
							props.onWidthChange?.(
								Math.min(Math.max(newWidth, minWidth()), maxWidth()),
							);
						}
					}}
				/>
			</Show>

			{/* 折り畳みトグルボタン */}
			<div class={styles.CollapseToggle}>
				<button
					type="button"
					class={styles.CollapseButton}
					aria-label={
						isCollapsed() ? "サイドバーを展開" : "サイドバーを折り畳む"
					}
					onClick={toggleCollapsed}
				>
					<Show
						when={isCollapsed()}
						fallback={
							currentPosition() === "left" ? (
								<ChevronsLeftIcon />
							) : (
								<ChevronsRightIcon />
							)
						}
					>
						{currentPosition() === "left" ? (
							<ChevronsRightIcon />
						) : (
							<ChevronsLeftIcon />
						)}
					</Show>
				</button>
			</div>

			{/* ヘッダー: パネル選択ドロップダウン（折り畳み時は非表示） */}
			<Show when={!isCollapsed()}>
				<div class={styles.Header}>
					<Select.Root
						collection={panelCollection()}
						value={
							props.selectedPanel
								? [props.selectedPanel]
								: [props.panels[0]?.value]
						}
						onValueChange={(details) => props.onPanelChange?.(details.value[0])}
					>
						<Select.Control class={styles.SelectControl}>
							<Select.Trigger class={styles.SelectTrigger}>
								<Select.ValueText placeholder="パネルを選択" />
								<ChevronDownIcon class={styles.SelectIcon} />
							</Select.Trigger>
						</Select.Control>
						<Select.Positioner>
							<Select.Content class={styles.SelectContent}>
								<For each={props.panels}>
									{(panel) => (
										<Select.Item item={panel} class={styles.SelectItem}>
											<Select.ItemText>{panel.label}</Select.ItemText>
										</Select.Item>
									)}
								</For>
							</Select.Content>
						</Select.Positioner>
					</Select.Root>
				</div>

				{/* 検索フィールド */}
				<div class={styles.SearchContainer}>
					<Field.Root class={styles.SearchField}>
						<Field.Input
							class={styles.SearchInput}
							placeholder={
								props.searchPlaceholder || "入力してEnterキーを押してください"
							}
							value={searchQuery()}
							onInput={(e) => setSearchQuery(e.currentTarget.value)}
						/>
						<SearchIcon class={styles.SearchIcon} />
					</Field.Root>
				</div>

				{/* アクションツールバー */}
				<div class={styles.ActionToolbar}>
					<button
						type="button"
						class={styles.ActionButton}
						aria-label="新規ダッシュボード"
						title="新規ダッシュボード"
						onClick={() => {
							if (searchQuery()) setSearchQuery("");
							setCreatingItem(getCreationPosition("dashboard"));
						}}
					>
						<LayoutGridIcon />
					</button>
					<button
						type="button"
						class={styles.ActionButton}
						aria-label="新規ドキュメント"
						title="新規ドキュメント"
						onClick={() => {
							if (searchQuery()) setSearchQuery("");
							setCreatingItem(getCreationPosition("document"));
						}}
					>
						<FilePlusIcon />
					</button>
					<button
						type="button"
						class={styles.ActionButton}
						aria-label="新規フォルダ"
						title="新規フォルダ"
						onClick={() => {
							if (searchQuery()) setSearchQuery("");
							setCreatingItem(getCreationPosition("folder"));
						}}
					>
						<FolderPlusIcon />
					</button>
				</div>
			</Show>

			{/* ナビゲーションリスト（折り畳み時は非表示） */}
			<Show when={!isCollapsed()}>
				<nav class={styles.Nav}>
					<DragContext.Provider value={dragContextValue}>
						<DragDropProvider
							onDragStart={onDragStart}
							onDragOver={onDragOver}
							onDragEnd={onDragEnd}
						>
							<DragDropSensors />
							<ul
								class={styles.NavList}
								onContextMenu={(e) => handleNavContextMenu(e, null)}
							>
								<SortableProvider ids={ids()}>
									<For each={flatItems()}>
										{(item, index) => {
											const pos = () => inlineInputPosition();
											const editing = () => editingItem();
											const creating = () => creatingItem();
											return (
												<>
													{/* インライン入力（アイテムの前に挿入） */}
													<Show when={pos()?.index === index() && creating()}>
														{(c) => (
															<InlineInput
																depth={pos()?.depth ?? 0}
																kind={c().kind}
																onConfirm={handleCreateConfirm}
																onCancel={() => setCreatingItem(null)}
															/>
														)}
													</Show>
													{/* リネーム中はInlineInputを表示 */}
													<Show
														when={editing()?.id === item.id}
														fallback={
															<SortableNavItem
																item={item}
																isExpanded={expandedItems().includes(item.id)}
																isSelected={selectedItem() === item.id}
																hasChildren={hasChildren(item.id)}
																isFolder={item.type === "folder"}
																onToggle={toggleExpanded}
																onSelect={handleItemSelect}
																onContextMenu={(e) =>
																	handleNavContextMenu(e, item.id)
																}
															/>
														}
													>
														<InlineInput
															depth={item.depth}
															kind="rename"
															initialValue={item.name}
															onConfirm={(name) =>
																handleRenameConfirm(item.id, name)
															}
															onCancel={() => setEditingItem(null)}
														/>
													</Show>
												</>
											);
										}}
									</For>
									{/* リスト末尾のインライン入力 */}
									<Show
										when={
											inlineInputPosition()?.index === flatItems().length &&
											creatingItem()
										}
									>
										{(c) => (
											<InlineInput
												depth={inlineInputPosition()?.depth ?? 0}
												kind={c().kind}
												onConfirm={handleCreateConfirm}
												onCancel={() => setCreatingItem(null)}
											/>
										)}
									</Show>
								</SortableProvider>
							</ul>
							<DragOverlay>
								<Show when={activeId()}>
									{(id) => {
										const item = () => flatItems().find((i) => i.id === id());
										return (
											<Show when={item()}>
												{(activeItem) => (
													<div class={styles.DragOverlay}>
														<span class={styles.NavItemIcon}>
															<NavIcon
																type={activeItem().icon}
																color={activeItem().iconColor}
															/>
														</span>
														<span class={styles.NavItemText}>
															{activeItem().name}
														</span>
													</div>
												)}
											</Show>
										);
									}}
								</Show>
							</DragOverlay>
						</DragDropProvider>
					</DragContext.Provider>
				</nav>

				{/* コンテキストメニュー */}
				<Show when={contextMenu()}>
					{(ctx) => (
						<ContextMenu
							x={ctx().x}
							y={ctx().y}
							targetItemId={ctx().targetItemId}
							onNewDashboard={() => handleContextMenuNewItem("dashboard")}
							onNewDocument={() => handleContextMenuNewItem("document")}
							onNewFolder={() => handleContextMenuNewItem("folder")}
							onRename={handleContextMenuRename}
							onDelete={handleContextMenuDelete}
							onClose={() => setContextMenu(null)}
						/>
					)}
				</Show>

				{/* フッター: 設定ボタン */}
				<div class={styles.Footer}>
					<Dialog.Root
						open={isSettingsOpen()}
						onOpenChange={(e) => setIsSettingsOpen(e.open)}
					>
						<Dialog.Trigger class={styles.SettingsButton}>
							<SettingsIcon />
							<span>設定</span>
						</Dialog.Trigger>
						<Portal>
							<Dialog.Backdrop class={styles.DialogBackdrop} />
							<Dialog.Positioner class={styles.DialogPositioner}>
								<Dialog.Content class={styles.DialogContent}>
									<Dialog.Title class={styles.DialogTitle}>設定</Dialog.Title>
									<Dialog.Description class={styles.DialogDescription}>
										サイドバーとテーマの設定を変更します。
									</Dialog.Description>

									<div class={styles.DialogBody}>
										{/* サイドバーの位置 */}
										<RadioGroup.Root
											value={currentPosition()}
											onValueChange={handlePositionChange}
											class={styles.RadioGroup}
										>
											<RadioGroup.Label class={styles.RadioGroupLabel}>
												サイドバーの位置
											</RadioGroup.Label>
											<div class={styles.RadioOptions}>
												<RadioGroup.Item value="left" class={styles.RadioItem}>
													<RadioGroup.ItemControl class={styles.RadioControl} />
													<RadioGroup.ItemText class={styles.RadioText}>
														左側
													</RadioGroup.ItemText>
													<RadioGroup.ItemHiddenInput />
												</RadioGroup.Item>
												<RadioGroup.Item value="right" class={styles.RadioItem}>
													<RadioGroup.ItemControl class={styles.RadioControl} />
													<RadioGroup.ItemText class={styles.RadioText}>
														右側
													</RadioGroup.ItemText>
													<RadioGroup.ItemHiddenInput />
												</RadioGroup.Item>
											</div>
										</RadioGroup.Root>

										{/* カラーモード */}
										<Show when={theme}>
											{(t) => (
												<>
													<div class={styles.SettingSection}>
														<RadioGroup.Root
															value={t().settings().colorMode}
															onValueChange={(details) => {
																if (details.value) {
																	t().setColorMode(
																		details.value as
																			| "light"
																			| "dark"
																			| "system",
																	);
																}
															}}
															class={styles.RadioGroup}
														>
															<RadioGroup.Label class={styles.RadioGroupLabel}>
																カラーモード
															</RadioGroup.Label>
															<div class={styles.RadioOptions}>
																<RadioGroup.Item
																	value="light"
																	class={styles.RadioItem}
																>
																	<RadioGroup.ItemControl
																		class={styles.RadioControl}
																	/>
																	<RadioGroup.ItemText class={styles.RadioText}>
																		ライト
																	</RadioGroup.ItemText>
																	<RadioGroup.ItemHiddenInput />
																</RadioGroup.Item>
																<RadioGroup.Item
																	value="dark"
																	class={styles.RadioItem}
																>
																	<RadioGroup.ItemControl
																		class={styles.RadioControl}
																	/>
																	<RadioGroup.ItemText class={styles.RadioText}>
																		ダーク
																	</RadioGroup.ItemText>
																	<RadioGroup.ItemHiddenInput />
																</RadioGroup.Item>
																<RadioGroup.Item
																	value="system"
																	class={styles.RadioItem}
																>
																	<RadioGroup.ItemControl
																		class={styles.RadioControl}
																	/>
																	<RadioGroup.ItemText class={styles.RadioText}>
																		システム
																	</RadioGroup.ItemText>
																	<RadioGroup.ItemHiddenInput />
																</RadioGroup.Item>
															</div>
														</RadioGroup.Root>
													</div>

													{/* アクセントカラー */}
													<div class={styles.SettingSection}>
														<div class={styles.SettingSectionLabel}>
															アクセントカラー
														</div>
														<div class={styles.ColorSwatchGrid}>
															<For each={Object.entries(ACCENT_PRESETS)}>
																{([key, preset]) => (
																	<button
																		type="button"
																		class={styles.ColorSwatch}
																		classList={{
																			[styles.ColorSwatchSelected]:
																				t().settings().accentColor === key,
																		}}
																		style={{
																			background: t().resolvedDark()
																				? preset.darkSolid
																				: preset.solid,
																		}}
																		title={preset.name}
																		onClick={() => t().setAccentColor(key)}
																	/>
																)}
															</For>
														</div>
													</div>

													{/* ウィンドウ効果 (Tauri only) */}
													<Show when={isTauri()}>
														<div class={styles.SettingSection}>
															<RadioGroup.Root
																value={t().settings().glassEffect}
																onValueChange={(details) => {
																	if (details.value) {
																		t().setGlassEffect(
																			details.value as GlassEffect,
																		);
																	}
																}}
																class={styles.RadioGroup}
															>
																<RadioGroup.Label
																	class={styles.RadioGroupLabel}
																>
																	ウィンドウ効果
																</RadioGroup.Label>
																<div class={styles.RadioOptions}>
																	<RadioGroup.Item
																		value="none"
																		class={styles.RadioItem}
																	>
																		<RadioGroup.ItemControl
																			class={styles.RadioControl}
																		/>
																		<RadioGroup.ItemText
																			class={styles.RadioText}
																		>
																			なし
																		</RadioGroup.ItemText>
																		<RadioGroup.ItemHiddenInput />
																	</RadioGroup.Item>
																	<RadioGroup.Item
																		value="mica"
																		class={styles.RadioItem}
																	>
																		<RadioGroup.ItemControl
																			class={styles.RadioControl}
																		/>
																		<RadioGroup.ItemText
																			class={styles.RadioText}
																		>
																			Mica
																			<span class={styles.SettingHint}>
																				{" "}
																				(Windows 11)
																			</span>
																		</RadioGroup.ItemText>
																		<RadioGroup.ItemHiddenInput />
																	</RadioGroup.Item>
																	<RadioGroup.Item
																		value="acrylic"
																		class={styles.RadioItem}
																	>
																		<RadioGroup.ItemControl
																			class={styles.RadioControl}
																		/>
																		<RadioGroup.ItemText
																			class={styles.RadioText}
																		>
																			Acrylic
																			<span class={styles.SettingHint}>
																				{" "}
																				(Windows 10+)
																			</span>
																		</RadioGroup.ItemText>
																		<RadioGroup.ItemHiddenInput />
																	</RadioGroup.Item>
																	<RadioGroup.Item
																		value="blur"
																		class={styles.RadioItem}
																	>
																		<RadioGroup.ItemControl
																			class={styles.RadioControl}
																		/>
																		<RadioGroup.ItemText
																			class={styles.RadioText}
																		>
																			Blur
																		</RadioGroup.ItemText>
																		<RadioGroup.ItemHiddenInput />
																	</RadioGroup.Item>
																	<RadioGroup.Item
																		value="tabbed"
																		class={styles.RadioItem}
																	>
																		<RadioGroup.ItemControl
																			class={styles.RadioControl}
																		/>
																		<RadioGroup.ItemText
																			class={styles.RadioText}
																		>
																			Tabbed
																			<span class={styles.SettingHint}>
																				{" "}
																				(Windows 11)
																			</span>
																		</RadioGroup.ItemText>
																		<RadioGroup.ItemHiddenInput />
																	</RadioGroup.Item>
																</div>
															</RadioGroup.Root>
														</div>
													</Show>

													{/* 背景の不透明度 */}
													<div class={styles.SettingSection}>
														<div class={styles.SliderRoot}>
															<div class={styles.SliderLabel}>
																<span>背景の不透明度</span>
																<span class={styles.SliderValue}>
																	{Math.round(
																		t().settings().backgroundOpacity * 100,
																	)}
																	%
																</span>
															</div>
															<div class={styles.SliderControl}>
																<input
																	type="range"
																	min="0"
																	max="100"
																	step="5"
																	value={Math.round(
																		t().settings().backgroundOpacity * 100,
																	)}
																	onInput={(e) => {
																		t().setBackgroundOpacity(
																			Number(e.currentTarget.value) / 100,
																		);
																	}}
																	style={{
																		width: "100%",
																		height: "4px",
																		"-webkit-appearance": "none",
																		appearance: "none",
																		background: `linear-gradient(to right, var(--demo-coral-solid) ${Math.round(t().settings().backgroundOpacity * 100)}%, var(--demo-border) ${Math.round(t().settings().backgroundOpacity * 100)}%)`,
																		"border-radius": "2px",
																		outline: "none",
																		cursor: "pointer",
																	}}
																/>
															</div>
														</div>
													</div>

													{/* ぼかし強度 */}
													<div class={styles.SettingSection}>
														<div class={styles.SliderRoot}>
															<div class={styles.SliderLabel}>
																<span>ぼかし強度</span>
																<span class={styles.SliderValue}>
																	{t().settings().blurStrength}
																</span>
															</div>
															<div class={styles.SliderControl}>
																<input
																	type="range"
																	min="0"
																	max="100"
																	step="5"
																	value={t().settings().blurStrength}
																	onInput={(e) => {
																		t().setBlurStrength(
																			Number(e.currentTarget.value),
																		);
																	}}
																	style={{
																		width: "100%",
																		height: "4px",
																		"-webkit-appearance": "none",
																		appearance: "none",
																		background: `linear-gradient(to right, var(--demo-coral-solid) ${t().settings().blurStrength}%, var(--demo-border) ${t().settings().blurStrength}%)`,
																		"border-radius": "2px",
																		outline: "none",
																		cursor: "pointer",
																	}}
																/>
															</div>
														</div>
													</div>
												</>
											)}
										</Show>
									</div>

									<div class={styles.DialogFooter}>
										<Dialog.CloseTrigger class={styles.DialogCloseButton}>
											閉じる
										</Dialog.CloseTrigger>
									</div>

									<Dialog.CloseTrigger class={styles.DialogCloseIcon}>
										<XIcon />
									</Dialog.CloseTrigger>
								</Dialog.Content>
							</Dialog.Positioner>
						</Portal>
					</Dialog.Root>
				</div>
			</Show>
		</aside>
	);
};

// ソート可能なナビゲーションアイテムコンポーネント
interface SortableNavItemProps {
	item: TreeNode;
	isExpanded: boolean;
	isSelected: boolean;
	hasChildren: boolean;
	isFolder: boolean;
	onToggle: (id: string) => void;
	onSelect: (item: NavItem) => void;
	onContextMenu?: (e: MouseEvent) => void;
}

const SortableNavItem = (props: SortableNavItemProps) => {
	const sortable = createSortable(props.item.id);
	const droppable = createDroppable(props.item.id);
	const dragContext = useContext(DragContext);

	const isDropTarget = () =>
		dragContext?.overId() === props.item.id &&
		dragContext?.activeId() !== props.item.id;
	const currentDropPosition = () =>
		isDropTarget() ? dragContext?.dropPosition() : null;

	return (
		<li
			ref={(el) => {
				sortable.ref(el);
				droppable.ref(el);
			}}
			class={styles.NavItem}
			classList={{
				[styles.NavItemDragging]: sortable.isActiveDraggable,
				[styles.NavItemDropTargetBefore]: currentDropPosition() === "before",
				[styles.NavItemDropTargetAfter]: currentDropPosition() === "after",
				[styles.NavItemDropTargetInside]: currentDropPosition() === "inside",
			}}
			data-item-id={props.item.id}
		>
			{/* ドロップインジケーター（前） */}
			<Show when={currentDropPosition() === "before"}>
				<div
					class={styles.DropIndicator}
					style={{ "--depth": props.item.depth }}
				/>
			</Show>

			<button
				type="button"
				class={styles.NavItemButton}
				classList={{
					[styles.NavItemSelected]: props.isSelected,
					[styles.NavItemHasChildren]: props.hasChildren,
					[styles.NavItemDropHighlight]: currentDropPosition() === "inside",
				}}
				style={{ "--depth": props.item.depth }}
				onClick={() => {
					if (props.hasChildren) {
						props.onToggle(props.item.id);
					}
					props.onSelect(props.item);
				}}
				onContextMenu={(e) => {
					e.preventDefault();
					e.stopPropagation();
					props.onContextMenu?.(e);
				}}
				{...sortable.dragActivators}
			>
				<span class={styles.DragHandle}>
					<GripVerticalIcon />
				</span>
				<Show when={props.hasChildren}>
					<span
						class={styles.NavItemIndicator}
						classList={{ [styles.NavItemIndicatorOpen]: props.isExpanded }}
					>
						<ChevronRightIcon />
					</span>
				</Show>
				<span class={styles.NavItemIcon}>
					<NavIcon
						type={props.item.icon}
						color={props.item.iconColor}
						expanded={props.isFolder ? props.isExpanded : undefined}
					/>
				</span>
				<span class={styles.NavItemText}>{props.item.name}</span>
			</button>

			{/* ドロップインジケーター（後） */}
			<Show when={currentDropPosition() === "after"}>
				<div
					class={styles.DropIndicator}
					style={{ "--depth": props.item.depth }}
				/>
			</Show>
		</li>
	);
};

export default Sidebar;
