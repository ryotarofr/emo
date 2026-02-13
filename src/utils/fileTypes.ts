import type { FileContentType } from "../components/Sidebar";

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"ico",
]);

const TEXT_EXTENSIONS = new Set([
	"txt",
	"md",
	"json",
	"csv",
	"xml",
	"yaml",
	"yml",
	"js",
	"ts",
	"tsx",
	"jsx",
	"css",
	"html",
	"htm",
	"py",
	"rs",
	"go",
	"java",
	"c",
	"cpp",
	"h",
	"hpp",
	"sh",
	"bat",
	"ps1",
	"toml",
	"ini",
	"cfg",
	"conf",
	"log",
	"sql",
	"graphql",
	"env",
	"gitignore",
	"dockerfile",
	"makefile",
]);

const MIME_MAP: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	ico: "image/x-icon",
	txt: "text/plain",
	md: "text/markdown",
	json: "application/json",
	csv: "text/csv",
	xml: "text/xml",
	yaml: "text/yaml",
	yml: "text/yaml",
	js: "text/javascript",
	ts: "text/typescript",
	tsx: "text/typescript",
	jsx: "text/javascript",
	css: "text/css",
	html: "text/html",
	htm: "text/html",
	py: "text/x-python",
	rs: "text/x-rust",
	go: "text/x-go",
};

function getExtension(path: string): string {
	const name = path.split(/[/\\]/).pop() ?? "";
	const dot = name.lastIndexOf(".");
	if (dot < 0) return "";
	return name.slice(dot + 1).toLowerCase();
}

export function detectFileContentType(path: string): FileContentType | null {
	const ext = getExtension(path);
	if (IMAGE_EXTENSIONS.has(ext)) return "image";
	if (TEXT_EXTENSIONS.has(ext)) return "text";
	return null;
}

export function getFileName(path: string): string {
	return path.split(/[/\\]/).pop() ?? path;
}

export function getFileMimeType(path: string): string {
	const ext = getExtension(path);
	return MIME_MAP[ext] ?? "application/octet-stream";
}

export function getIconForFile(path: string): "image" | "file" {
	const ext = getExtension(path);
	return IMAGE_EXTENSIONS.has(ext) ? "image" : "file";
}
