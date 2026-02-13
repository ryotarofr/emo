import { useNavigate } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import { useAuth } from "../contexts/AuthContext";
import "./Login.css";

function Login() {
	const auth = useAuth();
	const navigate = useNavigate();

	const [mode, setMode] = createSignal<"login" | "register">("login");
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [username, setUsername] = createSignal("");
	const [error, setError] = createSignal("");
	const [loading, setLoading] = createSignal(false);

	createEffect(() => {
		if (auth.user()) {
			navigate("/");
		}
	});

	const handleEmailLogin = async () => {
		setError("");
		setLoading(true);
		try {
			if (mode() === "register") {
				await auth.register(username(), email(), password());
			} else {
				await auth.login(email(), password());
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	};

	const handleOAuth = async (provider: string) => {
		setError("");
		setLoading(true);
		try {
			await auth.loginWithOAuth(provider);
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div class="login-container">
			<div class="login-card">
				<h1>tebiki</h1>

				<div class="oauth-buttons">
					<button
						type="button"
						class="oauth-btn google"
						onClick={() => handleOAuth("google")}
						disabled={loading()}
					>
						Sign in with Google
					</button>
					<button
						type="button"
						class="oauth-btn github"
						onClick={() => handleOAuth("github")}
						disabled={loading()}
					>
						Sign in with GitHub
					</button>
				</div>

				<div class="divider">
					<span>or</span>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						const form = e.currentTarget;
						const formData = new FormData(form);
						setEmail(formData.get("email") as string);
						setPassword(formData.get("password") as string);
						if (mode() === "register") {
							setUsername(formData.get("username") as string);
						}
						handleEmailLogin();
					}}
				>
					<Show when={mode() === "register"}>
						<input
							type="text"
							name="username"
							placeholder="Username"
							required
						/>
					</Show>
					<input type="email" name="email" placeholder="Email" required />
					<input
						type="password"
						name="password"
						placeholder="Password (8+ characters)"
						required
						minLength={8}
					/>
					<button type="submit" class="submit-btn" disabled={loading()}>
						{loading()
							? "..."
							: mode() === "login"
								? "Sign In"
								: "Create Account"}
					</button>
				</form>

				<Show when={error()}>
					<p class="error-message">{error()}</p>
				</Show>

				<p class="toggle-mode">
					{mode() === "login"
						? "Don't have an account? "
						: "Already have an account? "}
					<button
						type="button"
						class="link-btn"
						onClick={() => setMode(mode() === "login" ? "register" : "login")}
					>
						{mode() === "login" ? "Sign Up" : "Sign In"}
					</button>
				</p>
			</div>
		</div>
	);
}

export default Login;
