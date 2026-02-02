import {
	$applyNodeReplacement,
	createCommand,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type EditorConfig,
	ElementNode,
	type LexicalCommand,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type SerializedElementNode,
	type Spread,
} from "lexical";

// Collapsible Container Node
export type SerializedCollapsibleContainerNode = Spread<
	{
		open: boolean;
	},
	SerializedElementNode
>;

export class CollapsibleContainerNode extends ElementNode {
	__open: boolean;

	static getType(): string {
		return "collapsible-container";
	}

	static clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
		return new CollapsibleContainerNode(node.__open, node.__key);
	}

	constructor(open: boolean = true, key?: NodeKey) {
		super(key);
		this.__open = open;
	}

	createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
		const dom = document.createElement("details");
		dom.classList.add("collapsible-container");
		dom.open = this.__open;

		dom.addEventListener("toggle", () => {
			const open = editor.getEditorState().read(() => this.getOpen());
			if (dom.open !== open) {
				editor.update(() => this.toggleOpen());
			}
		});

		return dom;
	}

	updateDOM(
		prevNode: CollapsibleContainerNode,
		dom: HTMLDetailsElement,
	): boolean {
		if (prevNode.__open !== this.__open) {
			dom.open = this.__open;
		}
		return false;
	}

	static importDOM(): DOMConversionMap | null {
		return {
			details: (_domNode: HTMLElement) => {
				return {
					conversion: $convertCollapsibleContainerElement,
					priority: 1,
				};
			},
		};
	}

	static importJSON(
		serializedNode: SerializedCollapsibleContainerNode,
	): CollapsibleContainerNode {
		const node = $createCollapsibleContainerNode(serializedNode.open);
		return node;
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("details");
		element.classList.add("collapsible-container");
		element.open = this.__open;
		return { element };
	}

	exportJSON(): SerializedCollapsibleContainerNode {
		return {
			...super.exportJSON(),
			open: this.__open,
			type: "collapsible-container",
			version: 1,
		};
	}

	getOpen(): boolean {
		return this.getLatest().__open;
	}

	setOpen(open: boolean): void {
		const writable = this.getWritable();
		writable.__open = open;
	}

	toggleOpen(): void {
		this.setOpen(!this.getOpen());
	}

	isShadowRoot(): boolean {
		return true;
	}
}

function $convertCollapsibleContainerElement(
	domNode: HTMLElement,
): DOMConversionOutput | null {
	const isOpen =
		(domNode as HTMLDetailsElement).open !== undefined
			? (domNode as HTMLDetailsElement).open
			: true;
	const node = $createCollapsibleContainerNode(isOpen);
	return { node };
}

export function $createCollapsibleContainerNode(
	open: boolean = true,
): CollapsibleContainerNode {
	return $applyNodeReplacement(new CollapsibleContainerNode(open));
}

export function $isCollapsibleContainerNode(
	node: LexicalNode | null | undefined,
): node is CollapsibleContainerNode {
	return node instanceof CollapsibleContainerNode;
}

// Collapsible Title Node
export type SerializedCollapsibleTitleNode = SerializedElementNode;

export class CollapsibleTitleNode extends ElementNode {
	static getType(): string {
		return "collapsible-title";
	}

	static clone(node: CollapsibleTitleNode): CollapsibleTitleNode {
		return new CollapsibleTitleNode(node.__key);
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const dom = document.createElement("summary");
		dom.classList.add("collapsible-title");
		return dom;
	}

	updateDOM(): boolean {
		return false;
	}

	static importDOM(): DOMConversionMap | null {
		return {
			summary: () => {
				return {
					conversion: $convertCollapsibleTitleElement,
					priority: 1,
				};
			},
		};
	}

	static importJSON(): CollapsibleTitleNode {
		return $createCollapsibleTitleNode();
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("summary");
		element.classList.add("collapsible-title");
		return { element };
	}

	exportJSON(): SerializedCollapsibleTitleNode {
		return {
			...super.exportJSON(),
			type: "collapsible-title",
			version: 1,
		};
	}

	collapseAtStart(): boolean {
		// Return true to prevent default behavior (merging with previous node)
		// This keeps the collapsible structure intact
		return true;
	}
}

function $convertCollapsibleTitleElement(): DOMConversionOutput | null {
	const node = $createCollapsibleTitleNode();
	return { node };
}

export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
	return $applyNodeReplacement(new CollapsibleTitleNode());
}

export function $isCollapsibleTitleNode(
	node: LexicalNode | null | undefined,
): node is CollapsibleTitleNode {
	return node instanceof CollapsibleTitleNode;
}

// Collapsible Content Node
export type SerializedCollapsibleContentNode = SerializedElementNode;

export class CollapsibleContentNode extends ElementNode {
	static getType(): string {
		return "collapsible-content";
	}

	static clone(node: CollapsibleContentNode): CollapsibleContentNode {
		return new CollapsibleContentNode(node.__key);
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const dom = document.createElement("div");
		dom.classList.add("collapsible-content");
		return dom;
	}

	updateDOM(): boolean {
		return false;
	}

	static importDOM(): DOMConversionMap | null {
		return {
			div: (domNode: HTMLElement) => {
				if (!domNode.classList.contains("collapsible-content")) {
					return null;
				}
				return {
					conversion: $convertCollapsibleContentElement,
					priority: 1,
				};
			},
		};
	}

	static importJSON(): CollapsibleContentNode {
		return $createCollapsibleContentNode();
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("div");
		element.classList.add("collapsible-content");
		return { element };
	}

	exportJSON(): SerializedCollapsibleContentNode {
		return {
			...super.exportJSON(),
			type: "collapsible-content",
			version: 1,
		};
	}
}

function $convertCollapsibleContentElement(): DOMConversionOutput | null {
	const node = $createCollapsibleContentNode();
	return { node };
}

export function $createCollapsibleContentNode(): CollapsibleContentNode {
	return $applyNodeReplacement(new CollapsibleContentNode());
}

export function $isCollapsibleContentNode(
	node: LexicalNode | null | undefined,
): node is CollapsibleContentNode {
	return node instanceof CollapsibleContentNode;
}

// Command to insert a collapsible
export const INSERT_COLLAPSIBLE_COMMAND: LexicalCommand<void> = createCommand(
	"INSERT_COLLAPSIBLE_COMMAND",
);

// Command to toggle a collapsible
export const TOGGLE_COLLAPSIBLE_COMMAND: LexicalCommand<NodeKey> =
	createCommand("TOGGLE_COLLAPSIBLE_COMMAND");
