import { apiCall } from "./api";

export interface User {
	id: string;
	username: string;
	email: string | null;
	display_name: string | null;
	is_active: boolean;
	avatar_url: string | null;
	created_at: string;
	updated_at: string;
}

export async function checkSession(): Promise<User | null> {
	return apiCall<User | null>("check_session", "GET", "/api/auth/session");
}

export async function loginWithPassword(
	email: string,
	password: string,
): Promise<User> {
	return apiCall<User>("login_with_password", "POST", "/api/auth/login", {
		email,
		password,
	});
}

export async function registerWithPassword(
	username: string,
	email: string,
	password: string,
): Promise<User> {
	return apiCall<User>("register_with_password", "POST", "/api/auth/register", {
		username,
		email,
		password,
	});
}

export async function startOAuth(provider: string): Promise<User> {
	// OAuth flow requires native Tauri IPC (browser open + local callback server)
	// Not available via HTTP — falls back to error in browser context
	const { isTauri } = await import("@tauri-apps/api/core");
	if (!isTauri()) {
		throw new Error("OAuth login is only available in the desktop app");
	}
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<User>("start_oauth", { provider });
}

export async function logout(): Promise<void> {
	await apiCall<null>("logout", "POST", "/api/auth/logout");
}
