import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import {
	LexicalTypeaheadMenuPlugin,
	MenuOption,
	useBasicTypeaheadTriggerMatch,
} from "@ryotarofr/lexical-solid/LexicalTypeaheadMenuPlugin";
import type { TextNode } from "lexical";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { $createMentionNode } from "../nodes/MentionNode";

class MentionOption extends MenuOption {
	name: string;
	picture: string;

	constructor(name: string, picture: string) {
		super(name);
		this.name = name;
		this.picture = picture;
	}
}

// Sample user data
const MENTIONABLE_USERS: Array<{ name: string; picture: string }> = [
	{ name: "Alice Johnson", picture: "👩‍💼" },
	{ name: "Bob Smith", picture: "👨‍💻" },
	{ name: "Charlie Brown", picture: "👨‍🎨" },
	{ name: "Diana Prince", picture: "👩‍🦸" },
	{ name: "Edward Chen", picture: "👨‍🔬" },
	{ name: "Fiona Green", picture: "👩‍🌾" },
	{ name: "George Wilson", picture: "👨‍🍳" },
	{ name: "Hannah Lee", picture: "👩‍⚕️" },
	{ name: "Ivan Petrov", picture: "👨‍🚀" },
	{ name: "Julia Martinez", picture: "👩‍🎤" },
	{ name: "Kevin O'Brien", picture: "👨‍🏫" },
	{ name: "Laura Kim", picture: "👩‍💻" },
	{ name: "Michael Davis", picture: "👨‍🔧" },
	{ name: "Nancy White", picture: "👩‍🎓" },
	{ name: "Oscar Rodriguez", picture: "👨‍⚖️" },
];

function getMentionOptions(): MentionOption[] {
	return MENTIONABLE_USERS.map(
		(user) => new MentionOption(user.name, user.picture),
	);
}

// Component for menu item with scroll into view support
function MentionMenuItem(props: {
	option: MentionOption;
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
			class={`mentions-item ${props.isSelected ? "selected" : ""}`}
			onClick={props.onClick}
			onMouseEnter={props.onMouseEnter}
		>
			<span class="mentions-item-picture">{props.option.picture}</span>
			<span class="mentions-item-name">{props.option.name}</span>
		</button>
	);
}

export default function MentionsPlugin(): JSX.Element {
	const [editor] = useLexicalComposerContext();
	const [queryString, setQueryString] = createSignal<string | null>(null);

	const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("@", {
		minLength: 0,
	});

	const options = createMemo(() => {
		const baseOptions = getMentionOptions();
		const query = queryString();

		if (!query) {
			return baseOptions.slice(0, 5); // Show first 5 by default
		}

		const regex = new RegExp(query, "i");

		return baseOptions.filter((option) => regex.test(option.name)).slice(0, 5); // Limit to 5 results
	});

	const onSelectOption = (
		selectedOption: MentionOption,
		nodeToRemove: TextNode | null,
		closeMenu: () => void,
	) => {
		editor.update(() => {
			const mentionNode = $createMentionNode("@" + selectedOption.name);
			if (nodeToRemove) {
				nodeToRemove.replace(mentionNode);
			}
			mentionNode.select();
			closeMenu();
		});
	};

	return (
		<LexicalTypeaheadMenuPlugin<MentionOption>
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
						<div class="mentions-menu">
							<For each={options()}>
								{(option, index) => (
									<MentionMenuItem
										option={option}
										isSelected={selectedIndex() === index()}
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
