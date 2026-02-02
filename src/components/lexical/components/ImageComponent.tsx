import { mergeRegister } from "@lexical/utils";
import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { useLexicalNodeSelection } from "@ryotarofr/lexical-solid/useLexicalNodeSelection";
import {
	$getNodeByKey,
	$getSelection,
	$isNodeSelection,
	CLICK_COMMAND,
	COMMAND_PRIORITY_LOW,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_ESCAPE_COMMAND,
	type NodeKey,
} from "lexical";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { $isImageNode } from "../nodes/ImageNode";
import ImageResizer from "./ImageResizer";

export interface ImageComponentProps {
	src: string;
	altText: string;
	width: number;
	height: number;
	maxWidth: number;
	nodeKey: NodeKey;
}

export default function ImageComponent(props: ImageComponentProps) {
	const [editor] = useLexicalComposerContext();
	const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(
		props.nodeKey,
	);
	const [isResizing, setIsResizing] = createSignal(false);
	let imageRef: HTMLImageElement | undefined;

	const onDelete = (payload: KeyboardEvent) => {
		if (isSelected() && $isNodeSelection($getSelection())) {
			const event = payload;
			event.preventDefault();
			const node = $getNodeByKey(props.nodeKey);
			if ($isImageNode(node)) {
				node.remove();
				return true;
			}
		}
		return false;
	};

	const onEnter = (event: KeyboardEvent) => {
		const latestSelection = $getSelection();
		if (
			isSelected() &&
			$isNodeSelection(latestSelection) &&
			latestSelection.getNodes().length === 1
		) {
			event.preventDefault();
			return true;
		}
		return false;
	};

	const onEscape = (event: KeyboardEvent) => {
		if (isSelected()) {
			event.preventDefault();
			clearSelection();
			return true;
		}
		return false;
	};

	createEffect(() => {
		onCleanup(
			mergeRegister(
				editor.registerCommand<MouseEvent>(
					CLICK_COMMAND,
					(payload) => {
						const event = payload;
						if (isResizing()) {
							return true;
						}
						if (event.target === imageRef) {
							if (event.shiftKey) {
								setSelected(!isSelected());
							} else {
								clearSelection();
								setSelected(true);
							}
							return true;
						}
						return false;
					},
					COMMAND_PRIORITY_LOW,
				),
				editor.registerCommand(
					KEY_DELETE_COMMAND,
					onDelete,
					COMMAND_PRIORITY_LOW,
				),
				editor.registerCommand(
					KEY_BACKSPACE_COMMAND,
					onDelete,
					COMMAND_PRIORITY_LOW,
				),
				editor.registerCommand(
					KEY_ENTER_COMMAND,
					onEnter,
					COMMAND_PRIORITY_LOW,
				),
				editor.registerCommand(
					KEY_ESCAPE_COMMAND,
					onEscape,
					COMMAND_PRIORITY_LOW,
				),
			),
		);
	});

	const onResizeEnd = (nextWidth: number, nextHeight: number) => {
		setTimeout(() => {
			setIsResizing(false);
		}, 200);

		editor.update(() => {
			const node = $getNodeByKey(props.nodeKey);
			if ($isImageNode(node)) {
				node.setWidthAndHeight(nextWidth, nextHeight);
			}
		});
	};

	const onResizeStart = () => {
		setIsResizing(true);
	};

	const draggable = isSelected() && $isNodeSelection($getSelection());
	const isFocused = isSelected();

	return (
		<div draggable={draggable}>
			<div class={isFocused ? "image-wrapper focused" : "image-wrapper"}>
				<img
					ref={imageRef}
					src={props.src}
					alt={props.altText}
					style={{
						width: props.width ? `${props.width}px` : "inherit",
						height: props.height ? `${props.height}px` : "inherit",
						"max-width": `${props.maxWidth}px`,
					}}
					draggable="false"
				/>
				<Show when={isFocused}>
					<ImageResizer
						imageRef={imageRef!}
						maxWidth={props.maxWidth}
						onResizeStart={onResizeStart}
						onResizeEnd={onResizeEnd}
					/>
				</Show>
			</div>
		</div>
	);
}
