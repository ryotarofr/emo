import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { createSignal, onCleanup, onMount } from "solid-js";
import "./GridStackSample.css";

export default function GridStackSample() {
	let gridRef!: HTMLDivElement;
	const [grid, setGrid] = createSignal<GridStack | null>(null);
	const [widgetCount, setWidgetCount] = createSignal(3);

	onMount(() => {
		const gridInstance = GridStack.init(
			{
				column: 12,
				cellHeight: 80,
				margin: 10,
				float: true,
				removable: ".trash",
				acceptWidgets: true,
			},
			gridRef,
		);

		setGrid(gridInstance);

		onCleanup(() => {
			gridInstance.destroy(false);
		});
	});

	const addWidget = () => {
		const g = grid();
		if (!g) return;

		const newCount = widgetCount() + 1;
		setWidgetCount(newCount);

		g.addWidget({
			x: Math.floor(Math.random() * 6),
			y: 0,
			w: 2,
			h: 2,
			content: `<div class="widget-content">Widget ${newCount}</div>`,
		});
	};

	const saveLayout = () => {
		const g = grid();
		if (!g) return;

		const layout = g.save();
		console.log("Saved layout:", layout);
		localStorage.setItem("gridstack-layout", JSON.stringify(layout));
	};

	const loadLayout = () => {
		const g = grid();
		if (!g) return;

		const saved = localStorage.getItem("gridstack-layout");
		if (saved) {
			const layout = JSON.parse(saved);
			g.load(layout);
		}
	};

	const clearGrid = () => {
		const g = grid();
		if (!g) return;

		g.removeAll();
		setWidgetCount(0);
	};

	return (
		<div class="gridstack-container">
			<div class="gridstack-toolbar">
				<button type="button" onClick={addWidget}>
					Add Widget
				</button>
				<button type="button" onClick={saveLayout}>
					Save Layout
				</button>
				<button type="button" onClick={loadLayout}>
					Load Layout
				</button>
				<button type="button" onClick={clearGrid}>
					Clear All
				</button>
				<div class="trash">Drop here to remove</div>
			</div>

			<div ref={gridRef} class="grid-stack">
				<div class="grid-stack-item" gs-w="4" gs-h="2" gs-x="0" gs-y="0">
					<div class="grid-stack-item-content">
						<div class="widget-content">Widget 1</div>
					</div>
				</div>
				<div class="grid-stack-item" gs-w="4" gs-h="2" gs-x="4" gs-y="0">
					<div class="grid-stack-item-content">
						<div class="widget-content">Widget 2</div>
					</div>
				</div>
				<div class="grid-stack-item" gs-w="4" gs-h="2" gs-x="8" gs-y="0">
					<div class="grid-stack-item-content">
						<div class="widget-content">Widget 3</div>
					</div>
				</div>
			</div>
		</div>
	);
}
