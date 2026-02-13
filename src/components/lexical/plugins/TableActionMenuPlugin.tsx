import {
	$deleteTableColumn__EXPERIMENTAL,
	$deleteTableRow__EXPERIMENTAL,
	$getTableCellNodeFromLexicalNode,
	$getTableColumnIndexFromTableCellNode,
	$getTableNodeFromLexicalNodeOrThrow,
	$getTableRowIndexFromTableCellNode,
	$insertTableColumn__EXPERIMENTAL,
	$insertTableRow__EXPERIMENTAL,
	$isTableCellNode,
	$isTableRowNode,
	$isTableSelection,
	$unmergeCell,
	TableCellHeaderStates,
	type TableCellNode,
	type TableRowNode,
} from "@lexical/table";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_CRITICAL,
	SELECTION_CHANGE_COMMAND,
} from "lexical";
import {
	createEffect,
	createSignal,
	For,
	type JSX,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { Portal } from "solid-js/web";

// Icons
function IconChevronDown() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<polyline points="6 9 12 15 18 9" />
		</svg>
	);
}

function IconTrash() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<polyline points="3 6 5 6 21 6" />
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
		</svg>
	);
}

function IconPlus() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	);
}

function IconMerge() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<line x1="12" y1="3" x2="12" y2="21" />
			<line x1="3" y1="12" x2="21" y2="12" />
		</svg>
	);
}

function IconUnmerge() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<rect x="3" y="3" width="7" height="7" />
			<rect x="14" y="3" width="7" height="7" />
			<rect x="3" y="14" width="7" height="7" />
			<rect x="14" y="14" width="7" height="7" />
		</svg>
	);
}

function IconColorPalette() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
			<circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
			<circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
			<circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
			<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
		</svg>
	);
}

function IconHeader() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M4 12h16" />
			<path d="M4 6h16" />
			<path d="M4 18h16" />
		</svg>
	);
}

function IconAlignTop() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="4" y1="4" x2="20" y2="4" />
			<rect x="8" y="8" width="8" height="12" />
		</svg>
	);
}

function IconAlignMiddle() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="4" y1="12" x2="6" y2="12" />
			<line x1="18" y1="12" x2="20" y2="12" />
			<rect x="8" y="6" width="8" height="12" />
		</svg>
	);
}

function IconAlignBottom() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="4" y1="20" x2="20" y2="20" />
			<rect x="8" y="4" width="8" height="12" />
		</svg>
	);
}

const COLORS = [
	"#ffffff",
	"#f8f9fa",
	"#e9ecef",
	"#dee2e6",
	"#ced4da",
	"#ffebee",
	"#fce4ec",
	"#f3e5f5",
	"#ede7f6",
	"#e8eaf6",
	"#e3f2fd",
	"#e1f5fe",
	"#e0f7fa",
	"#e0f2f1",
	"#e8f5e9",
	"#f1f8e9",
	"#f9fbe7",
	"#fffde7",
	"#fff8e1",
	"#fff3e0",
	"#fbe9e7",
	"#efebe9",
	"#fafafa",
	"#eceff1",
	"#cfd8dc",
];

function ColorPicker(props: {
	color: string;
	onChange: (color: string) => void;
}) {
	return (
		<div class="table-action-color-picker">
			<For each={COLORS}>
				{(color) => (
					<button
						type="button"
						class={`color-picker-item ${props.color === color ? "selected" : ""}`}
						style={{ "background-color": color }}
						onClick={() => props.onChange(color)}
						title={color}
					/>
				)}
			</For>
			<button
				type="button"
				class="color-picker-item clear"
				onClick={() => props.onChange("")}
				title="Clear"
			>
				✕
			</button>
		</div>
	);
}

