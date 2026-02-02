//@ts-expect-error
import { registerCodeHighlighting } from "@lexical/code";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { onCleanup, onMount } from "solid-js";

export default function CodeHighlightPlugin() {
	const [editor] = useLexicalComposerContext();
	onMount(() => {
		onCleanup(registerCodeHighlighting(editor));
	});
	return null;
}
