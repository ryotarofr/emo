import {
	$applyNodeReplacement,
	createCommand,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type EditorConfig,
	ElementNode,
	type LexicalCommand,
	type LexicalNode,
	type NodeKey,
	type SerializedElementNode,
	type Spread,
} from "lexical";

// Layout Container Node
export type SerializedLayoutContainerNode = Spread<
	{
		templateColumns: string;
	},
	SerializedElementNode
>;

export class LayoutContainerNode extends ElementNode {
	__templateColumns: string;

	static getType(): string {
		return "layout-container";
	}

	static clone(node: LayoutContainerNode): LayoutContainerNode {
		return new LayoutContainerNode(node.__templateColumns, node.__key);
	}

	constructor(templateColumns: string = "1fr 1fr", key?: NodeKey) {
		super(key);
		this.__templateColumns = templateColumns;
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const dom = document.createElement("div");
		dom.classList.add("layout-container");
		dom.style.gridTemplateColumns = this.__templateColumns;
		return dom;
	}

	updateDOM(prevNode: LayoutContainerNode, dom: HTMLElement): boolean {
		if (prevNode.__templateColumns !== this.__templateColumns) {
			dom.style.gridTemplateColumns = this.__templateColumns;
		}
		return false;
	}

	static importDOM(): DOMConversionMap | null {
		return {
			div: (domNode: HTMLElement) => {
				if (!domNode.classList.contains("layout-container")) {
					return null;
				}
				return {
					conversion: $convertLayoutContainerElement,
					priority: 1,
				};
			},
		};
	}

	static importJSON(
		serializedNode: SerializedLayoutContainerNode,
	): LayoutContainerNode {
		return $createLayoutContainerNode(serializedNode.templateColumns);
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("div");
		element.classList.add("layout-container");
		element.style.gridTemplateColumns = this.__templateColumns;
		return { element };
	}

	exportJSON(): SerializedLayoutContainerNode {
		return {
			...super.exportJSON(),
			templateColumns: this.__templateColumns,
			type: "layout-container",
			version: 1,
		};
	}

	getTemplateColumns(): string {
		return this.getLatest().__templateColumns;
	}

	setTemplateColumns(templateColumns: string): void {
		const writable = this.getWritable();
		writable.__templateColumns = templateColumns;
	}

	isShadowRoot(): boolean {
		return true;
	}
}

function $convertLayoutContainerElement(
	domNode: HTMLElement,
): DOMConversionOutput | null {
	const templateColumns = domNode.style.gridTemplateColumns || "1fr 1fr";
	const node = $createLayoutContainerNode(templateColumns);
	return { node };
}

export function $createLayoutContainerNode(
	templateColumns: string = "1fr 1fr",
): LayoutContainerNode {
	return $applyNodeReplacement(new LayoutContainerNode(templateColumns));
}

export function $isLayoutContainerNode(
	node: LexicalNode | null | undefined,
): node is LayoutContainerNode {
	return node instanceof LayoutContainerNode;
}

// Layout Item Node
export type SerializedLayoutItemNode = SerializedElementNode;

export class LayoutItemNode extends ElementNode {
	static getType(): string {
		return "layout-item";
	}

	static clone(node: LayoutItemNode): LayoutItemNode {
		return new LayoutItemNode(node.__key);
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const dom = document.createElement("div");
		dom.classList.add("layout-item");
		return dom;
	}

	updateDOM(): boolean {
		return false;
	}

	static importDOM(): DOMConversionMap | null {
		return {
			div: (domNode: HTMLElement) => {
				if (!domNode.classList.contains("layout-item")) {
					return null;
				}
				return {
					conversion: $convertLayoutItemElement,
					priority: 1,
				};
			},
		};
	}

	static importJSON(): LayoutItemNode {
		return $createLayoutItemNode();
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("div");
		element.classList.add("layout-item");
		return { element };
	}

	exportJSON(): SerializedLayoutItemNode {
		return {
			...super.exportJSON(),
			type: "layout-item",
			version: 1,
		};
	}

	isShadowRoot(): boolean {
		return true;
	}
}

function $convertLayoutItemElement(): DOMConversionOutput | null {
	const node = $createLayoutItemNode();
	return { node };
}

export function $createLayoutItemNode(): LayoutItemNode {
	return $applyNodeReplacement(new LayoutItemNode());
}

export function $isLayoutItemNode(
	node: LexicalNode | null | undefined,
): node is LayoutItemNode {
	return node instanceof LayoutItemNode;
}

// Layout templates
export const LAYOUT_TEMPLATES = {
	"2-columns": "1fr 1fr",
	"3-columns": "1fr 1fr 1fr",
	"2-columns-left": "2fr 1fr",
	"2-columns-right": "1fr 2fr",
	"4-columns": "1fr 1fr 1fr 1fr",
};

export type LayoutTemplate = keyof typeof LAYOUT_TEMPLATES;

// Command to insert a layout
export const INSERT_LAYOUT_COMMAND: LexicalCommand<LayoutTemplate> =
	createCommand("INSERT_LAYOUT_COMMAND");