function TableActionMenu(props: {
	tableCellNode: TableCellNode;
	onClose: () => void;
}) {
	const [editor] = useLexicalComposerContext();
	const [showColorPicker, setShowColorPicker] = createSignal(false);
	const [selectionCounts, setSelectionCounts] = createSignal({
		rows: 1,
		columns: 1,
	});
	const [canMerge, setCanMerge] = createSignal(false);
	const [canUnmerge, setCanUnmerge] = createSignal(false);
	const [backgroundColor, setBackgroundColor] = createSignal<string>("");

	onMount(() => {
		editor.getEditorState().read(() => {
			const selection = $getSelection();
			if ($isTableSelection(selection)) {
				const nodes = selection.getNodes();
				const cells = nodes.filter((node) =>
					$isTableCellNode(node),
				) as TableCellNode[];

				// Count unique rows and columns
				const rowSet = new Set<number>();
				const colSet = new Set<number>();

				cells.forEach((cell) => {
					const rowIndex = $getTableRowIndexFromTableCellNode(cell);
					const colIndex = $getTableColumnIndexFromTableCellNode(cell);
					rowSet.add(rowIndex);
					colSet.add(colIndex);
				});

				setSelectionCounts({ rows: rowSet.size, columns: colSet.size });
				setCanMerge(cells.length > 1);
			}

			// Check if can unmerge
			const cellNode = props.tableCellNode;
			const colspan = cellNode.getColSpan();
			const rowspan = cellNode.getRowSpan();
			setCanUnmerge(colspan > 1 || rowspan > 1);

			// Get background color
			const bgColor = cellNode.getBackgroundColor();
			setBackgroundColor(bgColor || "");
		});
	});

	const insertRowAbove = () => {
		editor.update(() => {
			$insertTableRow__EXPERIMENTAL(false);
		});
		props.onClose();
	};

	const insertRowBelow = () => {
		editor.update(() => {
			$insertTableRow__EXPERIMENTAL(true);
		});
		props.onClose();
	};

	const insertColumnLeft = () => {
		editor.update(() => {
			$insertTableColumn__EXPERIMENTAL(false);
		});
		props.onClose();
	};

	const insertColumnRight = () => {
		editor.update(() => {
			$insertTableColumn__EXPERIMENTAL(true);
		});
		props.onClose();
	};

	const deleteRow = () => {
		editor.update(() => {
			$deleteTableRow__EXPERIMENTAL();
		});
		props.onClose();
	};

	const deleteColumn = () => {
		editor.update(() => {
			$deleteTableColumn__EXPERIMENTAL();
		});
		props.onClose();
	};

	const deleteTable = () => {
		editor.update(() => {
			const tableNode = $getTableNodeFromLexicalNodeOrThrow(
				props.tableCellNode,
			);
			tableNode.remove();
		});
		props.onClose();
	};

	const mergeCells = () => {
		editor.update(() => {
			const selection = $getSelection();
			if ($isTableSelection(selection)) {
				const nodes = selection.getNodes();
				const cells = nodes.filter((node) =>
					$isTableCellNode(node),
				) as TableCellNode[];

				if (cells.length > 1) {
					// Find the bounds of the selection
					let minRow = Infinity,
						maxRow = -Infinity;
					let minCol = Infinity,
						maxCol = -Infinity;

					cells.forEach((cell) => {
						const rowIndex = $getTableRowIndexFromTableCellNode(cell);
						const colIndex = $getTableColumnIndexFromTableCellNode(cell);
						minRow = Math.min(minRow, rowIndex);
						maxRow = Math.max(maxRow, rowIndex + cell.getRowSpan() - 1);
						minCol = Math.min(minCol, colIndex);
						maxCol = Math.max(maxCol, colIndex + cell.getColSpan() - 1);
					});

					// Get the first cell and merge others into it
					const firstCell = cells[0];
					firstCell.setColSpan(maxCol - minCol + 1);
					firstCell.setRowSpan(maxRow - minRow + 1);

					// Remove other cells
					cells.slice(1).forEach((cell) => {
						cell.remove();
					});
				}
			}
		});
		props.onClose();
	};

	const unmergeCells = () => {
		editor.update(() => {
			$unmergeCell();
		});
		props.onClose();
	};

	const setBackgroundColorHandler = (color: string) => {
		editor.update(() => {
			const selection = $getSelection();
			if ($isTableSelection(selection)) {
				const nodes = selection.getNodes();
				nodes.forEach((node) => {
					if ($isTableCellNode(node)) {
						node.setBackgroundColor(color || null);
					}
				});
			} else {
				props.tableCellNode.setBackgroundColor(color || null);
			}
		});
		setBackgroundColor(color);
		setShowColorPicker(false);
	};

	const toggleHeaderRow = () => {
		editor.update(() => {
			const tableNode = $getTableNodeFromLexicalNodeOrThrow(
				props.tableCellNode,
			);
			const rowIndex = $getTableRowIndexFromTableCellNode(props.tableCellNode);

			// Get all cells in the same row
			const rows = tableNode.getChildren<TableRowNode>();
			if (rowIndex < rows.length) {
				const row = rows[rowIndex];
				const cells = row.getChildren<TableCellNode>();
				cells.forEach((cell) => {
					if ($isTableCellNode(cell)) {
						const headerState = cell.getHeaderStyles();
						if (headerState & TableCellHeaderStates.ROW) {
							cell.setHeaderStyles(headerState & ~TableCellHeaderStates.ROW);
						} else {
							cell.setHeaderStyles(headerState | TableCellHeaderStates.ROW);
						}
					}
				});
			}
		});
		props.onClose();
	};

	const toggleHeaderColumn = () => {
		editor.update(() => {
			const tableNode = $getTableNodeFromLexicalNodeOrThrow(
				props.tableCellNode,
			);
			const colIndex = $getTableColumnIndexFromTableCellNode(
				props.tableCellNode,
			);

			// Get all cells in the same column
			const rows = tableNode.getChildren<TableRowNode>();
			rows.forEach((row) => {
				if ($isTableRowNode(row)) {
					const cells = row.getChildren<TableCellNode>();
					let currentCol = 0;
					for (const cell of cells) {
						if ($isTableCellNode(cell)) {
							if (currentCol === colIndex) {
								const headerState = cell.getHeaderStyles();
								if (headerState & TableCellHeaderStates.COLUMN) {
									cell.setHeaderStyles(
										headerState & ~TableCellHeaderStates.COLUMN,
									);
								} else {
									cell.setHeaderStyles(
										headerState | TableCellHeaderStates.COLUMN,
									);
								}
								break;
							}
							currentCol += cell.getColSpan();
						}
					}
				}
			});
		});
		props.onClose();
	};

	const setCellVerticalAlign = (align: "top" | "middle" | "bottom") => {
		editor.update(() => {
			const selection = $getSelection();
			if ($isTableSelection(selection)) {
				const nodes = selection.getNodes();
				nodes.forEach((node) => {
					if ($isTableCellNode(node)) {
						const element = editor.getElementByKey(node.getKey());
						if (element) {
							(element as HTMLTableCellElement).style.verticalAlign = align;
						}
					}
				});
			} else {
				const element = editor.getElementByKey(props.tableCellNode.getKey());
				if (element) {
					(element as HTMLTableCellElement).style.verticalAlign = align;
				}
			}
		});
		props.onClose();
	};

	return (
		<div class="table-action-menu">
			<Show when={canMerge()}>
				<button
					type="button"
					class="table-action-menu-item"
					onClick={mergeCells}
				>
					<IconMerge />
					<span>Merge cells</span>
				</button>
			</Show>
			<Show when={canUnmerge()}>
				<button
					type="button"
					class="table-action-menu-item"
					onClick={unmergeCells}
				>
					<IconUnmerge />
					<span>Unmerge cells</span>
				</button>
			</Show>

			<div class="table-action-menu-divider" />

			<div class="table-action-menu-item has-submenu">
				<button
					type="button"
					onClick={() => setShowColorPicker(!showColorPicker())}
				>
					<IconColorPalette />
					<span>Background color</span>
					<IconChevronDown />
				</button>
				<Show when={showColorPicker()}>
					<ColorPicker
						color={backgroundColor()}
						onChange={setBackgroundColorHandler}
					/>
				</Show>
			</div>

			<div class="table-action-menu-divider" />

			<button
				type="button"
				class="table-action-menu-item"
				onClick={insertRowAbove}
			>
				<IconPlus />
				<span>
					Insert {selectionCounts().rows} row
					{selectionCounts().rows > 1 ? "s" : ""} above
				</span>
			</button>
			<button
				type="button"
				class="table-action-menu-item"
				onClick={insertRowBelow}
			>
				<IconPlus />
				<span>
					Insert {selectionCounts().rows} row
					{selectionCounts().rows > 1 ? "s" : ""} below
				</span>
			</button>
			<button
				type="button"
				class="table-action-menu-item"
				onClick={insertColumnLeft}
			>
				<IconPlus />
				<span>
					Insert {selectionCounts().columns} column
					{selectionCounts().columns > 1 ? "s" : ""} left
				</span>
			</button>
			<button
				type="button"
				class="table-action-menu-item"
				onClick={insertColumnRight}
			>
				<IconPlus />
				<span>
					Insert {selectionCounts().columns} column
					{selectionCounts().columns > 1 ? "s" : ""} right
				</span>
			</button>

			<div class="table-action-menu-divider" />

			<button
				type="button"
				class="table-action-menu-item"
				onClick={toggleHeaderRow}
			>
				<IconHeader />
				<span>Toggle header row</span>
			</button>
			<button
				type="button"
				class="table-action-menu-item"
				onClick={toggleHeaderColumn}
			>
				<IconHeader />
				<span>Toggle header column</span>
			</button>

			<div class="table-action-menu-divider" />

			<button
				type="button"
				class="table-action-menu-item"
				onClick={() => setCellVerticalAlign("top")}
			>
				<IconAlignTop />
				<span>Align top</span>
			</button>
			<button
				type="button"
				class="table-action-menu-item"
				onClick={() => setCellVerticalAlign("middle")}
			>
				<IconAlignMiddle />
				<span>Align middle</span>
			</button>
			<button
				type="button"
				class="table-action-menu-item"
				onClick={() => setCellVerticalAlign("bottom")}
			>
				<IconAlignBottom />
				<span>Align bottom</span>
			</button>

			<div class="table-action-menu-divider" />

			<button
				type="button"
				class="table-action-menu-item danger"
				onClick={deleteRow}
			>
				<IconTrash />
				<span>Delete row{selectionCounts().rows > 1 ? "s" : ""}</span>
			</button>
			<button
				type="button"
				class="table-action-menu-item danger"
				onClick={deleteColumn}
			>
				<IconTrash />
				<span>Delete column{selectionCounts().columns > 1 ? "s" : ""}</span>
			</button>
			<button
				type="button"
				class="table-action-menu-item danger"
				onClick={deleteTable}
			>
				<IconTrash />
				<span>Delete table</span>
			</button>
		</div>
	);
}

