import {
	$applyNodeReplacement,
	createCommand,
	DecoratorNode,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type EditorConfig,
	type LexicalCommand,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import type { JSX } from "solid-js";
import ImageComponent from "../components/ImageComponent";

export interface ImagePayload {
	src: string;
	altText: string;
	width?: number;
	height?: number;
	maxWidth?: number;
	key?: NodeKey;
}

export type SerializedImageNode = Spread<
	{
		src: string;
		altText: string;
		width: number;
		height: number;
		maxWidth: number;
	},
	SerializedLexicalNode
>;

export const INSERT_IMAGE_COMMAND: LexicalCommand<ImagePayload> = createCommand(
	"INSERT_IMAGE_COMMAND",
);

function $convertImageElement(domNode: Node): null | DOMConversionOutput {
	if (domNode instanceof HTMLImageElement) {
		const { alt: altText, src, width, height } = domNode;
		const node = $createImageNode({ src, altText, width, height });
		return { node };
	}
	return null;
}

export class ImageNode extends DecoratorNode<() => JSX.Element> {
	__src: string;
	__altText: string;
	__width: number;
	__height: number;
	__maxWidth: number;

	static getType(): string {
		return "image";
	}

	static clone(node: ImageNode): ImageNode {
		return new ImageNode(
			node.__src,
			node.__altText,
			node.__width,
			node.__height,
			node.__maxWidth,
			node.__key,
		);
	}

	static importJSON(serializedNode: SerializedImageNode): ImageNode {
		const { src, altText, width, height, maxWidth } = serializedNode;
		const node = $createImageNode({
			src,
			altText,
			width,
			height,
			maxWidth,
		});
		return node;
	}

	static importDOM(): DOMConversionMap | null {
		return {
			img: () => ({
				conversion: $convertImageElement,
				priority: 0,
			}),
		};
	}

	constructor(
		src: string,
		altText: string,
		width?: number,
		height?: number,
		maxWidth?: number,
		key?: NodeKey,
	) {
		super(key);
		this.__src = src;
		this.__altText = altText;
		this.__width = width || 0;
		this.__height = height || 0;
		this.__maxWidth = maxWidth || 500;
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("img");
		element.setAttribute("src", this.__src);
		element.setAttribute("alt", this.__altText);
		if (this.__width) {
			element.setAttribute("width", this.__width.toString());
		}
		if (this.__height) {
			element.setAttribute("height", this.__height.toString());
		}
		return { element };
	}

	exportJSON(): SerializedImageNode {
		return {
			type: "image",
			version: 1,
			src: this.__src,
			altText: this.__altText,
			width: this.__width,
			height: this.__height,
			maxWidth: this.__maxWidth,
		};
	}

	createDOM(config: EditorConfig): HTMLElement {
		const span = document.createElement("span");
		const theme = config.theme;
		const className = theme.image;
		if (className !== undefined) {
			span.className = className;
		}
		return span;
	}

	updateDOM(): false {
		return false;
	}

	getSrc(): string {
		return this.__src;
	}

	getAltText(): string {
		return this.__altText;
	}

	getWidth(): number {
		return this.__width;
	}

	getHeight(): number {
		return this.__height;
	}

	setWidthAndHeight(width: number, height: number): void {
		const writable = this.getWritable();
		writable.__width = width;
		writable.__height = height;
	}

	decorate(): () => JSX.Element {
		const src = this.__src;
		const altText = this.__altText;
		const width = this.__width;
		const height = this.__height;
		const maxWidth = this.__maxWidth;
		const nodeKey = this.__key;
		return () => (
			<ImageComponent
				src={src}
				altText={altText}
				width={width}
				height={height}
				maxWidth={maxWidth}
				nodeKey={nodeKey}
			/>
		);
	}
}

export function $createImageNode({
	src,
	altText,
	width,
	height,
	maxWidth,
	key,
}: ImagePayload): ImageNode {
	return $applyNodeReplacement(
		new ImageNode(src, altText, width, height, maxWidth, key),
	);
}

export function $isImageNode(
	node: LexicalNode | null | undefined,
): node is ImageNode {
	return node instanceof ImageNode;
}
