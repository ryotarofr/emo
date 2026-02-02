import { mergeRegister } from "@lexical/utils";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import {
	$createParagraphNode,
	$getSelection,
	$isElementNode,
	$isRangeSelection,
	COMMAND_PRIORITY_EDITOR,
	COMMAND_PRIORITY_LOW,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	KEY_ARROW_UP_COMMAND,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
} from "lexical";
import { type JSX, onCleanup, onMount } from "solid-js";
import {
	$createLayoutContainerNode,
	$createLayoutItemNode,
	$isLayoutContainerNode,
	$isLayoutItemNode,
	INSERT_LAYOUT_COMMAND,
	LAYOUT_TEMPLATES,
	LayoutContainerNode,
	LayoutItemNode,
	type LayoutTemplate,
} from "../nodes/LayoutNodes";

function $isAtLayoutBoundary(direction: "up" | "down" | "left" | "right"): {
	atBoundary: boolean;
	layoutContainer: LayoutContainerNode | null;
	layoutItem: LayoutItemNode | null;
} {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
		return { atBoundary: false, layoutContainer: null, layoutItem: null };
	}

	const anchorNode = selection.anchor.getNode();

	// Find the layout item and container
	let currentNode = anchorNode;
	let layoutItem: LayoutItemNode | null = null;
	let layoutContainer: LayoutContainerNode | null = null;

	while (currentNode) {
		if ($isLayoutItemNode(currentNode)) {
			layoutItem = currentNode;
		}
		if ($isLayoutContainerNode(currentNode)) {
			layoutContainer = currentNode;
			break;
		}
		const parent = currentNode.getParent();
		if (!parent) break;
		currentNode = parent;
	}

	if (!layoutItem || !layoutContainer) {
		return { atBoundary: false, layoutContainer: null, layoutItem: null };
	}

	// Check if we're at the boundary of the layout item
	const anchor = selection.anchor;
	const focusNode = anchor.getNode();

	if (direction === "down") {
		// Check if we're at the last position in the layout item
		const lastChild = layoutItem.getLastDescendant();
		if (lastChild) {
			const lastChildKey = lastChild.getKey();
			if (anchor.key === lastChildKey || focusNode.getKey() === lastChildKey) {
				// Check if we're at the end of the content
				if (
					anchor.type === "text" &&
					anchor.offset === focusNode.getTextContentSize()
				) {
					return { atBoundary: true, layoutContainer, layoutItem };
				}
				if (anchor.type === "element") {
					return { atBoundary: true, layoutContainer, layoutItem };
				}
			}
		}
	} else if (direction === "up") {
		// Check if we're at the first position in the layout item
		const firstChild = layoutItem.getFirstDescendant();
		if (firstChild) {
			const firstChildKey = firstChild.getKey();
			if (
				anchor.key === firstChildKey ||
				focusNode.getKey() === firstChildKey
			) {
				if (anchor.offset === 0) {
					return { atBoundary: true, layoutContainer, layoutItem };
				}
			}
		}
	}

	return { atBoundary: false, layoutContainer, layoutItem };
}

function $isLayoutItemEmpty(layoutItem: LayoutItemNode): boolean {
	const children = layoutItem.getChildren();
	if (children.length === 0) return true;
	if (children.length === 1) {
		const child = children[0];
		if ($isElementNode(child) && child.getTextContentSize() === 0) {
			return true;
		}
	}
	return false;
}

function $areAllLayoutItemsEmpty(
	layoutContainer: LayoutContainerNode,
): boolean {
	const children = layoutContainer.getChildren();
	for (const child of children) {
		if ($isLayoutItemNode(child) && !$isLayoutItemEmpty(child)) {
			return false;
		}
	}
	return true;
}

function isTypeaheadMenuOpen(): boolean {
	return document.getElementById("typeahead-menu") !== null;
}

