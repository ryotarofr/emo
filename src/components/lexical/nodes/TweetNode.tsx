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
import { createSignal, type JSX, onMount } from "solid-js";

export type SerializedTweetNode = Spread<
	{
		id: string;
	},
	SerializedLexicalNode
>;

// Validate that the tweet ID is a numeric string
function isValidTweetID(id: string): boolean {
	return /^\d+$/.test(id);
}

function $convertTweetElement(
	domNode: HTMLElement,
): DOMConversionOutput | null {
	const id = domNode.getAttribute("data-lexical-tweet-id");
	if (id && isValidTweetID(id)) {
		const node = $createTweetNode(id);
		return { node };
	}
	return null;
}

// Load Twitter widget script
let isTwitterScriptLoading = false;
let isTwitterScriptLoaded = false;

function loadTwitterScript(): Promise<void> {
	if (isTwitterScriptLoaded) {
		return Promise.resolve();
	}

	if (isTwitterScriptLoading) {
		return new Promise((resolve) => {
			const checkLoaded = setInterval(() => {
				if (isTwitterScriptLoaded) {
					clearInterval(checkLoaded);
					resolve();
				}
			}, 100);
		});
	}

	isTwitterScriptLoading = true;

	return new Promise((resolve) => {
		const script = document.createElement("script");
		script.src = "https://platform.twitter.com/widgets.js";
		script.async = true;
		script.onload = () => {
			isTwitterScriptLoaded = true;
			isTwitterScriptLoading = false;
			resolve();
		};
		document.body.appendChild(script);
	});
}

export class TweetNode extends DecoratorNode<() => JSX.Element> {
	__id: string;

	static getType(): string {
		return "tweet";
	}

	static clone(node: TweetNode): TweetNode {
		return new TweetNode(node.__id, node.__key);
	}

	static importJSON(serializedNode: SerializedTweetNode): TweetNode {
		return $createTweetNode(serializedNode.id);
	}

	constructor(id: string, key?: NodeKey) {
		super(key);
		if (!isValidTweetID(id)) {
			throw new Error(
				`Invalid tweet ID: ${id}. Tweet ID must be a numeric string.`,
			);
		}
		this.__id = id;
	}

	exportJSON(): SerializedTweetNode {
		return {
			...super.exportJSON(),
			id: this.__id,
			type: "tweet",
			version: 1,
		};
	}

	static importDOM(): DOMConversionMap | null {
		return {
			div: (domNode: HTMLElement) => {
				if (!domNode.hasAttribute("data-lexical-tweet-id")) {
					return null;
				}
				return {
					conversion: $convertTweetElement,
					priority: 2,
				};
			},
		};
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("div");
		element.setAttribute("data-lexical-tweet-id", this.__id);
		const blockquote = document.createElement("blockquote");
		blockquote.className = "twitter-tweet";
		const link = document.createElement("a");
		link.href = `https://twitter.com/x/status/${this.__id}`;
		blockquote.appendChild(link);
		element.appendChild(blockquote);
		return { element };
	}

	updateDOM(): false {
		return false;
	}

	getId(): string {
		return this.__id;
	}

	getTextContent(): string {
		return `https://twitter.com/x/status/${this.__id}`;
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const div = document.createElement("div");
		div.style.display = "contents";
		return div;
	}

	decorate(_editor: LexicalEditor, _config: EditorConfig): () => JSX.Element {
		const id = this.__id;
		const nodeKey = this.getKey();
		return () => <TweetComponent tweetID={id} nodeKey={nodeKey} />;
	}

	isInline(): false {
		return false;
	}
}

function TweetComponent(props: {
	tweetID: string;
	nodeKey: NodeKey;
}): JSX.Element {
	let containerRef: HTMLDivElement | undefined;
	const [isLoading, setIsLoading] = createSignal(true);

	onMount(async () => {
		await loadTwitterScript();

		const twttr = (
			window as unknown as Record<
				string,
				{
					widgets?: {
						createTweet: (
							id: string,
							el: HTMLElement,
							opts: Record<string, string>,
						) => Promise<void>;
					};
				}
			>
		).twttr;
		if (twttr?.widgets) {
			twttr.widgets
				.createTweet(props.tweetID, containerRef as HTMLDivElement, {
					theme: "light",
				})
				.then(() => {
					setIsLoading(false);
				});
		}
	});

	return (
		<div class="twitter-embed">
			{isLoading() && <div class="twitter-loading">Loading tweet...</div>}
			<div ref={containerRef} />
		</div>
	);
}

export function $createTweetNode(tweetID: string): TweetNode {
	if (!isValidTweetID(tweetID)) {
		throw new Error(
			`Invalid tweet ID: ${tweetID}. Tweet ID must be a numeric string.`,
		);
	}
	return $applyNodeReplacement(new TweetNode(tweetID));
}

export function $isTweetNode(
	node: LexicalNode | null | undefined,
): node is TweetNode {
	return node instanceof TweetNode;
}

export const INSERT_TWEET_COMMAND: LexicalCommand<string> = createCommand(
	"INSERT_TWEET_COMMAND",
);
