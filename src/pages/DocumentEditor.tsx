import { useParams } from "@solidjs/router";
import { EyeIcon, PencilIcon } from "lucide-solid";
import { createSignal, onCleanup, onMount, Show, useContext } from "solid-js";
import { NavItemsContext } from "../App";
import RichTextEditor from "../components/lexical/components/RichTextEditor";
import "./DocumentEditor.css";

type EditorMode = "edit" | "preview";

export default function DocumentEditor() {
	const params = useParams<{ id: string }>();
	const navCtx = useContext(NavItemsContext);

	const [mode, setMode] = createSignal<EditorMode>("edit");
	const initialHtml = navCtx?.getDocumentContent(params.id) ?? "";
	const [htmlContent, setHtmlContent] = createSignal(initialHtml);

	const item = () => navCtx?.findItem(params.id);

	// HTML変更ハンドラ
	let initialized = false;
	const handleHtmlChange = (html: string) => {
		// 初回の発火（Lexical マウント時）はスキップして上書きを防ぐ
		if (!initialized) {
			initialized = true;
			if (initialHtml) return;
		}
		setHtmlContent(html);
		navCtx?.setDocumentContent(params.id, html);
	};

	// Ctrl+S / Cmd+S ハンドラ
	const handleKeyDown = (e: KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key === "s") {
			e.preventDefault();
			navCtx?.saveNow();
		}
	};

	onMount(() => {
		document.addEventListener("keydown", handleKeyDown);
	});
	onCleanup(() => {
		document.removeEventListener("keydown", handleKeyDown);
	});

	return (
		<div class="doceditor-container">
			<div class="doceditor-header">
				<h1 class="doceditor-title">
					{item()?.name ?? `Document ${params.id}`}
				</h1>
				<div class="doceditor-header-right">
					<Show when={navCtx && !navCtx.dirty()}>
						<span class="doceditor-save-indicator">{"\u2713"} 保存済み</span>
					</Show>
					<div class="doceditor-mode-toggle">
						<button
							type="button"
							class="doceditor-mode-button"
							classList={{ "doceditor-mode-active": mode() === "edit" }}
							onClick={() => setMode("edit")}
						>
							<PencilIcon />
							<span>編集</span>
						</button>
						<button
							type="button"
							class="doceditor-mode-button"
							classList={{ "doceditor-mode-active": mode() === "preview" }}
							onClick={() => setMode("preview")}
						>
							<EyeIcon />
							<span>プレビュー</span>
						</button>
					</div>
				</div>
			</div>

			<div class="doceditor-body">
				<div
					class="doceditor-editor"
					classList={{ "doceditor-hidden": mode() !== "edit" }}
				>
					<RichTextEditor
						initialHtml={initialHtml}
						onHtmlChange={handleHtmlChange}
					/>
				</div>

				<div
					class="doceditor-preview"
					classList={{ "doceditor-hidden": mode() !== "preview" }}
				>
					{htmlContent() ? (
						<div class="doceditor-preview-content" innerHTML={htmlContent()} />
					) : (
						<p class="doceditor-preview-empty">
							コンテンツがありません。編集モードで入力してください。
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
