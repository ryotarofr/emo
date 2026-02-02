import {
	AutoEmbedOption,
	type EmbedConfig,
	type EmbedMatchResult,
	LexicalAutoEmbedPlugin,
} from "@ryotarofr/lexical-solid/LexicalAutoEmbedPlugin";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { $insertNodes, type LexicalEditor } from "lexical";
import { For, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { $createTweetNode } from "../nodes/TweetNode";
import { $createYouTubeNode } from "../nodes/YouTubeNode";

// YouTube Embed Config
const YoutubeEmbedConfig: EmbedConfig<{ id: string }> = {
	type: "youtube-video",
	parseUrl: (url: string) => {
		const patterns = [
			/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
			/youtube\.com\/shorts\/([^&\n?#]+)/,
		];

		for (const pattern of patterns) {
			const match = url.match(pattern);
			if (match && match[1]) {
				return {
					id: match[1],
					url,
				};
			}
		}

		return null;
	},
	insertNode: (
		editor: LexicalEditor,
		result: EmbedMatchResult<{ id: string }>,
	) => {
		editor.update(() => {
			const youtubeNode = $createYouTubeNode(result.id);
			$insertNodes([youtubeNode]);
		});
	},
};

// Twitter/X Embed Config
const TwitterEmbedConfig: EmbedConfig<{ id: string }> = {
	type: "tweet",
	parseUrl: (url: string) => {
		const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
		if (match && match[1]) {
			return {
				id: match[1],
				url,
			};
		}
		return null;
	},
	insertNode: (
		editor: LexicalEditor,
		result: EmbedMatchResult<{ id: string }>,
	) => {
		editor.update(() => {
			const tweetNode = $createTweetNode(result.id);
			$insertNodes([tweetNode]);
		});
	},
};

// Combined embed configs
const EmbedConfigs: EmbedConfig[] = [
	YoutubeEmbedConfig,
	TwitterEmbedConfig,
] as EmbedConfig[];

function AutoEmbedMenuItem(props: {
	index: number;
	isSelected: boolean;
	onClick: () => void;
	onMouseEnter: () => void;
	option: AutoEmbedOption;
}): JSX.Element {
	return (
		<button
			type="button"
			class={`auto-embed-item ${props.isSelected ? "selected" : ""}`}
			onClick={props.onClick}
			onMouseEnter={props.onMouseEnter}
		>
			<span class="auto-embed-item-text">{props.option.title}</span>
		</button>
	);
}

function AutoEmbedMenu(props: {
	selectedIndex: number | null;
	options: AutoEmbedOption[];
	onOptionClick: (option: AutoEmbedOption, index: number) => void;
	onOptionMouseEnter: (index: number) => void;
}): JSX.Element {
	return (
		<div class="auto-embed-menu">
			<For each={props.options}>
				{(option, index) => (
					<AutoEmbedMenuItem
						index={index()}
						isSelected={props.selectedIndex === index()}
						onClick={() => props.onOptionClick(option, index())}
						onMouseEnter={() => props.onOptionMouseEnter(index())}
						option={option}
					/>
				)}
			</For>
		</div>
	);
}

function getMenuOptions(
	activeEmbedConfig: EmbedConfig,
	embedFn: () => void,
	dismissFn: () => void,
): AutoEmbedOption[] {
	return [
		new AutoEmbedOption(`Embed ${activeEmbedConfig.type}`, {
			onSelect: embedFn,
		}),
		new AutoEmbedOption("Dismiss", {
			onSelect: dismissFn,
		}),
	];
}

export default function AutoEmbedPlugin(): JSX.Element | null {
	useLexicalComposerContext();

	const openEmbedModal = (_embedConfig: EmbedConfig) => {
		// For this implementation, we auto-embed when the URL is detected
		// A more advanced implementation could open a modal for configuration
	};

	return (
		<LexicalAutoEmbedPlugin
			embedConfigs={EmbedConfigs}
			onOpenEmbedModalForConfig={openEmbedModal}
			getMenuOptions={getMenuOptions}
			menuRenderFn={(
				anchorElementRef,
				{ selectedIndex, options, selectOptionAndCleanUp, setHighlightedIndex },
			) =>
				anchorElementRef.current ? (
					<Portal mount={anchorElementRef.current}>
						<AutoEmbedMenu
							selectedIndex={
								typeof selectedIndex === "function"
									? selectedIndex()
									: selectedIndex
							}
							options={options}
							onOptionClick={(option, index) => {
								setHighlightedIndex(index);
								selectOptionAndCleanUp(option);
							}}
							onOptionMouseEnter={setHighlightedIndex}
						/>
					</Portal>
				) : null
			}
		/>
	);
}
