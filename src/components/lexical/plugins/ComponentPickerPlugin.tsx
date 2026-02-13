import { $createCodeNode } from "@lexical/code";
import {
	INSERT_CHECK_LIST_COMMAND,
	INSERT_ORDERED_LIST_COMMAND,
	INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@ryotarofr/lexical-solid/LexicalHorizontalRuleNode";
import {
	LexicalTypeaheadMenuPlugin,
	MenuOption,
	useBasicTypeaheadTriggerMatch,
} from "@ryotarofr/lexical-solid/LexicalTypeaheadMenuPlugin";
import {
	$createParagraphNode,
	$getSelection,
	$isRangeSelection,
	type LexicalEditor,
	type TextNode,
} from "lexical";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { INSERT_COLLAPSIBLE_COMMAND } from "../nodes/CollapsibleNodes";
import { INSERT_FIGMA_COMMAND } from "../nodes/FigmaNode";
import { INSERT_IMAGE_COMMAND } from "../nodes/ImageNode";
import { INSERT_LAYOUT_COMMAND } from "../nodes/LayoutNodes";
import { INSERT_PAGE_BREAK_COMMAND } from "../nodes/PageBreakNode";
import { INSERT_TWEET_COMMAND } from "../nodes/TweetNode";
import { INSERT_YOUTUBE_COMMAND } from "../nodes/YouTubeNode";

// Helper function to extract YouTube video ID from various URL formats
function extractYouTubeVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
		/youtube\.com\/shorts\/([^&\n?#]+)/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}

	// If the input is already just a video ID (11 characters)
	if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
		return url;
	}

	return null;
}

// Helper function to extract Tweet ID from various URL formats
function extractTweetId(url: string): string | null {
	const patterns = [/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}

	// If the input is already just a tweet ID (numeric)
	if (/^\d+$/.test(url)) {
		return url;
	}

	return null;
}

// Helper function to extract Figma document ID from URL
function extractFigmaDocumentId(url: string): string | null {
	const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
	if (match?.[1]) {
		return match[1];
	}
	return null;
}

// Component for menu item with scroll into view support
function ComponentPickerMenuItem(props: {
	option: ComponentPickerOption;
	isSelected: boolean;
	onClick: () => void;
	onMouseEnter: () => void;
}): JSX.Element {
	let itemRef: HTMLButtonElement | undefined;

	createEffect(() => {
		if (props.isSelected) {
			itemRef?.scrollIntoView({ block: "nearest" });
		}
	});

	return (
		<button
			type="button"
			ref={itemRef}
			class={`component-picker-item ${props.isSelected ? "selected" : ""}`}
			onClick={props.onClick}
			onMouseEnter={props.onMouseEnter}
		>
			<span class="component-picker-item-icon">{props.option.icon}</span>
			<span class="component-picker-item-title">{props.option.title}</span>
		</button>
	);
}

class ComponentPickerOption extends MenuOption {
	title: string;
	icon: JSX.Element;
	keywords: string[];
	keyboardShortcut?: string;
	onSelect: (queryString: string) => void;

	constructor(
		title: string,
		options: {
			icon: JSX.Element;
			keywords?: string[];
			keyboardShortcut?: string;
			onSelect: (queryString: string) => void;
		},
	) {
		super(title);
		this.title = title;
		this.icon = options.icon;
		this.keywords = options.keywords || [];
		this.keyboardShortcut = options.keyboardShortcut;
		this.onSelect = options.onSelect;
	}
}

// Icons
function IconParagraph() {
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
			<path d="M13 4v16" />
			<path d="M17 4v16" />
			<path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
		</svg>
	);
}

function IconH1() {
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
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M17 12l3-2v8" />
		</svg>
	);
}

function IconH2() {
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
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
		</svg>
	);
}

function IconH3() {
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
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
			<path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
		</svg>
	);
}

function IconBulletList() {
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
			<line x1="8" y1="6" x2="21" y2="6" />
			<line x1="8" y1="12" x2="21" y2="12" />
			<line x1="8" y1="18" x2="21" y2="18" />
			<circle cx="4" cy="6" r="1" fill="currentColor" />
			<circle cx="4" cy="12" r="1" fill="currentColor" />
			<circle cx="4" cy="18" r="1" fill="currentColor" />
		</svg>
	);
}

