import {
	$createCodeNode,
	$isCodeNode,
	getCodeLanguages,
	getDefaultCodeLanguage,
} from "@lexical/code";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
	$isListNode,
	INSERT_ORDERED_LIST_COMMAND,
	INSERT_UNORDERED_LIST_COMMAND,
	ListNode,
	REMOVE_LIST_COMMAND,
} from "@lexical/list";
import {
	$createHeadingNode,
	$createQuoteNode,
	$isHeadingNode,
	type HeadingTagType,
} from "@lexical/rich-text";
import { $isAtNodeEnd, $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@ryotarofr/lexical-solid/LexicalHorizontalRuleNode";
import {
	$createParagraphNode,
	$getNodeByKey,
	$getSelection,
	$isRangeSelection,
	CAN_REDO_COMMAND,
	CAN_UNDO_COMMAND,
	FORMAT_ELEMENT_COMMAND,
	FORMAT_TEXT_COMMAND,
	type LexicalEditor,
	type RangeSelection,
	REDO_COMMAND,
	SELECTION_CHANGE_COMMAND,
	UNDO_COMMAND,
} from "lexical";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	type JSX,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { INSERT_IMAGE_COMMAND } from "../nodes/ImageNode";

const LowPriority = 1;

const supportedBlockTypes = new Set([
	"paragraph",
	"quote",
	"code",
	"h1",
	"h2",
	"h3",
	"ul",
	"ol",
]);

const blockTypeToBlockName: Record<string, string> = {
	code: "Code Block",
	h1: "Heading 1",
	h2: "Heading 2",
	h3: "Heading 3",
	h4: "Heading 4",
	h5: "Heading 5",
	ol: "Numbered List",
	paragraph: "Normal",
	quote: "Quote",
	ul: "Bulleted List",
};

// SVG Icons as components
function IconUndo() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M3 7v6h6" />
			<path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
		</svg>
	);
}

function IconRedo() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M21 7v6h-6" />
			<path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
		</svg>
	);
}

function IconBold() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="currentColor"
		>
			<path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
			<path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
		</svg>
	);
}

function IconItalic() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="19" y1="4" x2="10" y2="4" />
			<line x1="14" y1="20" x2="5" y2="20" />
			<line x1="15" y1="4" x2="9" y2="20" />
		</svg>
	);
}

function IconUnderline() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" />
			<line x1="4" y1="21" x2="20" y2="21" />
		</svg>
	);
}

function IconStrikethrough() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M16 4H9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H8" />
			<line x1="4" y1="12" x2="20" y2="12" />
		</svg>
	);
}

function IconCode() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<polyline points="16 18 22 12 16 6" />
			<polyline points="8 6 2 12 8 18" />
		</svg>
	);
}

function IconLink() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
		</svg>
	);
}

function IconAlignLeft() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="17" y1="10" x2="3" y2="10" />
			<line x1="21" y1="6" x2="3" y2="6" />
			<line x1="21" y1="14" x2="3" y2="14" />
			<line x1="17" y1="18" x2="3" y2="18" />
		</svg>
	);
}

function IconAlignCenter() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="18" y1="10" x2="6" y2="10" />
			<line x1="21" y1="6" x2="3" y2="6" />
			<line x1="21" y1="14" x2="3" y2="14" />
			<line x1="18" y1="18" x2="6" y2="18" />
		</svg>
	);
}

function IconAlignRight() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="21" y1="10" x2="7" y2="10" />
			<line x1="21" y1="6" x2="3" y2="6" />
			<line x1="21" y1="14" x2="3" y2="14" />
			<line x1="21" y1="18" x2="7" y2="18" />
		</svg>
	);
}

function IconAlignJustify() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="21" y1="10" x2="3" y2="10" />
			<line x1="21" y1="6" x2="3" y2="6" />
			<line x1="21" y1="14" x2="3" y2="14" />
			<line x1="21" y1="18" x2="3" y2="18" />
		</svg>
	);
}

function IconParagraph() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M13 4v16" />
			<path d="M17 4v16" />
			<path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
		</svg>
	);
}

function IconH1() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M17 12l3-2v8" />
		</svg>
	);
}

function IconH2() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
		</svg>
	);
}

