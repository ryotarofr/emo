import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import {
	LexicalTypeaheadMenuPlugin,
	MenuOption,
	useBasicTypeaheadTriggerMatch,
} from "@ryotarofr/lexical-solid/LexicalTypeaheadMenuPlugin";
import { $createTextNode, type TextNode } from "lexical";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";

class EmojiOption extends MenuOption {
	title: string;
	emoji: string;
	keywords: string[];

	constructor(
		title: string,
		emoji: string,
		options: {
			keywords?: string[];
		},
	) {
		super(title);
		this.title = title;
		this.emoji = emoji;
		this.keywords = options.keywords || [];
	}
}

// Common emoji list
const EMOJI_LIST: Array<{ title: string; emoji: string; keywords: string[] }> =
	[
		{ title: "smile", emoji: "😊", keywords: ["happy", "joy", "grin"] },
		{ title: "laugh", emoji: "😂", keywords: ["lol", "funny", "tears"] },
		{ title: "wink", emoji: "😉", keywords: ["flirt"] },
		{ title: "heart_eyes", emoji: "😍", keywords: ["love", "crush"] },
		{ title: "sunglasses", emoji: "😎", keywords: ["cool"] },
		{ title: "thinking", emoji: "🤔", keywords: ["hmm", "wonder"] },
		{ title: "thumbs_up", emoji: "👍", keywords: ["ok", "yes", "like", "+1"] },
		{ title: "thumbs_down", emoji: "👎", keywords: ["no", "dislike", "-1"] },
		{ title: "clap", emoji: "👏", keywords: ["applause", "bravo"] },
		{ title: "wave", emoji: "👋", keywords: ["hello", "hi", "bye"] },
		{ title: "pray", emoji: "🙏", keywords: ["please", "thanks", "hope"] },
		{ title: "fire", emoji: "🔥", keywords: ["hot", "lit"] },
		{ title: "heart", emoji: "❤️", keywords: ["love", "like"] },
		{ title: "star", emoji: "⭐", keywords: ["favorite", "best"] },
		{ title: "sparkles", emoji: "✨", keywords: ["magic", "new", "shiny"] },
		{ title: "check", emoji: "✅", keywords: ["done", "complete", "yes"] },
		{ title: "x", emoji: "❌", keywords: ["no", "wrong", "cancel"] },
		{ title: "warning", emoji: "⚠️", keywords: ["alert", "caution"] },
		{ title: "info", emoji: "ℹ️", keywords: ["information"] },
		{ title: "question", emoji: "❓", keywords: ["what", "help"] },
		{ title: "exclamation", emoji: "❗", keywords: ["important", "alert"] },
		{ title: "rocket", emoji: "🚀", keywords: ["launch", "fast", "ship"] },
		{ title: "party", emoji: "🎉", keywords: ["celebrate", "congrats"] },
		{ title: "trophy", emoji: "🏆", keywords: ["win", "champion", "best"] },
		{ title: "bulb", emoji: "💡", keywords: ["idea", "tip", "light"] },
		{ title: "bug", emoji: "🐛", keywords: ["error", "issue"] },
		{ title: "wrench", emoji: "🔧", keywords: ["fix", "tool", "repair"] },
		{ title: "lock", emoji: "🔒", keywords: ["secure", "private"] },
		{ title: "key", emoji: "🔑", keywords: ["unlock", "password"] },
		{ title: "link", emoji: "🔗", keywords: ["url", "chain"] },
		{ title: "bookmark", emoji: "🔖", keywords: ["save", "tag"] },
		{ title: "folder", emoji: "📁", keywords: ["directory", "file"] },
		{ title: "calendar", emoji: "📅", keywords: ["date", "schedule"] },
		{ title: "clock", emoji: "🕐", keywords: ["time", "hour"] },
		{ title: "email", emoji: "📧", keywords: ["mail", "message"] },
		{ title: "phone", emoji: "📱", keywords: ["mobile", "call"] },
		{ title: "computer", emoji: "💻", keywords: ["laptop", "code"] },
		{ title: "coffee", emoji: "☕", keywords: ["break", "drink"] },
		{ title: "pizza", emoji: "🍕", keywords: ["food", "lunch"] },
		{ title: "beer", emoji: "🍺", keywords: ["drink", "cheers"] },
		{ title: "sun", emoji: "☀️", keywords: ["weather", "bright", "day"] },
		{ title: "moon", emoji: "🌙", keywords: ["night", "sleep"] },
		{ title: "rain", emoji: "🌧️", keywords: ["weather", "wet"] },
		{ title: "snow", emoji: "❄️", keywords: ["winter", "cold"] },
		{ title: "cat", emoji: "🐱", keywords: ["pet", "kitty"] },
		{ title: "dog", emoji: "🐶", keywords: ["pet", "puppy"] },
		{ title: "tree", emoji: "🌲", keywords: ["nature", "forest"] },
		{ title: "flower", emoji: "🌸", keywords: ["nature", "spring", "cherry"] },
	];

function getEmojiOptions(): EmojiOption[] {
	return EMOJI_LIST.map(
		(item) =>
			new EmojiOption(item.title, item.emoji, { keywords: item.keywords }),
	);
}

// Component for menu item with scroll into view support
function EmojiPickerMenuItem(props: {
	option: EmojiOption;
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
			class={`emoji-picker-item ${props.isSelected ? "selected" : ""}`}
			onClick={props.onClick}
			onMouseEnter={props.onMouseEnter}
		>
			<span class="emoji-picker-item-emoji">{props.option.emoji}</span>
			<span class="emoji-picker-item-title">:{props.option.title}:</span>
		</button>
	);
}

export default function EmojiPickerPlugin(): JSX.Element {
	const [editor] = useLexicalComposerContext();
	const [queryString, setQueryString] = createSignal<string | null>(null);

	const checkForTriggerMatch = useBasicTypeaheadTriggerMatch(":", {
		minLength: 0,
	});

	const options = createMemo(() => {
		const baseOptions = getEmojiOptions();
		const query = queryString();

		if (!query) {
			return baseOptions.slice(0, 10); // Show first 10 by default
		}

		const regex = new RegExp(query, "i");

		return baseOptions
			.filter(
				(option) =>
					regex.test(option.title) ||
					option.keywords.some((keyword) => regex.test(keyword)),
			)
			.slice(0, 10); // Limit to 10 results
	});

	const onSelectOption = (
		selectedOption: EmojiOption,
		nodeToRemove: TextNode | null,
		closeMenu: () => void,
	) => {
		editor.update(() => {
			const emojiNode = $createTextNode(selectedOption.emoji);
			if (nodeToRemove) {
				nodeToRemove.replace(emojiNode);
			}
			emojiNode.select();
			closeMenu();
		});
	};

	return (
		<LexicalTypeaheadMenuPlugin<EmojiOption>
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
						<div class="emoji-picker-menu">
							<For each={options()}>
								{(option, index) => (
									<EmojiPickerMenuItem
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
