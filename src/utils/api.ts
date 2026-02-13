import { isTauri } from "@tauri-apps/api/core";

let apiBaseUrl: string | null = null;
let useTauriIpc = false;

/**
 * Initialize the API layer.
 * - In Tauri: uses IPC (invoke) for all calls
 * - In browser: uses HTTP fetch against the embedded Axum server
 */
async function ensureInitialized(): Promise<void> {
	if (apiBaseUrl !== null) return;

	if (isTauri()) {
		useTauriIpc = true;
		// Also resolve the HTTP base URL for any future HTTP-only calls
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			const port = await invoke<number>("get_api_port");
			apiBaseUrl = `http://127.0.0.1:${port}`;
		} catch {
			apiBaseUrl = "";
		}
	} else {
		useTauriIpc = false;
		// Browser mode: use VITE_API_URL env var, or prompt user
		const envUrl = import.meta.env.VITE_API_URL;
		if (envUrl) {
			apiBaseUrl = envUrl;
		} else {
			// Default: assume Axum is running on the same host, try common dev port
			apiBaseUrl = "";
		}
	}
}

/**
 * Unified API call that works in both Tauri (IPC) and browser (HTTP) contexts.
 *
 * - Tauri: uses invoke() for fast IPC calls
 * - Browser: uses fetch() against the embedded Axum HTTP server
 */
export async function apiCall<T>(
	tauriCommand: string,
	httpMethod: "GET" | "POST",
	httpPath: string,
	// biome-ignore lint/suspicious/noExplicitAny: needs flexibility for both Tauri invoke and fetch
	args?: Record<string, any>,
): Promise<T> {
	await ensureInitialized();

	if (useTauriIpc) {
		const { invoke } = await import("@tauri-apps/api/core");
		return invoke<T>(tauriCommand, args);
	}

	const url = `${apiBaseUrl}${httpPath}`;

	const options: RequestInit = {
		method: httpMethod,
		headers: { "Content-Type": "application/json" },
	};

	if (httpMethod === "POST" && args) {
		options.body = JSON.stringify(args);
	}

	const response = await fetch(url, options);

	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.error || `HTTP ${response.status}`);
	}

	return response.json();
}

/**
 * Get the HTTP base URL for the API server.
 * Useful for constructing URLs outside of apiCall.
 */
export async function getApiBaseUrl(): Promise<string> {
	await ensureInitialized();
	return apiBaseUrl ?? "";
}