function IconH3() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
			<path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
		</svg>
	);
}

function IconBulletList() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="8" y1="6" x2="21" y2="6" />
			<line x1="8" y1="12" x2="21" y2="12" />
			<line x1="8" y1="18" x2="21" y2="18" />
			<circle cx="4" cy="6" r="1" fill="currentColor" />
			<circle cx="4" cy="12" r="1" fill="currentColor" />
			<circle cx="4" cy="18" r="1" fill="currentColor" />
		</svg>
	);
}

function IconNumberedList() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="10" y1="6" x2="21" y2="6" />
			<line x1="10" y1="12" x2="21" y2="12" />
			<line x1="10" y1="18" x2="21" y2="18" />
			<text x="2" y="8" font-size="8" fill="currentColor" stroke="none">
				1
			</text>
			<text x="2" y="14" font-size="8" fill="currentColor" stroke="none">
				2
			</text>
			<text x="2" y="20" font-size="8" fill="currentColor" stroke="none">
				3
			</text>
		</svg>
	);
}

function IconQuote() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="currentColor"
		>
			<path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
		</svg>
	);
}

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

function IconHorizontalRule() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="3" y1="12" x2="21" y2="12" />
		</svg>
	);
}

function IconImage() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<circle cx="8.5" cy="8.5" r="1.5" />
			<polyline points="21 15 16 10 5 21" />
		</svg>
	);
}

function IconTable() {
	return (
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<line x1="3" y1="9" x2="21" y2="9" />
			<line x1="3" y1="15" x2="21" y2="15" />
			<line x1="9" y1="3" x2="9" y2="21" />
			<line x1="15" y1="3" x2="15" y2="21" />
		</svg>
	);
}

function Divider() {
	return <div class="divider" />;
}

function positionEditorElement(editor: HTMLElement, rect: DOMRect | null) {
	if (rect === null) {
		editor.style.opacity = "0";
		editor.style.top = "-1000px";
		editor.style.left = "-1000px";
	} else {
		editor.style.opacity = "1";
		editor.style.top = `${rect.top + rect.height + window.pageYOffset + 10}px`;
		editor.style.left = `${rect.left + window.pageXOffset - editor.offsetWidth / 2 + rect.width / 2}px`;
	}
}

