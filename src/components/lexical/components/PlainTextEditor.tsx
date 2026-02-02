import { AutoFocusPlugin } from "@ryotarofr/lexical-solid/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@ryotarofr/lexical-solid/LexicalComposer";
import { ContentEditable } from "@ryotarofr/lexical-solid/LexicalContentEditable";
import { LexicalErrorBoundary } from "@ryotarofr/lexical-solid/LexicalErrorBoundary";
import { HistoryPlugin } from "@ryotarofr/lexical-solid/LexicalHistoryPlugin";
import { OnChangePlugin } from "@ryotarofr/lexical-solid/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@ryotarofr/lexical-solid/LexicalPlainTextPlugin";
import {
	$getRoot,
	$getSelection,
	type EditorState,
	type LexicalEditor,
} from "lexical";
import TreeViewPlugin from "../plugins/TreeViewPlugin";
import ExampleTheme from "../themes/PlainTextTheme";

//import { EmojiNode } from "./nodes/EmojiNode";
//import EmoticonPlugin from "./plugins/EmoticonPlugin";

function Placeholder() {
	return <div class="editor-placeholder">Enter some plain text...</div>;
}

// When the editor changes, you can get notified via the
// LexicalOnChangePlugin!
function onChange(
	editorState: EditorState,
	_tags: Set<string>,
	_editor: LexicalEditor,
) {
	editorState.read(() => {
		// Read the contents of the EditorState here.
		const root = $getRoot();
		const selection = $getSelection();

		console.log(root, selection);
	});
}

const editorConfig = {
	// The editor theme
	theme: ExampleTheme,
	namespace: "",
	// Handling of errors during update
	onError(error: any) {
		throw error;
	},
	// Any custom nodes go here
	//nodes: [EmojiNode]
};

export default function Editor() {
	return (
		<LexicalComposer initialConfig={editorConfig}>
			<div class="editor-container">
				<PlainTextPlugin
					contentEditable={<ContentEditable class="editor-input" />}
					placeholder={<Placeholder />}
					errorBoundary={LexicalErrorBoundary}
				/>
				<OnChangePlugin onChange={onChange} />
				<HistoryPlugin />
				<TreeViewPlugin />
				{/*<EmoticonPlugin />*/}
				<AutoFocusPlugin />
			</div>
		</LexicalComposer>
	);
}
