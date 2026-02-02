import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { $insertNodes, COMMAND_PRIORITY_EDITOR } from "lexical";
import { type JSX, onCleanup, onMount } from "solid-js";
import {
	$createFigmaNode,
	FigmaNode,
	INSERT_FIGMA_COMMAND,
} from "../nodes/FigmaNode";

export default function FigmaPlugin(): JSX.Element | null {
	const [editor] = useLexicalComposerContext();

	onMount(() => {
		if (!editor.hasNodes([FigmaNode])) {
			throw new Error("FigmaPlugin: FigmaNode not registered on editor");
		}

		onCleanup(
			editor.registerCommand<string>(
				INSERT_FIGMA_COMMAND,
				(payload) => {
					const figmaNode = $createFigmaNode(payload);
					$insertNodes([figmaNode]);
					return true;
				},
				COMMAND_PRIORITY_EDITOR,
			),
		);
	});

	return null;
}