function FloatingLinkEditor(props: { editor: LexicalEditor }) {
	let editorRef!: HTMLDivElement;
	let inputRef!: HTMLInputElement;
	const [linkUrl, setLinkUrl] = createSignal("");
	const [isEditMode, setEditMode] = createSignal(false);
	const [lastSelection, setLastSelection] = createSignal<RangeSelection | null>(
		null,
	);

	// Sanitize URL to prevent XSS via dangerous protocols (javascript:, data:, vbscript:, etc.)
	const sanitizedUrl = () => {
		const url = linkUrl();
		if (!url) {
			return url;
		}

		// Use a normalized copy for checks, but return the original value on success to avoid
		// changing existing behavior beyond security hardening.
		let check = url;
		try {
			// Decode once to catch encoded schemes like "javascript%3A..."
			check = decodeURI(check);
		} catch {
			// If decoding fails, fall back to the raw string
		}

		// Strip control characters and whitespace that can be used for obfuscation
		const normalized = check
			// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS prevention
			.replace(/[\u0000-\u001F\u007F-\u009F\s]+/g, "")
			.toLowerCase();

		// Explicitly block known dangerous protocol prefixes
		const dangerousPrefixes = ["javascript:", "data:", "vbscript:"];
		for (const prefix of dangerousPrefixes) {
			if (normalized.startsWith(prefix)) {
				return "#";
			}
		}

		// If there is a scheme, ensure it is one of the allowed safe schemes.
		const schemeMatch = normalized.match(/^([a-z0-9+.-]+):/);
		if (schemeMatch) {
			const scheme = schemeMatch[1];
			const allowedSchemes = new Set(["http", "https", "mailto", "tel"]);
			if (!allowedSchemes.has(scheme)) {
				return "#";
			}
		}
		return url;
	};

	const updateLinkEditor = () => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) {
			const node = getSelectedNode(selection);
			const parent = node.getParent();
			if ($isLinkNode(parent)) {
				setLinkUrl(parent.getURL());
			} else if ($isLinkNode(node)) {
				setLinkUrl(node.getURL());
			} else {
				setLinkUrl("");
			}
		}
		const editorElem = editorRef;
		const nativeSelection = window.getSelection();
		const activeElement = document.activeElement;

		if (editorElem === null) {
			return;
		}

		const rootElement = props.editor.getRootElement();
		if (
			selection !== null &&
			nativeSelection &&
			!nativeSelection.isCollapsed &&
			rootElement !== null &&
			rootElement.contains(nativeSelection.anchorNode)
		) {
			const domRange = nativeSelection.getRangeAt(0);
			let rect: DOMRect;
			if (nativeSelection.anchorNode === rootElement) {
				let inner: Element = rootElement;
				while (inner.firstElementChild != null) {
					inner = inner.firstElementChild;
				}
				rect = inner.getBoundingClientRect();
			} else {
				rect = domRange.getBoundingClientRect();
			}

			positionEditorElement(editorElem, rect);
			setLastSelection(selection as RangeSelection);
		} else if (!activeElement || activeElement.className !== "link-input") {
			positionEditorElement(editorElem, null);
			setLastSelection(null);
			setEditMode(false);
			setLinkUrl("");
		}

		return true;
	};

	createEffect(() => {
		updateLinkEditor();
		onCleanup(
			mergeRegister(
				props.editor.registerUpdateListener(({ editorState }) => {
					editorState.read(() => {
						updateLinkEditor();
					});
				}),

				props.editor.registerCommand(
					SELECTION_CHANGE_COMMAND,
					() => {
						updateLinkEditor();
						return true;
					},
					LowPriority,
				),
			),
		);
	});

	createEffect(() => {
		if (isEditMode() && inputRef) {
			inputRef.focus();
		}
	});

	return (
		<div ref={editorRef} class="link-editor">
			<Show
				when={isEditMode()}
				fallback={
					<div class="link-input">
						<a href={sanitizedUrl()} target="_blank" rel="noopener noreferrer">
							{linkUrl()}
						</a>
						<button
							type="button"
							class="link-edit"
							tabIndex={0}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								setEditMode(true);
							}}
						/>
					</div>
				}
			>
				<input
					ref={inputRef}
					class="link-input"
					value={linkUrl()}
					onChange={(event) => {
						setLinkUrl(event.currentTarget.value);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							if (lastSelection() !== null) {
								if (linkUrl() !== "") {
									props.editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl());
								}
								setEditMode(false);
							}
						} else if (event.key === "Escape") {
							event.preventDefault();
							setEditMode(false);
						}
					}}
				/>
			</Show>
		</div>
	);
}

function Select(props: {
	onChange: JSX.EventHandlerUnion<HTMLSelectElement, Event>;
	class: string;
	options: string[];
	value: string;
}) {
	return (
		<select class={props.class} onChange={props.onChange} value={props.value}>
			<option hidden={true} value="" />
			<For each={props.options}>
				{(option) => <option value={option}>{option}</option>}
			</For>
		</select>
	);
}

function getSelectedNode(selection: RangeSelection) {
	const anchor = selection.anchor;
	const focus = selection.focus;
	const anchorNode = selection.anchor.getNode();
	const focusNode = selection.focus.getNode();
	if (anchorNode === focusNode) {
		return anchorNode;
	}
	const isBackward = selection.isBackward();
	if (isBackward) {
		return $isAtNodeEnd(focus) ? anchorNode : focusNode;
	} else {
		return $isAtNodeEnd(anchor) ? focusNode : anchorNode;
	}
}

function getBlockTypeIcon(blockType: string) {
	switch (blockType) {
		case "h1":
			return <IconH1 />;
		case "h2":
			return <IconH2 />;
		case "h3":
			return <IconH3 />;
		case "ul":
			return <IconBulletList />;
		case "ol":
			return <IconNumberedList />;
		case "quote":
			return <IconQuote />;
		case "code":
			return <IconCode />;
		default:
			return <IconParagraph />;
	}
}

