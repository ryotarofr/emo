import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import {
	$createParagraphNode,
	$getNodeByKey,
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_EDITOR,
	COMMAND_PRIORITY_LOW,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	KEY_ARROW_UP_COMMAND,
	KEY_BACKSPACE_COMMAND,
	type NodeKey,
} from "lexical";
import { type JSX, onCleanup, onMount } from "solid-js";
import {
	$createCollapsibleContainerNode,
	$createCollapsibleContentNode,
	$createCollapsibleTitleNode,
	$isCollapsibleContainerNode,
	$isCollapsibleContentNode,
	$isCollapsibleTitleNode,
	CollapsibleContainerNode,
	CollapsibleContentNode,
	CollapsibleTitleNode,
	INSERT_COLLAPSIBLE_COMMAND,
	TOGGLE_COLLAPSIBLE_COMMAND,
} from "../nodes/CollapsibleNodes";

export default function CollapsiblePlugin(): JSX.Element | null {
	const [editor] = useLexicalComposerContext();

	onMount(() => {
		if (
			!editor.hasNodes([
				CollapsibleContainerNode,
				CollapsibleTitleNode,
				CollapsibleContentNode,
			])
		) {
			throw new Error(
				"CollapsiblePlugin: CollapsibleContainerNode, CollapsibleTitleNode, or CollapsibleContentNode not registered on editor",
			);
		}

		onCleanup(
			mergeRegister(
				// Handle insert collapsible command
				editor.registerCommand(
					INSERT_COLLAPSIBLE_COMMAND,
					() => {
						editor.update(() => {
							const selection = $getSelection();

							if (!$isRangeSelection(selection)) {
								return;
							}

							const title = $createCollapsibleTitleNode();
							const paragraph = $createParagraphNode();
							title.append(paragraph);

							const content = $createCollapsibleContentNode();
							const contentParagraph = $createParagraphNode();
							content.append(contentParagraph);

							const container = $createCollapsibleContainerNode(true);
							container.append(title);
							container.append(content);

							selection.insertNodes([container]);
							paragraph.select();
						});

						return true;
					},
					COMMAND_PRIORITY_EDITOR,
				),

				// Handle toggle collapsible command
				editor.registerCommand(
					TOGGLE_COLLAPSIBLE_COMMAND,
					(key: NodeKey) => {
						editor.update(() => {
							const node = $getNodeByKey(key);
							if ($isCollapsibleContainerNode(node)) {
								node.toggleOpen();
							}
						});

						return true;
					},
					COMMAND_PRIORITY_EDITOR,
				),

				// Handle arrow navigation
				editor.registerCommand(
					KEY_ARROW_DOWN_COMMAND,
					(event) => {
						const selection = $getSelection();
						if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
							return false;
						}

						const node = selection.anchor.getNode();
						const container = $findMatchingParent(
							node,
							$isCollapsibleContainerNode,
						);

						if (!container) {
							return false;
						}

						// When closed, skip to next sibling
						if (!container.getOpen()) {
							let sibling = container.getNextSibling();
							// If no next sibling, create a new paragraph after the container
							if (!sibling) {
								const newParagraph = $createParagraphNode();
								container.insertAfter(newParagraph);
								sibling = newParagraph;
							}
							sibling.selectStart();
							event?.preventDefault();
							return true;
						}

						// When open: navigate from title to content
						const title = $findMatchingParent(node, $isCollapsibleTitleNode);
						if (title) {
							const content = title.getNextSibling();
							if ($isCollapsibleContentNode(content)) {
								content.selectStart();
								event?.preventDefault();
								return true;
							}
						}

						// When open: navigate from content to next sibling outside container
						const content = $findMatchingParent(
							node,
							$isCollapsibleContentNode,
						);
						if (content) {
							const lastChild = content.getLastChild();
							const anchorNode = selection.anchor.getNode();
							// Check if at the end of content
							if (
								lastChild &&
								(anchorNode === lastChild || lastChild.isParentOf(anchorNode))
							) {
								let sibling = container.getNextSibling();
								// If no next sibling, create a new paragraph after the container
								if (!sibling) {
									const newParagraph = $createParagraphNode();
									container.insertAfter(newParagraph);
									sibling = newParagraph;
								}
								sibling.selectStart();
								event?.preventDefault();
								return true;
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				editor.registerCommand(
					KEY_ARROW_UP_COMMAND,
					(event) => {
						const selection = $getSelection();
						if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
							return false;
						}

						const node = selection.anchor.getNode();
						const container = $findMatchingParent(
							node,
							$isCollapsibleContainerNode,
						);

						if (!container) {
							return false;
						}

						// When closed, skip to previous sibling
						if (!container.getOpen()) {
							const sibling = container.getPreviousSibling();
							if (sibling) {
								sibling.selectEnd();
								event?.preventDefault();
								return true;
							}
							return false;
						}

						// When open: navigate from content to title
						const content = $findMatchingParent(
							node,
							$isCollapsibleContentNode,
						);
						if (content) {
							const firstChild = content.getFirstChild();
							const anchorNode = selection.anchor.getNode();
							// Check if at the beginning of content
							if (
								firstChild &&
								(anchorNode === firstChild ||
									firstChild.isParentOf(anchorNode)) &&
								selection.anchor.offset === 0
							) {
								const title = content.getPreviousSibling();
								if ($isCollapsibleTitleNode(title)) {
									title.selectEnd();
									event?.preventDefault();
									return true;
								}
							}
						}

						// When open: navigate from title to previous sibling outside container
						const title = $findMatchingParent(node, $isCollapsibleTitleNode);
						if (title && selection.anchor.offset === 0) {
							const sibling = container.getPreviousSibling();
							if (sibling) {
								sibling.selectEnd();
								event?.preventDefault();
								return true;
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				editor.registerCommand(
					KEY_ARROW_LEFT_COMMAND,
					(event) => {
						const selection = $getSelection();
						if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
							return false;
						}

						const node = selection.anchor.getNode();
						const title = $findMatchingParent(node, $isCollapsibleTitleNode);

						if (title && selection.anchor.offset === 0) {
							const container = title.getParent();
							if ($isCollapsibleContainerNode(container)) {
								container.setOpen(false);
								event?.preventDefault();
								return true;
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				editor.registerCommand(
					KEY_ARROW_RIGHT_COMMAND,
					(event) => {
						const selection = $getSelection();
						if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
							return false;
						}

						const node = selection.anchor.getNode();
						const title = $findMatchingParent(node, $isCollapsibleTitleNode);

						if (title) {
							const container = title.getParent();
							if (
								$isCollapsibleContainerNode(container) &&
								!container.getOpen()
							) {
								container.setOpen(true);
								event?.preventDefault();
								return true;
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				// Handle backspace in collapsible
				editor.registerCommand(
					KEY_BACKSPACE_COMMAND,
					(event) => {
						const selection = $getSelection();
						if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
							return false;
						}

						const node = selection.anchor.getNode();
						const container = $findMatchingParent(
							node,
							$isCollapsibleContainerNode,
						);

						if (!container) {
							return false;
						}

						// Check if in title
						const title = $findMatchingParent(node, $isCollapsibleTitleNode);
						if (title) {
							// Check if title is empty (only has empty paragraph or no text)
							const titleTextContent = title.getTextContent();
							if (
								titleTextContent.length === 0 &&
								selection.anchor.offset === 0
							) {
								// Delete entire collapsible when title is empty
								// Get parent and siblings BEFORE removing the container
								const parent = container.getParent();
								const prevSibling = container.getPreviousSibling();
								container.remove();
								if (prevSibling) {
									prevSibling.selectEnd();
								} else if (parent) {
									// Create a new paragraph if no previous sibling
									const newParagraph = $createParagraphNode();
									parent.append(newParagraph);
									newParagraph.select();
								}
								event?.preventDefault();
								return true;
							}
							// Otherwise, let default backspace behavior handle it
							return false;
						}

						// Check if in content
						const content = $findMatchingParent(
							node,
							$isCollapsibleContentNode,
						);
						if (content) {
							const firstChild = content.getFirstChild();
							const anchorNode = selection.anchor.getNode();

							// Check if at the very beginning of content
							if (
								selection.anchor.offset === 0 &&
								firstChild &&
								(anchorNode === firstChild || firstChild.isParentOf(anchorNode))
							) {
								// Move to title instead of deleting the line
								const titleNode = content.getPreviousSibling();
								if ($isCollapsibleTitleNode(titleNode)) {
									titleNode.selectEnd();
									event?.preventDefault();
									return true;
								}
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),
			),
		);
	});

	return null;
}
