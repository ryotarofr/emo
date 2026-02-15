import { createSignal, For, Show, onCleanup } from "solid-js";
import type { ToastMessage } from "../pages/dashboard/types";

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;

const [toasts, setToasts] = createSignal<ToastMessage[]>([]);

function addToast(msg: ToastMessage) {
	const toast: ToastMessage = { ...msg, duration: msg.duration ?? DEFAULT_DURATION };
	setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS));

	setTimeout(() => {
		setToasts((prev) => prev.filter((t) => t.id !== toast.id));
	}, toast.duration!);
}

export const toastManager = { addToast, toasts };

const typeColors: Record<ToastMessage["type"], string> = {
	success: "#22c55e",
	error: "#ef4444",
	info: "#3b82f6",
	warning: "#f97316",
};

export function ToastContainer() {
	return (
		<div
			style={{
				position: "fixed",
				bottom: "16px",
				right: "16px",
				display: "flex",
				"flex-direction": "column-reverse",
				gap: "8px",
				"z-index": "9999",
				"pointer-events": "none",
			}}
		>
			<For each={toasts()}>
				{(toast) => <ToastItem toast={toast} />}
			</For>
		</div>
	);
}

function ToastItem(props: { toast: ToastMessage }) {
	let ref: HTMLDivElement | undefined;

	// Trigger slide-in on mount
	setTimeout(() => ref?.classList.add("toast-visible"), 10);

	onCleanup(() => {
		ref?.classList.remove("toast-visible");
	});

	const dismiss = () => {
		setToasts((prev) => prev.filter((t) => t.id !== props.toast.id));
	};

	return (
		<div
			ref={ref}
			class="toast-slide-in"
			style={{
				background: "var(--demo-bg-surface, #1e1e2e)",
				color: "var(--demo-neutral-fg, #e0e0e0)",
				"border-left": `4px solid ${typeColors[props.toast.type]}`,
				"border-radius": "6px",
				padding: "10px 14px",
				"min-width": "260px",
				"max-width": "360px",
				"box-shadow": "0 4px 14px rgba(0,0,0,0.4)",
				"pointer-events": "auto",
				cursor: "pointer",
				"font-size": "13px",
				opacity: "0",
				transform: "translateX(100%)",
				transition: "opacity 0.3s ease, transform 0.3s ease",
			}}
			onClick={dismiss}
		>
			<div style={{ "font-weight": "600", "margin-bottom": props.toast.message ? "4px" : "0" }}>
				{props.toast.title}
			</div>
			<Show when={props.toast.message}>
				<div style={{ opacity: "0.8", "font-size": "12px" }}>{props.toast.message}</div>
			</Show>
		</div>
	);
}

// Inject keyframe-free animation class once
if (typeof document !== "undefined") {
	const style = document.createElement("style");
	style.textContent = `.toast-visible { opacity: 1 !important; transform: translateX(0) !important; }`;
	document.head.appendChild(style);
}
