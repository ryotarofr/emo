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

export type SerializedYouTubeNode = Spread<
	{
		videoID: string;
	},
	SerializedLexicalNode
>;

function $convertYoutubeElement(
	domNode: HTMLElement,
): null | DOMConversionOutput {
	const videoID = domNode.getAttribute("data-lexical-youtube");
	if (videoID) {
		const node = $createYouTubeNode(videoID);
		return { node };
	}
	return null;
}

export class YouTubeNode extends DecoratorNode<() => JSX.Element> {
	__id: string;

	static getType(): string {
		return "youtube";
	}

	static clone(node: YouTubeNode): YouTubeNode {
		return new YouTubeNode(node.__id, node.__key);
	}

	static importJSON(serializedNode: SerializedYouTubeNode): YouTubeNode {
		const node = $createYouTubeNode(serializedNode.videoID);
		return node;
	}

	constructor(id: string, key?: NodeKey) {
		super(key);
		this.__id = id;
	}

	exportJSON(): SerializedYouTubeNode {
		return {
			...super.exportJSON(),
			type: "youtube",
			version: 1,
			videoID: this.__id,
		};
	}

	static importDOM(): DOMConversionMap | null {
		return {
			iframe: (domNode: HTMLElement) => {
				if (!domNode.hasAttribute("data-lexical-youtube")) {
					return null;
				}
				return {
					conversion: $convertYoutubeElement,
					priority: 1,
				};
			},
		};
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("iframe");
		element.setAttribute("data-lexical-youtube", this.__id);
		element.setAttribute("width", "560");
		element.setAttribute("height", "315");
		element.setAttribute(
			"src",
			`https://www.youtube-nocookie.com/embed/${this.__id}`,
		);
		element.setAttribute("frameborder", "0");
		element.setAttribute(
			"allow",
			"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
		);
		element.setAttribute("allowfullscreen", "true");
		element.setAttribute("title", "YouTube video");
		return { element };
	}

	updateDOM(): false {
		return false;
	}

	getId(): string {
		return this.__id;
	}

	getTextContent(): string {
		return `https://www.youtube.com/watch?v=${this.__id}`;
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const div = document.createElement("div");
		div.style.display = "contents";
		return div;
	}

	decorate(_editor: LexicalEditor, _config: EditorConfig): () => JSX.Element {
		const id = this.__id;
		const nodeKey = this.getKey();
		return () => <YouTubeComponent videoID={id} nodeKey={nodeKey} />;
	}

	isInline(): false {
		return false;
	}
}

function isValidYouTubeVideoID(videoID: string): boolean {
	return /^[a-zA-Z0-9_-]{11}$/.test(videoID);
}

function YouTubeComponent(props: {
	videoID: string;
	nodeKey: NodeKey;
}): JSX.Element {
	if (!isValidYouTubeVideoID(props.videoID)) {
		// Do not render an iframe when the video ID is invalid
		return <div class="youtube-embed" />;
	}

	const safeVideoID = props.videoID;

	return (
		<div class="youtube-embed">
			<iframe
				width="560"
				height="315"
				src={`https://www.youtube-nocookie.com/embed/${safeVideoID}`}
				style={{ border: "none" }}
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowfullscreen
				title="YouTube video"
			/>
		</div>
	);
}

export function $createYouTubeNode(videoID: string): YouTubeNode {
	return $applyNodeReplacement(new YouTubeNode(videoID));
}

export function $isYouTubeNode(
	node: LexicalNode | null | undefined,
): node is YouTubeNode {
	return node instanceof YouTubeNode;
}

export const INSERT_YOUTUBE_COMMAND: LexicalCommand<string> = createCommand(
	"INSERT_YOUTUBE_COMMAND",
);
