/* @refresh reload */
import { Route, Router } from "@solidjs/router";
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";

const Home = lazy(() => import("./pages/Home"));
const About = lazy(() => import("./pages/About"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DocumentEditor = lazy(() => import("./pages/DocumentEditor"));
const FileViewer = lazy(() => import("./pages/FileViewer"));
const Login = lazy(() => import("./pages/Login"));

render(
	() => (
		<AuthProvider>
			<Router>
				<Route path="/login" component={Login} />
				<Route path="/" component={App}>
					<Route path="/" component={Home} />
					<Route path="about" component={About} />
					<Route path="dashboard/:id" component={Dashboard} />
					<Route path="document/:id" component={DocumentEditor} />
					<Route path="file/:id" component={FileViewer} />
				</Route>
			</Router>
		</AuthProvider>
	),
	document.getElementById("root") as HTMLElement,
);