function BlockOptionsDropdownList(props: {
	editor: LexicalEditor;
	blockType: string;
	toolbarRef: HTMLDivElement | undefined;
	setShowBlockOptionsDropDown: (val: boolean) => void;
}) {
	let dropDownRef!: HTMLDivElement;

	createEffect(() => {
		const toolbar = props.toolbarRef;
		const dropDown = dropDownRef;

		if (toolbar && dropDown) {
			const { top, left } = toolbar.getBoundingClientRect();
			dropDown.style.top = `${top + 40}px`;
			dropDown.style.left = `${left}px`;
		}
	});

	createEffect(() => {
		const dropDown = dropDownRef;
		const toolbar = props.toolbarRef;

		if (dropDown && toolbar) {
			const handle = (event: MouseEvent) => {
				const target = event.target as Node;

				if (!dropDown.contains(target) && !toolbar.contains(target)) {
					props.setShowBlockOptionsDropDown(false);
				}
			};
			document.addEventListener("click", handle);

			onCleanup(() => {
				document.removeEventListener("click", handle);
			});
		}
	});

	const formatParagraph = () => {
		if (props.blockType !== "paragraph") {
			props.editor.update(() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) {
					$setBlocksType(selection, () => $createParagraphNode());
				}
			});
		}
		props.setShowBlockOptionsDropDown(false);
	};

	const formatHeading = (headingSize: HeadingTagType) => {
		if (props.blockType !== headingSize) {
			props.editor.update(() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) {
					$setBlocksType(selection, () => $createHeadingNode(headingSize));
				}
			});
		}
		props.setShowBlockOptionsDropDown(false);
	};

	const formatBulletList = () => {
		if (props.blockType !== "ul") {
			props.editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
		} else {
			props.editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
		}
		props.setShowBlockOptionsDropDown(false);
	};

	const formatNumberedList = () => {
		if (props.blockType !== "ol") {
			props.editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
		} else {
			props.editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
		}
		props.setShowBlockOptionsDropDown(false);
	};

	const formatQuote = () => {
		if (props.blockType !== "quote") {
			props.editor.update(() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) {
					$setBlocksType(selection, () => $createQuoteNode());
				}
			});
		}
		props.setShowBlockOptionsDropDown(false);
	};

	const formatCode = () => {
		if (props.blockType !== "code") {
			props.editor.update(() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) {
					$setBlocksType(selection, () => $createCodeNode());
				}
			});
		}
		props.setShowBlockOptionsDropDown(false);
	};

	return (
		<div class="dropdown" ref={dropDownRef}>
			<button type="button" class="item" onClick={formatParagraph}>
				<span class="icon">
					<IconParagraph />
				</span>
				<span class="text">Normal</span>
				{props.blockType === "paragraph" && <span class="active" />}
			</button>
			<button type="button" class="item" onClick={() => formatHeading("h1")}>
				<span class="icon">
					<IconH1 />
				</span>
				<span class="text">Heading 1</span>
				{props.blockType === "h1" && <span class="active" />}
			</button>
			<button type="button" class="item" onClick={() => formatHeading("h2")}>
				<span class="icon">
					<IconH2 />
				</span>
				<span class="text">Heading 2</span>
				{props.blockType === "h2" && <span class="active" />}
			</button>
			<button type="button" class="item" onClick={() => formatHeading("h3")}>
				<span class="icon">
					<IconH3 />
				</span>
				<span class="text">Heading 3</span>
				{props.blockType === "h3" && <span class="active" />}
			</button>
			<button type="button" class="item" onClick={formatBulletList}>
				<span class="icon">
					<IconBulletList />
				</span>
				<span class="text">Bullet List</span>
				{props.blockType === "ul" && <span class="active" />}
			</button>
			<button type="button" class="item" onClick={formatNumberedList}>
				<span class="icon">
					<IconNumberedList />
				</span>
				<span class="text">Numbered List</span>
				{props.blockType === "ol" && <span class="active" />}
			</button>
			<button type="button" class="item" onClick={formatQuote}>
				<span class="icon">
					<IconQuote />
				</span>
				<span class="text">Quote</span>
				{props.blockType === "quote" && <span class="active" />}
			</button>
			<button type="button" class="item" onClick={formatCode}>
				<span class="icon">
					<IconCode />
				</span>
				<span class="text">Code Block</span>
				{props.blockType === "code" && <span class="active" />}
			</button>
		</div>
	);
}

