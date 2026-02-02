import { $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_EDITOR,
	COMMAND_PRIORITY_HIGH,
	DRAGOVER_COMMAND,
	DRAGSTART_COMMAND,
	DROP_COMMAND,
} from "lexical";
import { createEffect, onCleanup } from "solid-js";
import {
	$createImageNode,
	$isImageNode,
	ImageNode,
	type ImagePayload,
	INSERT_IMAGE_COMMAND,
} from "../nodes/ImageNode";

const TRANSPARENT_IMAGE =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function canDropImage(event: DragEvent): boolean {
	const target = event.target;
	return !!(
		target &&
		target instanceof HTMLElement &&
		!target.closest("code, span.editor-image") &&
		target.parentElement &&
		target.parentElement.closest("div.editor-input")
	);
}

function getDragImageData(event: DragEvent): null | ImagePayload {
	const dragData = event.dataTransfer?.getData("application/x-lexical-drag");
	if (!dragData) {
		return null;
	}
	try {
		const { type, data } = JSON.parse(dragData);
		if (type === "image") {
			return data;
		}
	} catch {
		return null;
	}
	return null;
}

declare global {
	interface DragEvent {
		rangeOffset?: number;
		rangeParent?: Node;
	}
}

function getImageFromSelection(): ImagePayload | null {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) {
		return null;
	}
	const nodes = selection.getNodes();
	if (nodes.length !== 1) {
		return null;
	}
	const node = nodes[0];
	if ($isImageNode(node)) {
		return {
			src: node.getSrc(),
			altText: node.getAltText(),
			width: node.getWidth(),
			height: node.getHeight(),
		};
	}
	return null;
}

export default function ImagesPlugin(): null {
	const [editor] = useLexicalComposerContext();

	createEffect(() => {
		if (!editor.hasNodes([ImageNode])) {
			throw new Error("ImagesPlugin: ImageNode not registered on editor");
		}

		// Create transparent image element for this plugin instance
		const img =
			typeof window !== "undefined" ? document.createElement("img") : null;
		if (img) {
			img.src = TRANSPARENT_IMAGE;
		}

		onCleanup(
			mergeRegister(
				editor.registerCommand<ImagePayload>(
					INSERT_IMAGE_COMMAND,
					(payload) => {
						const imageNode = $createImageNode(payload);
						$insertNodeToNearestRoot(imageNode);
						return true;
					},
					COMMAND_PRIORITY_EDITOR,
				),
				editor.registerCommand<DragEvent>(
					DRAGSTART_COMMAND,
					(event) => {
						return onDragStart(event, img);
					},
					COMMAND_PRIORITY_HIGH,
				),
				editor.registerCommand<DragEvent>(
					DRAGOVER_COMMAND,
					(event) => {
						return onDragover(event);
					},
					COMMAND_PRIORITY_HIGH,
				),
				editor.registerCommand<DragEvent>(
					DROP_COMMAND,
					(event) => {
						return onDrop(event, editor);
					},
					COMMAND_PRIORITY_HIGH,
				),
			),
		);
	});

	return null;
}

function onDragStart(event: DragEvent, img: HTMLImageElement | null): boolean {
	const node = getImageFromSelection();
	if (!node) {
		return false;
	}
	const dataTransfer = event.dataTransfer;
	if (!dataTransfer) {
		return false;
	}
	dataTransfer.setData("text/plain", "_");
	dataTransfer.setData(
		"application/x-lexical-drag",
		JSON.stringify({
			type: "image",
			data: node,
		}),
	);
	if (img) {
		dataTransfer.setDragImage(img, 0, 0);
	}
	return true;
}

function onDragover(event: DragEvent): boolean {
	const node = getDragImageData(event);
	if (!node) {
		return false;
	}
	if (!canDropImage(event)) {
		event.preventDefault();
	}
	return true;
}

function onDrop(event: DragEvent, editor: any): boolean {
	const node = getDragImageData(event);
	if (!node) {
		return false;
	}
	event.preventDefault();

	editor.update(() => {
		const imageNode = $createImageNode(node);
		$insertNodeToNearestRoot(imageNode);
	});

	return true;
}
