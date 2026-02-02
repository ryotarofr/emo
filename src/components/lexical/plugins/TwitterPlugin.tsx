import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { $insertNodes, COMMAND_PRIORITY_EDITOR } from "lexical";
import { type JSX, onCleanup, onMount } from "solid-js";
import {
	$createTweetNode,
	INSERT_TWEET_COMMAND,
	TweetNode,
} from "../nodes/TweetNode";

export default function TwitterPlugin(): JSX.Element | null {
	const [editor] = useLexicalComposerContext();

	onMount(() => {
		if (!editor.hasNodes([TweetNode])) {
			throw new Error("TwitterPlugin: TweetNode not registered on editor");
		}

		onCleanup(
			editor.registerCommand<string>(
				INSERT_TWEET_COMMAND,
				(payload) => {
					const tweetNode = $createTweetNode(payload);
					$insertNodes([tweetNode]);
					return true;
				},
				COMMAND_PRIORITY_EDITOR,
			),
		);
	});

	return null;
}