function $getLayoutContext(): {
	layoutContainer: LayoutContainerNode | null;
	layoutItem: LayoutItemNode | null;
	isAtStart: boolean;
	isAtEnd: boolean;
} {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
		return {
			layoutContainer: null,
			layoutItem: null,
			isAtStart: false,
			isAtEnd: false,
		};
	}

	const anchor = selection.anchor;
	const anchorNode = anchor.getNode();

	// Find the layout item and container
	let currentNode = anchorNode;
	let layoutItem: LayoutItemNode | null = null;
	let layoutContainer: LayoutContainerNode | null = null;

	while (currentNode) {
		if ($isLayoutItemNode(currentNode)) {
			layoutItem = currentNode;
		}
		if ($isLayoutContainerNode(currentNode)) {
			layoutContainer = currentNode;
			break;
		}
		const parent = currentNode.getParent();
		if (!parent) break;
		currentNode = parent;
	}

	if (!layoutItem || !layoutContainer) {
		return {
			layoutContainer: null,
			layoutItem: null,
			isAtStart: false,
			isAtEnd: false,
		};
	}

	// Check if at start
	let isAtStart = false;
	const firstDescendant = layoutItem.getFirstDescendant();
	if (firstDescendant) {
		if (
			anchorNode === firstDescendant ||
			anchor.key === firstDescendant.getKey()
		) {
			if (anchor.offset === 0) {
				isAtStart = true;
			}
		}
	}

	// Check if at end
	let isAtEnd = false;
	const lastDescendant = layoutItem.getLastDescendant();
	if (lastDescendant) {
		if (
			anchorNode === lastDescendant ||
			anchor.key === lastDescendant.getKey()
		) {
			if (
				anchor.type === "text" &&
				anchor.offset === anchorNode.getTextContentSize()
			) {
				isAtEnd = true;
			} else if (anchor.type === "element") {
				isAtEnd = true;
			}
		}
	}

	return { layoutContainer, layoutItem, isAtStart, isAtEnd };
}