function TableCellActionMenuContainer(props: { anchorElem: HTMLElement }) {
	const [editor] = useLexicalComposerContext();
	const [tableCellNode, setTableCellNode] = createSignal<TableCellNode | null>(
		null,
	);
	const [menuPosition, setMenuPosition] = createSignal<{
		x: number;
		y: number;
	} | null>(null);
	const [showMenu, setShowMenu] = createSignal(false);

	let menuButtonRef: HTMLButtonElement | undefined;

	const moveMenu = () => {
		const selection = $getSelection();
		const nativeSelection = window.getSelection();

		if (selection == null || nativeSelection == null) {
			setTableCellNode(null);
			return;
		}

		const rootElement = editor.getRootElement();
		if (rootElement?.contains(nativeSelection.anchorNode)) {
			let tableCellNodeFromSelection: TableCellNode | null = null;

			if ($isRangeSelection(selection)) {
				tableCellNodeFromSelection = $getTableCellNodeFromLexicalNode(
					selection.anchor.getNode(),
				);
			} else if ($isTableSelection(selection)) {
				tableCellNodeFromSelection = $getTableCellNodeFromLexicalNode(
					selection.anchor.getNode(),
				);
			}

			if (tableCellNodeFromSelection !== null) {
				const tableCellElement = editor.getElementByKey(
					tableCellNodeFromSelection.getKey(),
				);

				if (tableCellElement !== null) {
					const cellRect = tableCellElement.getBoundingClientRect();
					const anchorRect = props.anchorElem.getBoundingClientRect();

					// Position the button at the top-right corner of the cell
					setMenuPosition({
						x: cellRect.right - anchorRect.left - 24,
						y: cellRect.top - anchorRect.top + 4,
					});
					setTableCellNode(tableCellNodeFromSelection);
					return;
				}
			}
		}

		setTableCellNode(null);
	};

	createEffect(() => {
		onCleanup(
			editor.registerUpdateListener(() => {
				editor.getEditorState().read(() => {
					moveMenu();
				});
			}),
		);
	});

	createEffect(() => {
		onCleanup(
			editor.registerCommand(
				SELECTION_CHANGE_COMMAND,
				() => {
					moveMenu();
					return false;
				},
				COMMAND_PRIORITY_CRITICAL,
			),
		);
	});

	const handleClickOutside = (e: MouseEvent) => {
		if (showMenu() && !menuButtonRef?.contains(e.target as Node)) {
			const menuEl = document.querySelector(".table-action-menu");
			if (menuEl && !menuEl.contains(e.target as Node)) {
				setShowMenu(false);
			}
		}
	};

	onMount(() => {
		document.addEventListener("click", handleClickOutside);
		onCleanup(() => {
			document.removeEventListener("click", handleClickOutside);
		});
	});

	return (
		<Show when={tableCellNode() !== null && menuPosition() !== null}>
			<Portal mount={props.anchorElem}>
				<button
					type="button"
					ref={menuButtonRef}
					class="table-cell-action-button"
					style={{
						transform: `translate(${menuPosition()?.x}px, ${menuPosition()?.y}px)`,
					}}
					onClick={() => setShowMenu(!showMenu())}
					title="Table options"
				>
					<IconChevronDown />
				</button>
				<Show when={showMenu()}>
					<div
						class="table-action-menu-container"
						style={{
							transform: `translate(${(menuPosition()?.x ?? 0) - 180}px, ${(menuPosition()?.y ?? 0) + 28}px)`,
						}}
					>
						<TableActionMenu
							tableCellNode={tableCellNode() as TableCellNode}
							onClose={() => setShowMenu(false)}
						/>
					</div>
				</Show>
			</Portal>
		</Show>
	);
}

export default function TableActionMenuPlugin(props: {
	anchorElem?: HTMLElement;
}): JSX.Element | null {
	const [editor] = useLexicalComposerContext();
	const [isEditable, setIsEditable] = createSignal(editor.isEditable());
	const [anchorElem, setAnchorElem] = createSignal<HTMLElement | null>(null);

	onMount(() => {
		// Get the editor's container element as anchor
		const rootElement = editor.getRootElement();
		if (rootElement?.parentElement) {
			setAnchorElem(props.anchorElem || rootElement.parentElement);
		}
	});

	createEffect(() => {
		onCleanup(
			editor.registerEditableListener((editable) => {
				setIsEditable(editable);
			}),
		);
	});

	return (
		<Show when={isEditable() && anchorElem()}>
			<TableCellActionMenuContainer anchorElem={anchorElem() as HTMLElement} />
		</Show>
	);
}
