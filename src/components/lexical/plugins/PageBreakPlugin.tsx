import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { $insertNodes, COMMAND_PRIORITY_EDITOR } from "lexical";
import { type JSX, onCleanup, onMount } from "solid-js";
import {
	$createPageBreakNode,
	INSERT_PAGE_BREAK_COMMAND,
	PageBreakNode,
} from "../nodes/PageBreakNode";

export default function PageBreakPlugin(): JSX.Element | null {
	const [editor] = useLexicalComposerContext();

	onMount(() => {
		if (!editor.hasNodes([PageBreakNode])) {
			throw new Error(
				"PageBreakPlugin: PageBreakNode not registered on editor",
			);
		}

		onCleanup(
			editor.registerCommand(
				INSERT_PAGE_BREAK_COMMAND,
				() => {
					const pageBreakNode = $createPageBreakNode();
					$insertNodes([pageBreakNode]);
					return true;
				},
				COMMAND_PRIORITY_EDITOR,
			),
		);
	});

	return null;
}