export default function ToolbarPlugin() {
	const [editor] = useLexicalComposerContext();
	const [toolbarRef, setToolbarRef] = createSignal<
		HTMLDivElement | undefined
	>();
	const [canUndo, setCanUndo] = createSignal(false);
	const [canRedo, setCanRedo] = createSignal(false);
	const [blockType, setBlockType] = createSignal("paragraph");
	const [selectedElementKey, setSelectedElementKey] = createSignal<
		string | null
	>(null);
	const [showBlockOptionsDropDown, setShowBlockOptionsDropDown] =
		createSignal(false);
	const [codeLanguage, setCodeLanguage] = createSignal("");
	const [isLink, setIsLink] = createSignal(false);
	const [isBold, setIsBold] = createSignal(false);
	const [isItalic, setIsItalic] = createSignal(false);
	const [isUnderline, setIsUnderline] = createSignal(false);
	const [isStrikethrough, setIsStrikethrough] = createSignal(false);
	const [isCode, setIsCode] = createSignal(false);

	const updateToolbar = () => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) {
			const anchorNode = selection.anchor.getNode();
			const element =
				anchorNode.getKey() === "root"
					? anchorNode
					: anchorNode.getTopLevelElement();

			if (element === null) return;

			const elementKey = element.getKey();
			const elementDOM = editor.getElementByKey(elementKey);
			if (elementDOM !== null) {
				setSelectedElementKey(elementKey);
				if ($isListNode(element)) {
					const parentList = $getNearestNodeOfType(anchorNode, ListNode);
					const type = parentList
						? parentList.getListType()
						: element.getListType();
					setBlockType(type === "bullet" ? "ul" : "ol");
				} else {
					const type = $isHeadingNode(element)
						? element.getTag()
						: element.getType();
					setBlockType(type);
					if ($isCodeNode(element)) {
						setCodeLanguage(element.getLanguage() || getDefaultCodeLanguage());
					}
				}
			}
			// Update text format
			setIsBold(selection.hasFormat("bold"));
			setIsItalic(selection.hasFormat("italic"));
			setIsUnderline(selection.hasFormat("underline"));
			setIsStrikethrough(selection.hasFormat("strikethrough"));
			setIsCode(selection.hasFormat("code"));

			// Update links
			const node = getSelectedNode(selection);
			const parent = node.getParent();
			if ($isLinkNode(parent) || $isLinkNode(node)) {
				setIsLink(true);
			} else {
				setIsLink(false);
			}
		}
	};

	onMount(() => {
		onCleanup(
			mergeRegister(
				editor.registerUpdateListener(({ editorState }) => {
					editorState.read(() => {
						updateToolbar();
					});
				}),
				editor.registerCommand(
					SELECTION_CHANGE_COMMAND,
					() => {
						updateToolbar();
						return false;
					},
					LowPriority,
				),
				editor.registerCommand(
					CAN_UNDO_COMMAND,
					(payload: boolean) => {
						setCanUndo(payload);
						return false;
					},
					LowPriority,
				),
				editor.registerCommand(
					CAN_REDO_COMMAND,
					(payload: boolean) => {
						setCanRedo(payload);
						return false;
					},
					LowPriority,
				),
			),
		);
	});

	const codeLanguges = createMemo(() => getCodeLanguages());
	const onCodeLanguageSelect = (e: Event) => {
		const target = e.target as HTMLSelectElement;
		editor.update(() => {
			const key = selectedElementKey();
			if (key !== null) {
				const node = $getNodeByKey(key);
				if ($isCodeNode(node)) {
					node.setLanguage(target.value);
				}
			}
		});
	};

	const insertLink = () => {
		if (!isLink()) {
			editor.dispatchCommand(TOGGLE_LINK_COMMAND, "https://");
		} else {
			editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
		}
	};

	return (
		<div class="toolbar" ref={setToolbarRef}>
			<button
				type="button"
				disabled={!canUndo()}
				onClick={() => {
					editor.dispatchCommand(UNDO_COMMAND, undefined);
				}}
				class="toolbar-item spaced"
				aria-label="Undo"
				title="Undo"
			>
				<IconUndo />
			</button>
			<button
				type="button"
				disabled={!canRedo()}
				onClick={() => {
					editor.dispatchCommand(REDO_COMMAND, undefined);
				}}
				class="toolbar-item"
				aria-label="Redo"
				title="Redo"
			>
				<IconRedo />
			</button>
			<Divider />
			<Show when={supportedBlockTypes.has(blockType())}>
				<button
					type="button"
					class="toolbar-item block-controls"
					onClick={() =>
						setShowBlockOptionsDropDown(!showBlockOptionsDropDown())
					}
					aria-label="Formatting Options"
				>
					<span class="icon">{getBlockTypeIcon(blockType())}</span>
					<span class="text">
						{blockTypeToBlockName[blockType()] || "Normal"}
					</span>
					<IconChevronDown />
				</button>
				<Show when={showBlockOptionsDropDown()}>
					<Portal>
						<BlockOptionsDropdownList
							editor={editor}
							blockType={blockType()}
							toolbarRef={toolbarRef()}
							setShowBlockOptionsDropDown={setShowBlockOptionsDropDown}
						/>
					</Portal>
				</Show>
				<Divider />
			</Show>
			<Show when={blockType() === "code"}>
				<Select
					class="toolbar-item code-language"
					onChange={onCodeLanguageSelect}
					options={codeLanguges()}
					value={codeLanguage()}
				/>
				<Divider />
			</Show>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
				}}
				class={`toolbar-item spaced ${isBold() ? "active" : ""}`}
				aria-label="Format Bold"
				title="Bold"
			>
				<IconBold />
			</button>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
				}}
				class={`toolbar-item spaced ${isItalic() ? "active" : ""}`}
				aria-label="Format Italics"
				title="Italic"
			>
				<IconItalic />
			</button>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
				}}
				class={`toolbar-item spaced ${isUnderline() ? "active" : ""}`}
				aria-label="Format Underline"
				title="Underline"
			>
				<IconUnderline />
			</button>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
				}}
				class={`toolbar-item spaced ${isStrikethrough() ? "active" : ""}`}
				aria-label="Format Strikethrough"
				title="Strikethrough"
			>
				<IconStrikethrough />
			</button>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
				}}
				class={`toolbar-item spaced ${isCode() ? "active" : ""}`}
				aria-label="Insert Code"
				title="Code"
			>
				<IconCode />
			</button>
			<button
				type="button"
				onClick={insertLink}
				class={`toolbar-item spaced ${isLink() ? "active" : ""}`}
				aria-label="Insert Link"
				title="Link"
			>
				<IconLink />
			</button>
			<Show when={isLink()}>
				<Portal>
					<FloatingLinkEditor editor={editor} />
				</Portal>
			</Show>
			<Divider />
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left");
				}}
				class="toolbar-item spaced"
				aria-label="Left Align"
				title="Align Left"
			>
				<IconAlignLeft />
			</button>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center");
				}}
				class="toolbar-item spaced"
				aria-label="Center Align"
				title="Align Center"
			>
				<IconAlignCenter />
			</button>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right");
				}}
				class="toolbar-item spaced"
				aria-label="Right Align"
				title="Align Right"
			>
				<IconAlignRight />
			</button>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "justify");
				}}
				class="toolbar-item spaced"
				aria-label="Justify Align"
				title="Justify"
			>
				<IconAlignJustify />
			</button>
			<Divider />
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
				}}
				class="toolbar-item spaced"
				aria-label="Insert Horizontal Rule"
				title="Horizontal Rule"
			>
				<IconHorizontalRule />
			</button>
			<button
				type="button"
				onClick={() => {
					const src = prompt("Enter image URL:");
					if (src) {
						editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
							src,
							altText: "Image",
						});
					}
				}}
				class="toolbar-item spaced"
				aria-label="Insert Image"
				title="Insert Image"
			>
				<IconImage />
			</button>
			<button
				type="button"
				onClick={() => {
					editor.dispatchCommand(INSERT_TABLE_COMMAND, {
						columns: "3",
						rows: "3",
						includeHeaders: true,
					});
				}}
				class="toolbar-item"
				aria-label="Insert Table"
				title="Insert Table"
			>
				<IconTable />
			</button>
		</div>
	);
}