export default function LayoutPlugin(): JSX.Element | null {
	const [editor] = useLexicalComposerContext();

	onMount(() => {
		if (!editor.hasNodes([LayoutContainerNode, LayoutItemNode])) {
			throw new Error(
				"LayoutPlugin: LayoutContainerNode or LayoutItemNode not registered on editor",
			);
		}

		onCleanup(
			mergeRegister(
				editor.registerCommand(
					INSERT_LAYOUT_COMMAND,
					(template: LayoutTemplate) => {
						editor.update(() => {
							const selection = $getSelection();

							if (!$isRangeSelection(selection)) {
								return;
							}

							const templateColumns = LAYOUT_TEMPLATES[template];
							const columnCount = templateColumns.split(" ").length;

							const container = $createLayoutContainerNode(templateColumns);

							for (let i = 0; i < columnCount; i++) {
								const item = $createLayoutItemNode();
								const paragraph = $createParagraphNode();
								item.append(paragraph);
								container.append(item);
							}

							selection.insertNodes([container]);

							// Select the first paragraph in the first item
							const firstItem = container.getFirstChild();
							if (firstItem && $isElementNode(firstItem)) {
								const firstParagraph = firstItem.getFirstChild();
								if (firstParagraph && $isElementNode(firstParagraph)) {
									firstParagraph.select();
								}
							}
						});

						return true;
					},
					COMMAND_PRIORITY_EDITOR,
				),

				// Handle down arrow to exit layout
				editor.registerCommand(
					KEY_ARROW_DOWN_COMMAND,
					(event) => {
						// Skip if typeahead menu is open (let the menu handle arrow keys)
						if (isTypeaheadMenuOpen()) {
							return false;
						}

						const { atBoundary, layoutContainer } = $isAtLayoutBoundary("down");

						if (atBoundary && layoutContainer) {
							const nextSibling = layoutContainer.getNextSibling();

							if (nextSibling) {
								event.preventDefault();
								if ($isElementNode(nextSibling)) {
									const firstChild = nextSibling.getFirstDescendant();
									if (firstChild) {
										firstChild.selectStart();
									} else {
										nextSibling.selectStart();
									}
								} else {
									nextSibling.selectNext();
								}
								return true;
							} else {
								// Create a new paragraph after the layout
								event.preventDefault();
								const paragraph = $createParagraphNode();
								layoutContainer.insertAfter(paragraph);
								paragraph.select();
								return true;
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				// Handle up arrow to exit layout
				editor.registerCommand(
					KEY_ARROW_UP_COMMAND,
					(event) => {
						// Skip if typeahead menu is open (let the menu handle arrow keys)
						if (isTypeaheadMenuOpen()) {
							return false;
						}

						const { atBoundary, layoutContainer } = $isAtLayoutBoundary("up");

						if (atBoundary && layoutContainer) {
							const prevSibling = layoutContainer.getPreviousSibling();

							if (prevSibling) {
								event.preventDefault();
								if ($isElementNode(prevSibling)) {
									const lastChild = prevSibling.getLastDescendant();
									if (lastChild) {
										lastChild.selectEnd();
									} else {
										prevSibling.selectEnd();
									}
								} else {
									prevSibling.selectPrevious();
								}
								return true;
							} else {
								// Create a new paragraph before the layout
								event.preventDefault();
								const paragraph = $createParagraphNode();
								layoutContainer.insertBefore(paragraph);
								paragraph.select();
								return true;
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				// Handle right arrow to move between layout items
				editor.registerCommand(
					KEY_ARROW_RIGHT_COMMAND,
					(event) => {
						// Skip if typeahead menu is open (let the menu handle arrow keys)
						if (isTypeaheadMenuOpen()) {
							return false;
						}

						const selection = $getSelection();
						if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
							return false;
						}

						const anchor = selection.anchor;
						const anchorNode = anchor.getNode();

						// Check if at end of text
						if (
							anchor.type === "text" &&
							anchor.offset < anchorNode.getTextContentSize()
						) {
							return false;
						}

						// Find layout item
						let currentNode = anchorNode;
						let layoutItem: LayoutItemNode | null = null;

						while (currentNode) {
							if ($isLayoutItemNode(currentNode)) {
								layoutItem = currentNode;
								break;
							}
							const parent = currentNode.getParent();
							if (!parent) break;
							currentNode = parent;
						}

						if (layoutItem) {
							const lastDescendant = layoutItem.getLastDescendant();
							if (
								lastDescendant &&
								(anchorNode === lastDescendant ||
									anchor.key === lastDescendant.getKey())
							) {
								const nextItem = layoutItem.getNextSibling();
								if (nextItem && $isLayoutItemNode(nextItem)) {
									event.preventDefault();
									const firstChild = nextItem.getFirstDescendant();
									if (firstChild) {
										firstChild.selectStart();
									}
									return true;
								}
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				// Handle left arrow to move between layout items
				editor.registerCommand(
					KEY_ARROW_LEFT_COMMAND,
					(event) => {
						// Skip if typeahead menu is open (let the menu handle arrow keys)
						if (isTypeaheadMenuOpen()) {
							return false;
						}

						const selection = $getSelection();
						if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
							return false;
						}

						const anchor = selection.anchor;
						const anchorNode = anchor.getNode();

						// Check if at start of text
						if (anchor.offset > 0) {
							return false;
						}

						// Find layout item
						let currentNode = anchorNode;
						let layoutItem: LayoutItemNode | null = null;

						while (currentNode) {
							if ($isLayoutItemNode(currentNode)) {
								layoutItem = currentNode;
								break;
							}
							const parent = currentNode.getParent();
							if (!parent) break;
							currentNode = parent;
						}

						if (layoutItem) {
							const firstDescendant = layoutItem.getFirstDescendant();
							if (
								firstDescendant &&
								(anchorNode === firstDescendant ||
									anchor.key === firstDescendant.getKey())
							) {
								const prevItem = layoutItem.getPreviousSibling();
								if (prevItem && $isLayoutItemNode(prevItem)) {
									event.preventDefault();
									const lastChild = prevItem.getLastDescendant();
									if (lastChild) {
										lastChild.selectEnd();
									}
									return true;
								}
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				// Handle backspace to delete layout or exit
				editor.registerCommand(
					KEY_BACKSPACE_COMMAND,
					(event) => {
						const { layoutContainer, layoutItem, isAtStart } =
							$getLayoutContext();

						if (!layoutContainer || !layoutItem) {
							return false;
						}

						// Check if we're at the start of the layout item
						if (isAtStart) {
							const isFirstItem = layoutItem.getPreviousSibling() === null;
							const isEmpty = $isLayoutItemEmpty(layoutItem);
							const allEmpty = $areAllLayoutItemsEmpty(layoutContainer);

							// If all items are empty, delete the entire layout
							if (allEmpty) {
								event.preventDefault();
								const paragraph = $createParagraphNode();
								layoutContainer.insertBefore(paragraph);
								layoutContainer.remove();
								paragraph.select();
								return true;
							}

							// If we're at the first item and it's empty, move to previous sibling of container
							if (isFirstItem && isEmpty) {
								const prevSibling = layoutContainer.getPreviousSibling();
								if (prevSibling) {
									event.preventDefault();
									if ($isElementNode(prevSibling)) {
										const lastChild = prevSibling.getLastDescendant();
										if (lastChild) {
											lastChild.selectEnd();
										} else {
											prevSibling.selectEnd();
										}
									} else {
										prevSibling.selectPrevious();
									}
									return true;
								} else {
									// Create a paragraph before and select it
									event.preventDefault();
									const paragraph = $createParagraphNode();
									layoutContainer.insertBefore(paragraph);
									paragraph.select();
									return true;
								}
							}

							// If we're at the start of a non-first item, move to previous item
							if (!isFirstItem && isAtStart) {
								const prevItem = layoutItem.getPreviousSibling();
								if (prevItem && $isLayoutItemNode(prevItem)) {
									event.preventDefault();
									const lastChild = prevItem.getLastDescendant();
									if (lastChild) {
										lastChild.selectEnd();
									}
									return true;
								}
							}
						}

						return false;
					},
					COMMAND_PRIORITY_LOW,
				),

				// Handle delete to delete layout or exit
				editor.registerCommand(
					KEY_DELETE_COMMAND,
					(event) => {
						const { layoutContainer, layoutItem, isAtEnd } =
							$getLayoutContext();

						if (!layoutContainer || !layoutItem) {
							return false;
						}

						// Check if we're at the end of the layout item
						if (isAtEnd) {
							const isLastItem = layoutItem.getNextSibling() === null;
							const isEmpty = $isLayoutItemEmpty(layoutItem);
							const allEmpty = $areAllLayoutItemsEmpty(layoutContainer);

							// If all items are empty, delete the entire layout
							if (allEmpty) {
								event.preventDefault();
								const paragraph = $createParagraphNode();
								layoutContainer.insertAfter(paragraph);
								layoutContainer.remove();
								paragraph.select();
								return true;
							}

							// If we're at the last item and it's empty, move to next sibling of container
							if (isLastItem && isEmpty) {
								const nextSibling = layoutContainer.getNextSibling();
								if (nextSibling) {
									event.preventDefault();
									if ($isElementNode(nextSibling)) {
										const firstChild = nextSibling.getFirstDescendant();
										if (firstChild) {
											firstChild.selectStart();
										} else {
											nextSibling.selectStart();
										}
									} else {
										nextSibling.selectNext();
									}
									return true;
								} else {
									// Create a paragraph after and select it
									event.preventDefault();
									const paragraph = $createParagraphNode();
									layoutContainer.insertAfter(paragraph);
									paragraph.select();
									return true;
								}
							}

							// If we're at the end of a non-last item, move to next item
							if (!isLastItem && isAtEnd) {
								const nextItem = layoutItem.getNextSibling();
								if (nextItem && $isLayoutItemNode(nextItem)) {
									event.preventDefault();
									const firstChild = nextItem.getFirstDescendant();
									if (firstChild) {
										firstChild.selectStart();
									}
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
