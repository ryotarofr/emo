import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { useLexicalNodeSelection } from "@ryotarofr/lexical-solid/useLexicalNodeSelection";
import {
	$applyNodeReplacement,
	$getNodeByKey,
	createCommand,
	DecoratorNode,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type LexicalCommand,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
} from "lexical";
import type { JSX } from "solid-js";

export type SerializedPageBreakNode = SerializedLexicalNode;

function $convertPageBreakElement(): DOMConversionOutput {
	return { node: $createPageBreakNode() };
}

export class PageBreakNode extends DecoratorNode<() => JSX.Element> {
	static getType(): string {
		return "page-break";
	}

	static clone(node: PageBreakNode): PageBreakNode {
		return new PageBreakNode(node.__key);
	}

	static importJSON(): PageBreakNode {
		return $createPageBreakNode();
	}

	static importDOM(): DOMConversionMap | null {
		return {
			figure: (domNode: HTMLElement) => {
				const tp = domNode.getAttribute("type");
				if (tp !== "page-break") {
					return null;
				}
				return {
					conversion: $convertPageBreakElement,
					priority: 2,
				};
			},
		};
	}

	exportJSON(): SerializedPageBreakNode {
		return {
			...super.exportJSON(),
			type: "page-break",
			version: 1,
		};
	}

	createDOM(): HTMLElement {
		const el = document.createElement("figure");
		el.setAttribute("type", "page-break");
		el.style.pageBreakAfter = "always";
		return el;
	}

	getTextContent(): string {
		return "\n";
	}

	isInline(): false {
		return false;
	}

	updateDOM(): boolean {
		return false;
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("figure");
		element.setAttribute("type", "page-break");
		element.style.pageBreakAfter = "always";
		return { element };
	}

	decorate(): () => JSX.Element {
		const nodeKey = this.__key;
		return () => <PageBreakComponent nodeKey={nodeKey} />;
	}
}

function PageBreakComponent(props: { nodeKey: NodeKey }): JSX.Element {
	const [editor] = useLexicalComposerContext();
	const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(
		props.nodeKey,
	);

	const handleClick = (e: MouseEvent) => {
		if (e.target === e.currentTarget) {
			if (!e.shiftKey) {
				clearSelection();
			}
			setSelected(!isSelected());
			e.preventDefault();
		}
	};

	const handleDelete = (e: KeyboardEvent) => {
		if (isSelected() && (e.key === "Backspace" || e.key === "Delete")) {
			e.preventDefault();
			editor.update(() => {
				const node = $getNodeByKey(props.nodeKey);
				if (node) {
					node.remove();
				}
			});
		}
	};

	return (
		<button
			type="button"
			class={`page-break ${isSelected() ? "selected" : ""}`}
			onClick={handleClick}
			onKeyDown={handleDelete}
			tabIndex={-1}
		>
			<span class="page-break-label">Page Break</span>
		</button>
	);
}

export function $createPageBreakNode(): PageBreakNode {
	return $applyNodeReplacement(new PageBreakNode());
}

export function $isPageBreakNode(
	node: LexicalNode | null | undefined,
): node is PageBreakNode {
	return node instanceof PageBreakNode;
}

export const INSERT_PAGE_BREAK_COMMAND: LexicalCommand<void> = createCommand(
	"INSERT_PAGE_BREAK_COMMAND",
);
