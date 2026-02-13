import { invoke } from "@tauri-apps/api/core";
import { createSignal, For, Show } from "solid-js";
import logo from "../assets/logo.svg";
import { useAuth } from "../contexts/AuthContext";
import { createUser, dbHealthCheck, getUsers, type User } from "../utils/db";

function Home() {
	const auth = useAuth();
	const [greetMsg, setGreetMsg] = createSignal("");
	const [name, setName] = createSignal("");

	// DB state
	const [dbStatus, setDbStatus] = createSignal("");
	const [dbError, setDbError] = createSignal("");
	const [users, setUsers] = createSignal<User[]>([]);

	async function greet() {
		setGreetMsg(await invoke("greet", { name: name() }));
	}

	async function checkHealth() {
		setDbStatus("");
		setDbError("");
		try {
			const msg = await dbHealthCheck();
			setDbStatus(msg);
		} catch (e) {
			setDbError(String(e));
		}
	}

	async function loadUsers() {
		setDbError("");
		try {
			setUsers(await getUsers());
		} catch (e) {
			setDbError(String(e));
		}
	}

	async function addTestUser() {
		setDbError("");
		try {
			const user = await createUser({
				username: `testuser_${Date.now()}`,
				email: `test_${Date.now()}@example.com`,
				display_name: "Test User",
			});
			setDbStatus(`Created user: ${user.username}`);
			await loadUsers();
		} catch (e) {
			setDbError(String(e));
		}
	}

	return (
		<div style={{ padding: "1.5rem" }}>
			<Show when={auth.user()}>
				<div
					style={{
						display: "flex",
						"justify-content": "flex-end",
						"align-items": "center",
						gap: "1rem",
						padding: "0.5rem 0",
					}}
				>
					<span>
						Logged in as{" "}
						<strong>
							{auth.user()?.display_name || auth.user()?.username}
						</strong>
					</span>
					<button type="button" onClick={() => auth.logout()}>
						Logout
					</button>
				</div>
			</Show>

			<h1>Welcome to Tauri + Solid</h1>

			<div class="row">
				<a href="https://vite.dev" target="_blank" rel="noopener noreferrer">
					<img src="/vite.svg" class="logo vite" alt="Vite logo" />
				</a>
				<a href="https://tauri.app" target="_blank" rel="noopener noreferrer">
					<img src="/tauri.svg" class="logo tauri" alt="Tauri logo" />
				</a>
				<a href="https://solidjs.com" target="_blank" rel="noopener noreferrer">
					<img src={logo} class="logo solid" alt="Solid logo" />
				</a>
			</div>
			<p>Click on the Tauri, Vite, and Solid logos to learn more.</p>

			<form
				class="row"
				onSubmit={(e) => {
					e.preventDefault();
					greet();
				}}
			>
				<input
					id="greet-input"
					onChange={(e) => setName(e.currentTarget.value)}
					placeholder="Enter a name..."
				/>
				<button type="submit">Greet</button>
			</form>
			<p>{greetMsg()}</p>

			<hr style={{ margin: "2rem 0" }} />

			<h2>Database</h2>
			<div class="row">
				<button type="button" onClick={checkHealth}>
					Check DB Health
				</button>
				<button type="button" onClick={loadUsers}>
					Load Users
				</button>
				<button type="button" onClick={addTestUser}>
					Create Test User
				</button>
			</div>

			<Show when={dbStatus()}>
				<p style={{ color: "green" }}>{dbStatus()}</p>
			</Show>
			<Show when={dbError()}>
				<p style={{ color: "red" }}>{dbError()}</p>
			</Show>

			<Show when={users().length > 0}>
				<h3>Users ({users().length})</h3>
				<ul
					style={{
						"text-align": "left",
						"max-width": "600px",
						margin: "0 auto",
					}}
				>
					<For each={users()}>
						{(user) => (
							<li>
								<strong>{user.username}</strong>
								{user.email ? ` (${user.email})` : ""}
								{user.display_name ? ` - ${user.display_name}` : ""}
							</li>
						)}
					</For>
				</ul>
			</Show>
		</div>
	);
}

export default Home;
