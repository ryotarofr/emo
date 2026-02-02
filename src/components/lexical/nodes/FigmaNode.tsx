import {
	$applyNodeReplacement,
	createCommand,
	DecoratorNode,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type EditorConfig,
	type LexicalCommand,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import type { JSX } from "solid-js";

export type SerializedFigmaNode = Spread<
	{
		documentID: string;
	},
	SerializedLexicalNode
>;

function $convertFigmaElement(
	domNode: HTMLElement,
): DOMConversionOutput | null {
	const documentID = domNode.getAttribute("data-lexical-figma");
	if (documentID) {
		const node = $createFigmaNode(documentID);
		return { node };
	}
	return null;
}

export class FigmaNode extends DecoratorNode<() => JSX.Element> {
	__id: string;

	static getType(): string {
		return "figma";
	}

	static clone(node: FigmaNode): FigmaNode {
		return new FigmaNode(node.__id, node.__key);
	}

	static importJSON(serializedNode: SerializedFigmaNode): FigmaNode {
		return $createFigmaNode(serializedNode.documentID);
	}

	constructor(id: string, key?: NodeKey) {
		super(key);
		this.__id = id;
	}

	exportJSON(): SerializedFigmaNode {
		return {
			...super.exportJSON(),
			documentID: this.__id,
			type: "figma",
			version: 1,
		};
	}

	static importDOM(): DOMConversionMap | null {
		return {
			iframe: (domNode: HTMLElement) => {
				if (!domNode.hasAttribute("data-lexical-figma")) {
					return null;
				}
				return {
					conversion: $convertFigmaElement,
					priority: 1,
				};
			},
		};
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("iframe");
		element.setAttribute("data-lexical-figma", this.__id);
		element.setAttribute("width", "100%");
		element.setAttribute("height", "450");
		element.setAttribute(
			"src",
			`https://www.figma.com/embed?embed_host=lexical&url=${encodeURIComponent(
				`https://www.figma.com/file/${this.__id}`,
			)}`,
		);
		element.setAttribute("allowfullscreen", "true");
		return { element };
	}

	updateDOM(): false {
		return false;
	}

	getId(): string {
		return this.__id;
	}

	getTextContent(): string {
		return `https://www.figma.com/file/${this.__id}`;
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const div = document.createElement("div");
		div.style.display = "contents";
		return div;
	}

	decorate(_editor: LexicalEditor, _config: EditorConfig): () => JSX.Element {
		const id = this.__id;
		const nodeKey = this.getKey();
		return () => <FigmaComponent documentID={id} nodeKey={nodeKey} />;
	}

	isInline(): false {
		return false;
	}
}

function isValidFigmaDocumentID(documentID: string): boolean {
	return /^[a-zA-Z0-9]+$/.test(documentID);
}

function FigmaComponent(props: {
	documentID: string;
	nodeKey: NodeKey;
}): JSX.Element {
	const safeDocumentID = isValidFigmaDocumentID(props.documentID)
		? props.documentID
		: "";
	return (
		<div class="figma-embed">
			<iframe
				title="Figma design"
				width="100%"
				height="450"
				src={`https://www.figma.com/embed?embed_host=lexical&url=${encodeURIComponent(
					`https://www.figma.com/file/${safeDocumentID}`,
				)}`}
				allowfullscreen
			/>
		</div>
	);
}

export function $createFigmaNode(documentID: string): FigmaNode {
	return $applyNodeReplacement(new FigmaNode(documentID));
}

export function $isFigmaNode(
	node: LexicalNode | null | undefined,
): node is FigmaNode {
	return node instanceof FigmaNode;
}

export const INSERT_FIGMA_COMMAND: LexicalCommand<string> = createCommand(
	"INSERT_FIGMA_COMMAND",
);
