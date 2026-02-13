import { useParams } from "@solidjs/router";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { createEffect, createSignal, on, Show, useContext } from "solid-js";
import { NavItemsContext } from "../App";
import "./FileViewer.css";

export default function FileViewer() {
	const params = useParams<{ id: string }>();
	const navCtx = useContext(NavItemsContext);

	const [textContent, setTextContent] = createSignal("");
	const [imageSrc, setImageSrc] = createSignal("");
	const [loading, setLoading] = createSignal(true);
	const [error, setError] = createSignal("");

	const item = () => navCtx?.findItem(params.id);
	const isImage = () => item()?.fileContentType === "image";
	const isText = () => item()?.fileContentType === "text";

	createEffect(
		on(
			() => params.id,
			async () => {
				setLoading(true);
				setError("");
				setTextContent("");
				setImageSrc("");

				const navItem = item();
				if (!navItem) {
					setError("アイテムが見つかりません");
					setLoading(false);
					return;
				}

				try {
					if (navItem.fileContentType === "image") {
						if (navItem.filePath) {
							setImageSrc(convertFileSrc(navItem.filePath));
						} else if (navItem.fileUrl) {
							setImageSrc(navItem.fileUrl);
						}
					} else if (navItem.fileContentType === "text") {
						if (navItem.filePath) {
							const content = await readTextFile(navItem.filePath);
							setTextContent(content);
						} else if (navItem.fileUrl) {
							const res = await fetch(navItem.fileUrl);
							const content = await res.text();
							setTextContent(content);
						}
					}
				} catch (e) {
					setError(`ファイルの読み込みに失敗しました: ${e}`);
				} finally {
					setLoading(false);
				}
			},
		),
	);

	return (
		<div class="fileviewer-container">
			<div class="fileviewer-header">
				<h1>{item()?.name ?? `File ${params.id}`}</h1>
				<Show when={item()?.filePath || item()?.fileUrl}>
					<span class="fileviewer-path">
						{item()?.filePath || item()?.fileUrl}
					</span>
				</Show>
			</div>

			<div class="fileviewer-content">
				<Show when={loading()}>
					<div class="fileviewer-loading">読み込み中...</div>
				</Show>

				<Show when={error()}>
					<div class="fileviewer-error">{error()}</div>
				</Show>

				<Show when={!loading() && !error()}>
					<Show when={isImage()}>
						<div class="fileviewer-image-wrapper">
							<img
								class="fileviewer-image"
								src={imageSrc()}
								alt={item()?.name ?? ""}
							/>
						</div>
					</Show>

					<Show when={isText()}>
						<pre class="fileviewer-text">{textContent()}</pre>
					</Show>
				</Show>
			</div>
		</div>
	);
}
