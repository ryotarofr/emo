import type { EventEnvelope } from "./agent";
import { getApiBaseUrl } from "./api";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let listeners: Array<(event: EventEnvelope) => void> = [];
let shouldReconnect = true;
let reconnectAttempt = 0;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

async function getWsUrl(): Promise<string> {
	const httpBase = await getApiBaseUrl();
	const wsBase = httpBase.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
	return `${wsBase}/api/ws`;
}

export async function connectWebSocket(): Promise<void> {
	if (
		ws &&
		(ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
	) {
		return;
	}

	shouldReconnect = true;
	const url = await getWsUrl();

	try {
		ws = new WebSocket(url);
	} catch {
		scheduleReconnect();
		return;
	}

	ws.onopen = () => {
		console.log("[ws] Connected");
		reconnectAttempt = 0;
	};

	ws.onmessage = (event) => {
		try {
			const envelope: EventEnvelope = JSON.parse(event.data);
			for (const listener of listeners) {
				listener(envelope);
			}
		} catch (e) {
			console.error("[ws] Failed to parse message:", e);
		}
	};

	ws.onclose = () => {
		console.log("[ws] Disconnected");
		ws = null;
		if (shouldReconnect) {
			scheduleReconnect();
		}
	};

	ws.onerror = () => {
		ws?.close();
	};
}

function scheduleReconnect(): void {
	if (reconnectTimer) return;
	const delay = Math.min(
		RECONNECT_BASE_MS * 2 ** reconnectAttempt,
		RECONNECT_MAX_MS,
	);
	reconnectAttempt++;
	console.log(`[ws] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		if (shouldReconnect) {
			connectWebSocket();
		}
	}, delay);
}

export function disconnectWebSocket(): void {
	shouldReconnect = false;
	reconnectAttempt = 0;
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	if (ws) {
		ws.close();
		ws = null;
	}
	listeners = [];
}

export function onExecutionEvent(
	handler: (event: EventEnvelope) => void,
): () => void {
	listeners.push(handler);
	return () => {
		listeners = listeners.filter((l) => l !== handler);
	};
}
