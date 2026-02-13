import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import type {
	EditorState,
	Klass,
	LexicalEditor,
	LexicalNode,
	LexicalNodeReplacement,
} from "lexical";
import { $getRoot, $insertNodes } from "lexical";
import "./RichTextEditor.css";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { ListItemNode, ListNode } from "@lexical/list";
import { TRANSFORMERS } from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { AutoFocusPlugin } from "@ryotarofr/lexical-solid/LexicalAutoFocusPlugin";
import { CheckListPlugin } from "@ryotarofr/lexical-solid/LexicalCheckListPlugin";
import { LexicalComposer } from "@ryotarofr/lexical-solid/LexicalComposer";
import { ContentEditable } from "@ryotarofr/lexical-solid/LexicalContentEditable";
import { LexicalErrorBoundary } from "@ryotarofr/lexical-solid/LexicalErrorBoundary";
import { HistoryPlugin } from "@ryotarofr/lexical-solid/LexicalHistoryPlugin";
import { HorizontalRuleNode } from "@ryotarofr/lexical-solid/LexicalHorizontalRuleNode";
import { HorizontalRulePlugin } from "@ryotarofr/lexical-solid/LexicalHorizontalRulePlugin";
import { LinkPlugin } from "@ryotarofr/lexical-solid/LexicalLinkPlugin";
import { ListPlugin } from "@ryotarofr/lexical-solid/LexicalListPlugin";
import { LexicalMarkdownShortcutPlugin } from "@ryotarofr/lexical-solid/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@ryotarofr/lexical-solid/LexicalOnChangePlugin";
import { RichTextPlugin } from "@ryotarofr/lexical-solid/LexicalRichTextPlugin";
import { TablePlugin } from "@ryotarofr/lexical-solid/LexicalTablePlugin";
import {
	CollapsibleContainerNode,
	CollapsibleContentNode,
	CollapsibleTitleNode,
} from "../nodes/CollapsibleNodes";
import { FigmaNode } from "../nodes/FigmaNode";
import { ImageNode } from "../nodes/ImageNode";
import { LayoutContainerNode, LayoutItemNode } from "../nodes/LayoutNodes";
import { MentionNode } from "../nodes/MentionNode";
import { PageBreakNode } from "../nodes/PageBreakNode";
import { TweetNode } from "../nodes/TweetNode";
import { YouTubeNode } from "../nodes/YouTubeNode";
import AutoEmbedPlugin from "../plugins/AutoEmbedPlugin";
import CodeHighlightPlugin from "../plugins/CodeHighlightPlugin";
import CollapsiblePlugin from "../plugins/CollapsiblePlugin";
import ComponentPickerPlugin from "../plugins/ComponentPickerPlugin";
import DraggableBlockPlugin from "../plugins/DraggableBlockPlugin";
import EmojiPickerPlugin from "../plugins/EmojiPickerPlugin";
import FigmaPlugin from "../plugins/FigmaPlugin";
import FloatingTextFormatToolbarPlugin from "../plugins/FloatingTextFormatToolbarPlugin";
import ImagesPlugin from "../plugins/ImagesPlugin";
import LayoutPlugin from "../plugins/LayoutPlugin";
import MentionsPlugin from "../plugins/MentionsPlugin";
import PageBreakPlugin from "../plugins/PageBreakPlugin";
import TableActionMenuPlugin from "../plugins/TableActionMenuPlugin";
import ToolbarPlugin from "../plugins/ToolbarPlugin";
import TreeViewPlugin from "../plugins/TreeViewPlugin";
import TwitterPlugin from "../plugins/TwitterPlugin";
import YouTubePlugin from "../plugins/YouTubePlugin";
import RichTextTheme from "./RichTextTheme";

//import { EmojiNode } from "./nodes/EmojiNode";
//import EmoticonPlugin from "./plugins/EmoticonPlugin";

interface RichTextEditorProps {
	initialHtml?: string;
	onHtmlChange?: (html: string) => void;
}

function Placeholder() {
	return <div class="editor-placeholder">Enter some plain text...</div>;
}

const editorConfig = {
	// The editor theme
	theme: RichTextTheme,
	namespace: "",
	// Handling of errors during update
	onError(error: Error) {
		throw error;
	},
	// Any custom nodes go here
	nodes: [
		HeadingNode,
		ListNode,
		ListItemNode,
		QuoteNode,
		CodeNode,
		CodeHighlightNode,
		TableNode,
		TableCellNode,
		TableRowNode,
		AutoLinkNode,
		LinkNode,
		HorizontalRuleNode,
		ImageNode,
		MentionNode,
		YouTubeNode,
		TweetNode,
		FigmaNode,
		CollapsibleContainerNode,
		CollapsibleTitleNode,
		CollapsibleContentNode,
		LayoutContainerNode,
		LayoutItemNode,
		PageBreakNode,
	] as ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement>,
};

export default function Editor(props: RichTextEditorProps) {
	const handleChange = (
		_editorState: EditorState,
		_tags: Set<string>,
		editor: LexicalEditor,
	) => {
		editor.read(() => {
			const html = $generateHtmlFromNodes(editor);
			props.onHtmlChange?.(html);
		});
	};

	const config = {
		...editorConfig,
		editorState: props.initialHtml
			? (editor: LexicalEditor) => {
					const html = props.initialHtml as string;
					const parser = new DOMParser();
					const dom = parser.parseFromString(html, "text/html");
					const nodes = $generateNodesFromDOM(editor, dom);
					$getRoot().clear();
					$insertNodes(nodes);
				}
			: undefined,
	};

	return (
		<LexicalComposer initialConfig={config}>
			<div class="editor-container">
				<ToolbarPlugin />
				<div class="editor-inner">
					<RichTextPlugin
						contentEditable={<ContentEditable class="editor-input" />}
						placeholder={<Placeholder />}
						errorBoundary={LexicalErrorBoundary}
					/>
					<LinkPlugin />
					<ListPlugin />
					<CheckListPlugin />
					<HorizontalRulePlugin />
					<ImagesPlugin />
					<TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />
					<TableActionMenuPlugin />
					<LexicalMarkdownShortcutPlugin transformers={TRANSFORMERS} />
					<AutoFocusPlugin />
					<OnChangePlugin onChange={handleChange} />
					<HistoryPlugin />
					<TreeViewPlugin />
					<CodeHighlightPlugin />
					<FloatingTextFormatToolbarPlugin />
					<ComponentPickerPlugin />
					<EmojiPickerPlugin />
					<MentionsPlugin />
					<YouTubePlugin />
					<TwitterPlugin />
					<AutoEmbedPlugin />
					<FigmaPlugin />
					<CollapsiblePlugin />
					<LayoutPlugin />
					<PageBreakPlugin />
					<DraggableBlockPlugin />
				</div>
			</div>
		</LexicalComposer>
	);
}
