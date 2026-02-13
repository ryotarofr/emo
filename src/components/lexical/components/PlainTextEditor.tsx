import { AutoFocusPlugin } from "@ryotarofr/lexical-solid/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@ryotarofr/lexical-solid/LexicalComposer";
import { ContentEditable } from "@ryotarofr/lexical-solid/LexicalContentEditable";
import { LexicalErrorBoundary } from "@ryotarofr/lexical-solid/LexicalErrorBoundary";
import { HistoryPlugin } from "@ryotarofr/lexical-solid/LexicalHistoryPlugin";
import { OnChangePlugin } from "@ryotarofr/lexical-solid/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@ryotarofr/lexical-solid/LexicalPlainTextPlugin";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	type EditorState,
	type LexicalEditor,
} from "lexical";
import ExampleTheme from "../themes/PlainTextTheme";

interface PlainTextEditorProps {
	onTextChange?: (text: string) => void;
	initialText?: string;
	placeholder?: string;
}

function Placeholder(props: { text: string }) {
	return <div class="editor-placeholder">{props.text}</div>;
}

export default function Editor(props: PlainTextEditorProps) {
	const editorConfig = {
		theme: ExampleTheme,
		namespace: "plain-text-editor",
		onError(error: unknown) {
			throw error;
		},
		editorState: props.initialText
			? (_editor: LexicalEditor) => {
					const root = $getRoot();
					const paragraph = $createParagraphNode();
					paragraph.append($createTextNode(props.initialText ?? ""));
					root.append(paragraph);
				}
			: undefined,
	};

	const handleChange = (
		editorState: EditorState,
		_tags: Set<string>,
		_editor: LexicalEditor,
	) => {
		editorState.read(() => {
			const text = $getRoot().getTextContent();
			props.onTextChange?.(text);
		});
	};

	return (
		<LexicalComposer initialConfig={editorConfig}>
			<div class="editor-container">
				<PlainTextPlugin
					contentEditable={<ContentEditable class="editor-input" />}
					placeholder={
						<Placeholder text={props.placeholder ?? "テキストを入力..."} />
					}
					errorBoundary={LexicalErrorBoundary}
				/>
				<OnChangePlugin onChange={handleChange} />
				<HistoryPlugin />
				<AutoFocusPlugin />
			</div>
		</LexicalComposer>
	);
}
