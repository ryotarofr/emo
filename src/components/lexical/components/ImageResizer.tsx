import { createSignal, onCleanup } from "solid-js";

interface ImageResizerProps {
	imageRef: HTMLImageElement;
	maxWidth: number;
	onResizeStart: () => void;
	onResizeEnd: (width: number, height: number) => void;
}

type Direction = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export default function ImageResizer(props: ImageResizerProps) {
	const [isResizing, setIsResizing] = createSignal(false);
	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let startHeight = 0;
	let ratio = 1;
	let currentDirection: Direction | null = null;

	const handlePointerDown = (event: PointerEvent, direction: Direction) => {
		event.preventDefault();
		event.stopPropagation();

		const image = props.imageRef;
		startX = event.clientX;
		startY = event.clientY;
		startWidth = image.offsetWidth;
		startHeight = image.offsetHeight;
		ratio = startWidth / startHeight;
		currentDirection = direction;

		setIsResizing(true);
		props.onResizeStart();

		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", handlePointerUp);
	};

	const handlePointerMove = (event: PointerEvent) => {
		if (!isResizing() || !currentDirection) return;

		const image = props.imageRef;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;

		let newWidth = startWidth;
		let newHeight = startHeight;

		// Calculate new dimensions based on direction
		switch (currentDirection) {
			case "e":
			case "se":
				newWidth = Math.max(50, Math.min(props.maxWidth, startWidth + dx));
				newHeight = newWidth / ratio;
				break;
			case "w":
			case "sw":
				newWidth = Math.max(50, Math.min(props.maxWidth, startWidth - dx));
				newHeight = newWidth / ratio;
				break;
			case "s":
				newHeight = Math.max(50, startHeight + dy);
				newWidth = newHeight * ratio;
				break;
			case "n":
				newHeight = Math.max(50, startHeight - dy);
				newWidth = newHeight * ratio;
				break;
			case "ne":
				newWidth = Math.max(50, Math.min(props.maxWidth, startWidth + dx));
				newHeight = newWidth / ratio;
				break;
			case "nw":
				newWidth = Math.max(50, Math.min(props.maxWidth, startWidth - dx));
				newHeight = newWidth / ratio;
				break;
		}

		// Apply constraints
		if (newWidth > props.maxWidth) {
			newWidth = props.maxWidth;
			newHeight = newWidth / ratio;
		}

		image.style.width = `${newWidth}px`;
		image.style.height = `${newHeight}px`;
	};

	const handlePointerUp = () => {
		if (!isResizing()) return;

		const image = props.imageRef;
		const width = image.offsetWidth;
		const height = image.offsetHeight;

		setIsResizing(false);
		currentDirection = null;

		document.removeEventListener("pointermove", handlePointerMove);
		document.removeEventListener("pointerup", handlePointerUp);

		props.onResizeEnd(width, height);
	};

	onCleanup(() => {
		document.removeEventListener("pointermove", handlePointerMove);
		document.removeEventListener("pointerup", handlePointerUp);
	});

	return (
		<>
			<div
				class="image-resizer image-resizer-n"
				onPointerDown={(e) => handlePointerDown(e, "n")}
			/>
			<div
				class="image-resizer image-resizer-ne"
				onPointerDown={(e) => handlePointerDown(e, "ne")}
			/>
			<div
				class="image-resizer image-resizer-e"
				onPointerDown={(e) => handlePointerDown(e, "e")}
			/>
			<div
				class="image-resizer image-resizer-se"
				onPointerDown={(e) => handlePointerDown(e, "se")}
			/>
			<div
				class="image-resizer image-resizer-s"
				onPointerDown={(e) => handlePointerDown(e, "s")}
			/>
			<div
				class="image-resizer image-resizer-sw"
				onPointerDown={(e) => handlePointerDown(e, "sw")}
			/>
			<div
				class="image-resizer image-resizer-w"
				onPointerDown={(e) => handlePointerDown(e, "w")}
			/>
			<div
				class="image-resizer image-resizer-nw"
				onPointerDown={(e) => handlePointerDown(e, "nw")}
			/>
		</>
	);
}