function IconNumberedList() {
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
			<line x1="10" y1="6" x2="21" y2="6" />
			<line x1="10" y1="12" x2="21" y2="12" />
			<line x1="10" y1="18" x2="21" y2="18" />
			<text x="2" y="8" font-size="8" fill="currentColor" stroke="none">
				1
			</text>
			<text x="2" y="14" font-size="8" fill="currentColor" stroke="none">
				2
			</text>
			<text x="2" y="20" font-size="8" fill="currentColor" stroke="none">
				3
			</text>
		</svg>
	);
}

function IconCheckList() {
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
			<path d="M9 11l3 3L22 4" />
			<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
		</svg>
	);
}

function IconQuote() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="currentColor"
		>
			<path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
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

function IconHorizontalRule() {
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
			<line x1="3" y1="12" x2="21" y2="12" />
		</svg>
	);
}

function IconImage() {
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
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<circle cx="8.5" cy="8.5" r="1.5" />
			<polyline points="21 15 16 10 5 21" />
		</svg>
	);
}

function IconTable() {
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
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<line x1="3" y1="9" x2="21" y2="9" />
			<line x1="3" y1="15" x2="21" y2="15" />
			<line x1="9" y1="3" x2="9" y2="21" />
			<line x1="15" y1="3" x2="15" y2="21" />
		</svg>
	);
}

function IconYouTube() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="currentColor"
		>
			<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
		</svg>
	);
}

function IconTwitter() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="currentColor"
		>
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

function IconFigma() {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 38 57"
			fill="none"
		>
			<path
				fill="#1abcfe"
				d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"
			/>
			<path
				fill="#0acf83"
				d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"
			/>
			<path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
			<path
				fill="#f24e1e"
				d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"
			/>
			<path
				fill="#a259ff"
				d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"
			/>
		</svg>
	);
}

function IconCollapsible() {
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
			<path d="M3 12h18" />
			<path d="M3 6h18" />
			<path d="M9 18l3-3 3 3" />
		</svg>
	);
}

function IconColumns() {
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
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<line x1="12" y1="3" x2="12" y2="21" />
		</svg>
	);
}

function IconPageBreak() {
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
			<path d="M4 19h16" />
			<path d="M4 5h16" />
			<path d="M4 12h4" />
			<path d="M16 12h4" />
			<circle cx="12" cy="12" r="1" fill="currentColor" />
		</svg>
	);
}

