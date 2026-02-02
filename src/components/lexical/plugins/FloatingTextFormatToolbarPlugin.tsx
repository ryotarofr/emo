import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $isAtNodeEnd } from "@lexical/selection";
import { mergeRegister } from "@lexical/utils";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	COMMAND_PRIORITY_LOW,
	FORMAT_TEXT_COMMAND,
	type LexicalEditor,
	SELECTION_CHANGE_COMMAND,
} from "lexical";
import {
	createEffect,
	createSignal,
	type JSX,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { Portal } from "solid-js/web";

// Icons
function IconBold() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
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
			width="16"
			height="16"
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
			width="16"
			height="16"
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
			width="16"
			height="16"
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
			width="16"
			height="16"
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
			width="16"
			height="16"
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

function IconSubscript() {
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
			<path d="m4 5 8 8" />
			<path d="m12 5-8 8" />
			<path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07" />
		</svg>
	);
}

function IconSuperscript() {
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
			<path d="m4 19 8-8" />
			<path d="m12 19-8-8" />
			<path d="M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06" />
		</svg>
	);
}

function getSelectedNode(selection: any) {
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

function setFloatingElemPosition(
	targetRect: DOMRect | null,
	floatingElem: HTMLElement,
	anchorElem: HTMLElement,
): void {
	const scrollerElem = anchorElem.parentElement;

	if (targetRect === null || !scrollerElem) {
		floatingElem.style.opacity = "0";
		floatingElem.style.transform = "translate(-10000px, -10000px)";
		return;
	}

	const floatingElemRect = floatingElem.getBoundingClientRect();
	const anchorElementRect = anchorElem.getBoundingClientRect();

	let top = targetRect.top - floatingElemRect.height - 10 + window.scrollY;
	let left =
		targetRect.left -
		anchorElementRect.left +
		(targetRect.width - floatingElemRect.width) / 2;

	// Ensure it stays within bounds
	if (left < 0) {
		left = 0;
	}
	if (top < anchorElementRect.top + window.scrollY) {
		top = targetRect.bottom + 10 + window.scrollY;
	}

	floatingElem.style.opacity = "1";
	floatingElem.style.transform = `translate(${left}px, ${top}px)`;
}

function TextFormatFloatingToolbar(props: {
	editor: LexicalEditor;
	anchorElem: HTMLElement;
	isBold: boolean;
	isItalic: boolean;
	isUnderline: boolean;
	isStrikethrough: boolean;
	isCode: boolean;
	isLink: boolean;
	isSubscript: boolean;
	isSuperscript: boolean;
}) {
	let popupRef: HTMLDivElement | undefined;

	const insertLink = () => {
		if (!props.isLink) {
			props.editor.dispatchCommand(TOGGLE_LINK_COMMAND, "https://");
		} else {
			props.editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
		}
	};

	const updatePosition = () => {
		const selection = $getSelection();
		const nativeSelection = window.getSelection();
		const rootElement = props.editor.getRootElement();

		if (
			!popupRef ||
			!nativeSelection ||
			!rootElement ||
			!$isRangeSelection(selection) ||
			nativeSelection.isCollapsed
		) {
			return;
		}

		const rangeRect = getDOMRangeRect(nativeSelection, rootElement);
		setFloatingElemPosition(rangeRect, popupRef, props.anchorElem);
	};

	onMount(() => {
		// Initial position update
		props.editor.getEditorState().read(() => {
			updatePosition();
		});

		// Register listener for updates
		const unregister = props.editor.registerUpdateListener(
			({ editorState }) => {
				editorState.read(() => {
					updatePosition();
				});
			},
		);

		onCleanup(() => {
			unregister();
		});
	});

	return (
		<div ref={popupRef} class="floating-text-format-popup">
			<button
				type="button"
				onClick={() => {
					props.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
				}}
				class={"popup-item " + (props.isBold ? "active" : "")}
				title="Bold"
				aria-label="Format bold"
			>
				<IconBold />
			</button>
			<button
				type="button"
				onClick={() => {
					props.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
				}}
				class={"popup-item " + (props.isItalic ? "active" : "")}
				title="Italic"
				aria-label="Format italic"
			>
				<IconItalic />
			</button>
			<button
				type="button"
				onClick={() => {
					props.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
				}}
				class={"popup-item " + (props.isUnderline ? "active" : "")}
				title="Underline"
				aria-label="Format underline"
			>
				<IconUnderline />
			</button>
			<button
				type="button"
				onClick={() => {
					props.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
				}}
				class={"popup-item " + (props.isStrikethrough ? "active" : "")}
				title="Strikethrough"
				aria-label="Format strikethrough"
			>
				<IconStrikethrough />
			</button>
			<button
				type="button"
				onClick={() => {
					props.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript");
				}}
				class={"popup-item " + (props.isSubscript ? "active" : "")}
				title="Subscript"
				aria-label="Format subscript"
			>
				<IconSubscript />
			</button>
			<button
				type="button"
				onClick={() => {
					props.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript");
				}}
				class={"popup-item " + (props.isSuperscript ? "active" : "")}
				title="Superscript"
				aria-label="Format superscript"
			>
				<IconSuperscript />
			</button>
			<button
				type="button"
				onClick={() => {
					props.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
				}}
				class={"popup-item " + (props.isCode ? "active" : "")}
				title="Code"
				aria-label="Format code"
			>
				<IconCode />
			</button>
			<button
				type="button"
				onClick={insertLink}
				class={"popup-item " + (props.isLink ? "active" : "")}
				title="Link"
				aria-label="Insert link"
			>
				<IconLink />
			</button>
		</div>
	);
}

function getDOMRangeRect(
	nativeSelection: Selection,
	rootElement: HTMLElement,
): DOMRect {
	const domRange = nativeSelection.getRangeAt(0);

	let rect: DOMRect;

	if (nativeSelection.anchorNode === rootElement) {
		let inner = rootElement;
		while (inner.firstElementChild != null) {
			inner = inner.firstElementChild as HTMLElement;
		}
		rect = inner.getBoundingClientRect();
	} else {
		rect = domRange.getBoundingClientRect();
	}

	return rect;
}

function useFloatingTextFormatToolbar(
	editor: LexicalEditor,
	anchorElem: HTMLElement,
): JSX.Element | null {
	const [isText, setIsText] = createSignal(false);
	const [isLink, setIsLink] = createSignal(false);
	const [isBold, setIsBold] = createSignal(false);
	const [isItalic, setIsItalic] = createSignal(false);
	const [isUnderline, setIsUnderline] = createSignal(false);
	const [isStrikethrough, setIsStrikethrough] = createSignal(false);
	const [isSubscript, setIsSubscript] = createSignal(false);
	const [isSuperscript, setIsSuperscript] = createSignal(false);
	const [isCode, setIsCode] = createSignal(false);

	const updatePopup = () => {
		editor.getEditorState().read(() => {
			const selection = $getSelection();
			const nativeSelection = window.getSelection();
			const rootElement = editor.getRootElement();

			if (
				nativeSelection !== null &&
				(!$isRangeSelection(selection) ||
					rootElement === null ||
					!rootElement.contains(nativeSelection.anchorNode))
			) {
				setIsText(false);
				return;
			}

			if (!$isRangeSelection(selection)) {
				return;
			}

			const node = getSelectedNode(selection);

			// Update text format
			setIsBold(selection.hasFormat("bold"));
			setIsItalic(selection.hasFormat("italic"));
			setIsUnderline(selection.hasFormat("underline"));
			setIsStrikethrough(selection.hasFormat("strikethrough"));
			setIsSubscript(selection.hasFormat("subscript"));
			setIsSuperscript(selection.hasFormat("superscript"));
			setIsCode(selection.hasFormat("code"));

			// Update links
			const parent = node.getParent();
			if ($isLinkNode(parent) || $isLinkNode(node)) {
				setIsLink(true);
			} else {
				setIsLink(false);
			}

			if (
				!$isCodeNode(selection.anchor.getNode()) &&
				selection.getTextContent() !== ""
			) {
				setIsText($isTextNode(node) || $isLinkNode(node));
			} else {
				setIsText(false);
			}
		});
	};

	createEffect(() => {
		document.addEventListener("selectionchange", updatePopup);
		onCleanup(() => {
			document.removeEventListener("selectionchange", updatePopup);
		});
	});

	createEffect(() => {
		onCleanup(
			mergeRegister(
				editor.registerUpdateListener(() => {
					updatePopup();
				}),
				editor.registerCommand(
					SELECTION_CHANGE_COMMAND,
					() => {
						updatePopup();
						return false;
					},
					COMMAND_PRIORITY_LOW,
				),
			),
		);
	});

	return (
		<Show when={isText()}>
			<Portal>
				<TextFormatFloatingToolbar
					editor={editor}
					anchorElem={anchorElem}
					isBold={isBold()}
					isItalic={isItalic()}
					isUnderline={isUnderline()}
					isStrikethrough={isStrikethrough()}
					isCode={isCode()}
					isLink={isLink()}
					isSubscript={isSubscript()}
					isSuperscript={isSuperscript()}
				/>
			</Portal>
		</Show>
	);
}

function $isCodeNode(node: any): boolean {
	return node?.getType?.() === "code";
}

export default function FloatingTextFormatToolbarPlugin(props: {
	anchorElem?: HTMLElement;
}): JSX.Element | null {
	const [editor] = useLexicalComposerContext();
	const anchorElem = props.anchorElem || document.body;

	return useFloatingTextFormatToolbar(editor, anchorElem);
}
