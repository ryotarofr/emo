import { useLexicalComposerContext } from "@ryotarofr/lexical-solid/LexicalComposerContext";
import { DraggableBlockPlugin_EXPERIMENTAL } from "@ryotarofr/lexical-solid/LexicalDraggableBlockPlugin";
import { createSignal, type JSX, onMount, Show } from "solid-js";

function DraggableBlockIcon(): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="currentColor"
		>
			<circle cx="4" cy="3" r="1.5" />
			<circle cx="12" cy="3" r="1.5" />
			<circle cx="4" cy="8" r="1.5" />
			<circle cx="12" cy="8" r="1.5" />
			<circle cx="4" cy="13" r="1.5" />
			<circle cx="12" cy="13" r="1.5" />
		</svg>
	);
}

function DraggableBlockPluginInner(props: {
	anchorElem: HTMLElement;
}): JSX.Element {
	// Use signals to pass reactive accessors to the plugin
	const [menuRef, setMenuRef] = createSignal<HTMLElement | null>(null);
	const [targetLineRef, setTargetLineRef] = createSignal<HTMLElement | null>(
		null,
	);

	const isOnMenu = (element: HTMLElement): boolean => {
		return menuRef()?.contains(element) ?? false;
	};

	return (
		<DraggableBlockPlugin_EXPERIMENTAL
			anchorElem={props.anchorElem}
			menuRef={menuRef}
			targetLineRef={targetLineRef}
			menuComponent={
				<div ref={setMenuRef} class="draggable-block-menu">
					<DraggableBlockIcon />
				</div>
			}
			targetLineComponent={
				<div ref={setTargetLineRef} class="draggable-block-target-line" />
			}
			isOnMenu={isOnMenu}
		/>
	);
}

export default function DraggableBlockPlugin(): JSX.Element {
	const [editor] = useLexicalComposerContext();
	const [anchorElem, setAnchorElem] = createSignal<HTMLElement | null>(null);

	onMount(() => {
		const rootElement = editor.getRootElement();
		if (rootElement?.parentElement) {
			setAnchorElem(rootElement.parentElement);
		}
	});

	return (
		<Show when={anchorElem()}>
			{(anchor) => <DraggableBlockPluginInner anchorElem={anchor()} />}
		</Show>
	);
}