function getBaseOptions(editor: LexicalEditor): ComponentPickerOption[] {
	return [
		new ComponentPickerOption("Paragraph", {
			icon: <IconParagraph />,
			keywords: ["normal", "paragraph", "p", "text"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () => $createParagraphNode());
					}
				}),
		}),
		new ComponentPickerOption("Heading 1", {
			icon: <IconH1 />,
			keywords: ["heading", "header", "h1"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () => $createHeadingNode("h1"));
					}
				}),
		}),
		new ComponentPickerOption("Heading 2", {
			icon: <IconH2 />,
			keywords: ["heading", "header", "h2"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () => $createHeadingNode("h2"));
					}
				}),
		}),
		new ComponentPickerOption("Heading 3", {
			icon: <IconH3 />,
			keywords: ["heading", "header", "h3"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () => $createHeadingNode("h3"));
					}
				}),
		}),
		new ComponentPickerOption("Bullet List", {
			icon: <IconBulletList />,
			keywords: ["bulleted list", "unordered list", "ul"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
		}),
		new ComponentPickerOption("Numbered List", {
			icon: <IconNumberedList />,
			keywords: ["numbered list", "ordered list", "ol"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
		}),
		new ComponentPickerOption("Check List", {
			icon: <IconCheckList />,
			keywords: ["check list", "todo list", "checkbox"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
		}),
		new ComponentPickerOption("Quote", {
			icon: <IconQuote />,
			keywords: ["block quote", "quote"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () => $createQuoteNode());
					}
				}),
		}),
		new ComponentPickerOption("Code Block", {
			icon: <IconCode />,
			keywords: ["javascript", "python", "code", "codeblock"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						if (selection.isCollapsed()) {
							$setBlocksType(selection, () => $createCodeNode());
						} else {
							const textContent = selection.getTextContent();
							const codeNode = $createCodeNode();
							selection.insertNodes([codeNode]);
							selection.insertRawText(textContent);
						}
					}
				}),
		}),
		new ComponentPickerOption("Horizontal Rule", {
			icon: <IconHorizontalRule />,
			keywords: ["horizontal rule", "divider", "hr"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
		}),
		new ComponentPickerOption("Image", {
			icon: <IconImage />,
			keywords: ["image", "photo", "picture", "img"],
			onSelect: () => {
				const src = prompt("Enter image URL:");
				if (src) {
					editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
						src,
						altText: "Image",
					});
				}
			},
		}),
		new ComponentPickerOption("Table", {
			icon: <IconTable />,
			keywords: ["table", "grid"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_TABLE_COMMAND, {
					columns: "3",
					rows: "3",
					includeHeaders: true,
				}),
		}),
		new ComponentPickerOption("YouTube", {
			icon: <IconYouTube />,
			keywords: ["youtube", "video", "embed"],
			onSelect: () => {
				const url = prompt("Enter YouTube URL:");
				if (url) {
					// Extract video ID from various YouTube URL formats
					const videoId = extractYouTubeVideoId(url);
					if (videoId) {
						editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, videoId);
					} else {
						alert("Invalid YouTube URL");
					}
				}
			},
		}),
		new ComponentPickerOption("Tweet", {
			icon: <IconTwitter />,
			keywords: ["twitter", "tweet", "x", "embed"],
			onSelect: () => {
				const url = prompt("Enter Tweet URL:");
				if (url) {
					const tweetId = extractTweetId(url);
					if (tweetId) {
						editor.dispatchCommand(INSERT_TWEET_COMMAND, tweetId);
					} else {
						alert("Invalid Tweet URL");
					}
				}
			},
		}),
		new ComponentPickerOption("Figma", {
			icon: <IconFigma />,
			keywords: ["figma", "design", "embed"],
			onSelect: () => {
				const url = prompt("Enter Figma URL:");
				if (url) {
					const documentId = extractFigmaDocumentId(url);
					if (documentId) {
						editor.dispatchCommand(INSERT_FIGMA_COMMAND, documentId);
					} else {
						alert("Invalid Figma URL");
					}
				}
			},
		}),
		new ComponentPickerOption("Collapsible", {
			icon: <IconCollapsible />,
			keywords: ["collapsible", "collapse", "toggle", "accordion", "details"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_COLLAPSIBLE_COMMAND, undefined),
		}),
		new ComponentPickerOption("2 Columns", {
			icon: <IconColumns />,
			keywords: ["columns", "layout", "grid", "2"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_LAYOUT_COMMAND, "2-columns"),
		}),
		new ComponentPickerOption("3 Columns", {
			icon: <IconColumns />,
			keywords: ["columns", "layout", "grid", "3"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_LAYOUT_COMMAND, "3-columns"),
		}),
		new ComponentPickerOption("Page Break", {
			icon: <IconPageBreak />,
			keywords: ["page", "break", "print"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_PAGE_BREAK_COMMAND, undefined),
		}),
	];
}

export default function ComponentPickerPlugin(): JSX.Element {
	const [editor] = useLexicalComposerContext();
	const [queryString, setQueryString] = createSignal<string | null>(null);

	const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
		minLength: 0,
	});

	const options = createMemo(() => {
		const baseOptions = getBaseOptions(editor);
		const query = queryString();

		if (!query) {
			return baseOptions;
		}

		const regex = new RegExp(query, "i");

		return baseOptions.filter(
			(option) =>
				regex.test(option.title) ||
				option.keywords.some((keyword) => regex.test(keyword)),
		);
	});

	const onSelectOption = (
		selectedOption: ComponentPickerOption,
		nodeToRemove: TextNode | null,
		closeMenu: () => void,
		matchingString: string,
	) => {
		editor.update(() => {
			nodeToRemove?.remove();
			selectedOption.onSelect(matchingString);
			closeMenu();
		});
	};

	return (
		<LexicalTypeaheadMenuPlugin<ComponentPickerOption>
			onQueryChange={setQueryString}
			onSelectOption={onSelectOption}
			triggerFn={checkForTriggerMatch}
			options={options()}
			menuRenderFn={(
				anchorElementRef,
				{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
			) =>
				anchorElementRef.current && options().length ? (
					<Portal mount={anchorElementRef.current}>
						<div class="component-picker-menu">
							<For each={options()}>
								{(option, index) => (
									<ComponentPickerMenuItem
										option={option}
										isSelected={
											(typeof selectedIndex === "function"
												? selectedIndex()
												: selectedIndex) === index()
										}
										onClick={() => {
											setHighlightedIndex(index());
											selectOptionAndCleanUp(option);
										}}
										onMouseEnter={() => {
											setHighlightedIndex(index());
										}}
									/>
								)}
							</For>
						</div>
					</Portal>
				) : null
			}
		/>
	);
}
