import type { Accessor, ParentProps } from "solid-js";
import { createContext, createSignal, onMount, useContext } from "solid-js";
import {
	checkSession,
	loginWithPassword,
	logout as logoutApi,
	registerWithPassword,
	startOAuth,
	type User,
} from "../utils/auth";

interface AuthContextValue {
	user: Accessor<User | null>;
	loading: Accessor<boolean>;
	login: (email: string, password: string) => Promise<void>;
	register: (
		username: string,
		email: string,
		password: string,
	) => Promise<void>;
	loginWithOAuth: (provider: string) => Promise<void>;
	logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>();

export function AuthProvider(props: ParentProps) {
	const [user, setUser] = createSignal<User | null>(null);
	const [loading, setLoading] = createSignal(true);

	onMount(async () => {
		try {
			const u = await checkSession();
			setUser(u);
		} catch (e) {
			console.error("Session check failed:", e);
		} finally {
			setLoading(false);
		}
	});

	const login = async (email: string, password: string) => {
		const u = await loginWithPassword(email, password);
		setUser(u);
	};

	const register = async (
		username: string,
		email: string,
		password: string,
	) => {
		const u = await registerWithPassword(username, email, password);
		setUser(u);
	};

	const loginWithOAuthFn = async (provider: string) => {
		const u = await startOAuth(provider);
		setUser(u);
	};

	const logoutFn = async () => {
		await logoutApi();
		setUser(null);
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				loading,
				login,
				register,
				loginWithOAuth: loginWithOAuthFn,
				logout: logoutFn,
			}}
		>
			{props.children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}
