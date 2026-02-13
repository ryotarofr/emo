import { apiCall } from "./api";
import type { User } from "./auth";

export type { User };

export interface CreateUserRequest {
	username: string;
	email?: string | null;
	display_name?: string | null;
}

export async function dbHealthCheck(): Promise<string> {
	return apiCall<string>("db_health_check", "GET", "/api/health");
}

export async function getUsers(): Promise<User[]> {
	return apiCall<User[]>("get_users", "GET", "/api/users");
}

export async function createUser(request: CreateUserRequest): Promise<User> {
	return apiCall<User>("create_user", "POST", "/api/users", {
		username: request.username,
		email: request.email ?? null,
		display_name: request.display_name ?? null,
	});
}
