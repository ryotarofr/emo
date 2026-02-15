import type {
	VisualSubTypeDef,
	WidgetDef,
	WidgetType,
	WorkflowTemplateDef,
} from "./types";

export const WIDGET_DEFS: WidgetDef[] = [
	{
		type: "text",
		label: "テキスト",
		description: "テキストエディタ付きパネル",
		colorClass: "type-text",
		defaultW: 16,
		defaultH: 11,
	},
	{
		type: "visual",
		label: "ビジュアルデータ",
		description: "チャート・テーブルなどの可視化パネル",
		colorClass: "type-visual",
		defaultW: 16,
		defaultH: 16,
	},
	{
		type: "ai",
		label: "AI連携",
		description: "AI機能と連携するパネル",
		colorClass: "type-ai",
		defaultW: 16,
		defaultH: 11,
	},
	{
		type: "object",
		label: "オブジェクト",
		description: "オブジェクトを配置するパネル",
		colorClass: "type-object",
		defaultW: 12,
		defaultH: 11,
	},
	{
		type: "folder",
		label: "フォルダ",
		description: "ローカルフォルダを参照するパネル",
		colorClass: "type-folder",
		defaultW: 16,
		defaultH: 16,
	},
];

export const VISUAL_SUBTYPES: VisualSubTypeDef[] = [
	{ type: "chart", label: "チャート", description: "グラフで可視化" },
	{ type: "table", label: "テーブル", description: "表形式で表示" },
	{
		type: "diagram",
		label: "ダイアグラム",
		description: "ER図・フロー図で可視化",
	},
];

export const COLOR_PRESETS = [
	{ label: "Coral", value: "#eb5e41" },
	{ label: "Green", value: "#2e7d32" },
	{ label: "Blue", value: "#1565c0" },
	{ label: "Orange", value: "#e65100" },
	{ label: "Purple", value: "#6a1b9a" },
	{ label: "Teal", value: "#00695c" },
	{ label: "Gray", value: "#546e7a" },
];

export const DRAFTS_STORAGE_KEY = "panel-drafts";

/** ウィジェットタイプの日本語ラベル（共通定数） */
export const TYPE_LABELS: Record<WidgetType, string> = {
	text: "テキスト Widget",
	visual: "ビジュアル Widget",
	ai: "AI連携 Widget",
	object: "オブジェクト Widget",
	folder: "フォルダ Widget",
};

/** AIエージェントが使用可能なツール一覧 */
export const AVAILABLE_TOOLS: {
	name: string;
	label: string;
	description: string;
	category: "readonly" | "filesystem" | "execution" | "vcs" | "composite";
}[] = [
	{
		name: "web_fetch",
		label: "Web取得",
		description: "URLからWebページ内容を取得",
		category: "readonly",
	},
	{
		name: "web_search",
		label: "Web検索",
		description: "Brave Search APIで検索",
		category: "readonly",
	},
	{
		name: "file_write",
		label: "ファイル書き出し",
		description: "ファイルの作成・上書き・追記",
		category: "filesystem",
	},
	{
		name: "shell_exec",
		label: "コマンド実行",
		description: "許可リスト内のシェルコマンド実行",
		category: "execution",
	},
	{
		name: "git_ops",
		label: "Git操作",
		description: "status, diff, add, commit等のGit操作",
		category: "vcs",
	},
	{
		name: "self_eval",
		label: "自己評価",
		description: "build, lint, test等の品質チェック",
		category: "composite",
	},
];

export const WORKFLOW_TEMPLATES: WorkflowTemplateDef[] = [
	{
		id: "folder-summary",
		label: "フォルダをAIで要約",
		description:
			"フォルダを選択し、AIが内容を自動で要約します",
		panels: [
			{
				type: "folder",
				title: "フォルダ",
				color: "#795548",
				w: 16,
				h: 16,
				needsFolderPath: true,
			},
			{
				type: "ai",
				title: "AI要約",
				color: "#6a1b9a",
				w: 16,
				h: 11,
				aiPrompt:
					"以下のフォルダ内容を日本語で要約してください。重要なファイルとその目的、プロジェクト構造を説明してください。",
				aiMaxTokens: 4096,
				needsAgent: true,
			},
		],
		edges: [{ sourceIndex: 0, targetIndex: 1 }],
	},
	{
		id: "er-diagram",
		label: "ER図を自動生成",
		description:
			"フォルダを選択し、AIがソースコードからER図を自動生成します",
		panels: [
			{
				type: "folder",
				title: "フォルダ",
				color: "#795548",
				w: 14,
				h: 14,
				needsFolderPath: true,
			},
			{
				type: "ai",
				title: "AI ER分析",
				color: "#6a1b9a",
				w: 14,
				h: 11,
				aiPrompt:
					"以下のソースコードからデータモデル（エンティティとリレーション）を分析し、Mermaid erDiagram形式で出力してください。```mermaid で囲んで出力してください。",
				aiSystemPrompt:
					"あなたはデータモデリングの専門家です。ソースコードを分析してER図をMermaid形式で出力します。",
				aiMaxTokens: 4096,
				needsAgent: true,
			},
			{
				type: "visual",
				visualSubType: "diagram",
				title: "ER Diagram",
				color: "#2e7d32",
				w: 20,
				h: 16,
				diagramCode: "",
			},
		],
		edges: [
			{ sourceIndex: 0, targetIndex: 1 },
			{ sourceIndex: 1, targetIndex: 2 },
		],
	},
	// ── セルフループ（自己改善）テンプレート ──
	{
		id: "design-to-code",
		label: "設計→コード生成",
		description:
			"フォルダのソースコードを分析し、設計を理解した上でコードを生成・品質チェックまで自動実行します",
		panels: [
			{
				type: "folder",
				title: "ソースフォルダ",
				color: "#795548",
				w: 14,
				h: 14,
				needsFolderPath: true,
			},
			{
				type: "ai",
				title: "設計分析",
				color: "#1565c0",
				w: 16,
				h: 11,
				aiPrompt:
					"以下のソースコードを分析し、アーキテクチャ・設計パターン・モジュール構成を日本語でまとめてください。改善すべき点があれば具体的に指摘してください。",
				aiSystemPrompt:
					"あなたはソフトウェアアーキテクトです。コードベースを分析し、設計上の強み・弱みを的確に評価します。",
				aiMaxTokens: 4096,
				aiEnabledTools: ["web_fetch", "web_search"],
				needsAgent: true,
			},
			{
				type: "ai",
				title: "コード生成",
				color: "#6a1b9a",
				w: 16,
				h: 11,
				aiPrompt:
					"上流の設計分析結果に基づき、指摘された改善点を反映したコードを生成してください。既存のコーディング規約とパターンに従ってください。",
				aiSystemPrompt:
					"あなたは熟練のソフトウェアエンジニアです。設計分析に基づいて高品質なコードを生成します。",
				aiMaxTokens: 8192,
				aiEnabledTools: ["file_write", "shell_exec"],
				aiOrchestrationMode: "approval",
				needsAgent: true,
			},
			{
				type: "ai",
				title: "品質チェック",
				color: "#2e7d32",
				w: 16,
				h: 11,
				aiPrompt:
					"生成されたコードに対して品質チェック（build, lint, test）を実行し、結果を報告してください。問題があれば具体的な修正案を提示してください。",
				aiSystemPrompt:
					"あなたはQAエンジニアです。コードの品質を厳密に検証し、問題を報告します。",
				aiMaxTokens: 4096,
				aiEnabledTools: ["self_eval", "shell_exec"],
				needsAgent: true,
			},
		],
		edges: [
			{ sourceIndex: 0, targetIndex: 1 },
			{ sourceIndex: 1, targetIndex: 2 },
			{ sourceIndex: 2, targetIndex: 3 },
		],
	},
	{
		id: "bug-fix",
		label: "バグ修正パイプライン",
		description:
			"バグ報告から原因分析・修正コード生成・テスト検証まで自動実行します",
		panels: [
			{
				type: "text",
				title: "バグ報告",
				color: "#eb5e41",
				w: 16,
				h: 11,
				textBody:
					"【バグの概要】\n\n【再現手順】\n1. \n2. \n3. \n\n【期待される動作】\n\n【実際の動作】\n\n【関連ファイル・ログ】\n",
			},
			{
				type: "ai",
				title: "原因分析",
				color: "#1565c0",
				w: 16,
				h: 11,
				aiPrompt:
					"以下のバグ報告を分析し、根本原因を特定してください。関連するコードパスとデータフローを追跡し、修正方針を提示してください。",
				aiSystemPrompt:
					"あなたはデバッグの専門家です。バグ報告から根本原因を迅速に特定し、修正方針を立案します。",
				aiMaxTokens: 4096,
				aiEnabledTools: ["web_search"],
				needsAgent: true,
			},
			{
				type: "ai",
				title: "修正コード生成",
				color: "#6a1b9a",
				w: 16,
				h: 11,
				aiPrompt:
					"上流の原因分析に基づき、バグを修正するコードを生成してください。既存のテストケースとの整合性を確認してください。",
				aiSystemPrompt:
					"あなたは熟練のソフトウェアエンジニアです。バグの根本原因に対する最小限かつ確実な修正コードを生成します。",
				aiMaxTokens: 8192,
				aiEnabledTools: ["file_write"],
				aiOrchestrationMode: "approval",
				needsAgent: true,
			},
			{
				type: "ai",
				title: "テスト検証",
				color: "#2e7d32",
				w: 16,
				h: 11,
				aiPrompt:
					"修正されたコードに対してテストを実行し、バグが解消されたことを検証してください。リグレッションがないことも確認してください。",
				aiSystemPrompt:
					"あなたはQAエンジニアです。修正コードの正確性とリグレッション有無を厳密に検証します。",
				aiMaxTokens: 4096,
				aiEnabledTools: ["self_eval", "shell_exec"],
				needsAgent: true,
			},
		],
		edges: [
			{ sourceIndex: 0, targetIndex: 1 },
			{ sourceIndex: 1, targetIndex: 2 },
			{ sourceIndex: 2, targetIndex: 3 },
			{
				sourceIndex: 3,
				targetIndex: 2,
				condition: "contains:失敗",
				maxRetries: 2,
				retryDelayMs: 3000,
			},
		],
	},
	{
		id: "auto-docs",
		label: "ドキュメント自動生成",
		description:
			"フォルダのソースコードを分析し、APIドキュメントやREADMEを自動生成します",
		panels: [
			{
				type: "folder",
				title: "ソースフォルダ",
				color: "#795548",
				w: 14,
				h: 14,
				needsFolderPath: true,
			},
			{
				type: "ai",
				title: "コード分析",
				color: "#1565c0",
				w: 16,
				h: 11,
				aiPrompt:
					"以下のソースコードを分析し、公開API・関数・型定義・モジュール構成を網羅的にリストアップしてください。各要素の役割と引数・戻り値を説明してください。",
				aiSystemPrompt:
					"あなたはテクニカルライターです。ソースコードから正確なAPI情報を抽出し、構造化して整理します。",
				aiMaxTokens: 8192,
				aiEnabledTools: ["web_search"],
				needsAgent: true,
			},
			{
				type: "ai",
				title: "ドキュメント生成",
				color: "#6a1b9a",
				w: 16,
				h: 11,
				aiPrompt:
					"上流のコード分析結果をもとに、Markdown形式のAPIドキュメントを生成してください。概要・インストール手順・使用例・API リファレンスを含めてください。",
				aiSystemPrompt:
					"あなたはテクニカルライターです。開発者にとって分かりやすいドキュメントをMarkdown形式で作成します。",
				aiMaxTokens: 8192,
				aiEnabledTools: ["file_write"],
				aiOrchestrationMode: "approval",
				needsAgent: true,
			},
		],
		edges: [
			{ sourceIndex: 0, targetIndex: 1 },
			{ sourceIndex: 1, targetIndex: 2 },
		],
	},
	{
		id: "code-review",
		label: "コードレビューパイプライン",
		description:
			"フォルダのソースコードに対して静的解析・レビュー・改善提案を自動実行します",
		panels: [
			{
				type: "folder",
				title: "ソースフォルダ",
				color: "#795548",
				w: 14,
				h: 14,
				needsFolderPath: true,
			},
			{
				type: "ai",
				title: "静的解析",
				color: "#00695c",
				w: 16,
				h: 11,
				aiPrompt:
					"以下のソースコードに対してlintとビルドチェックを実行し、エラー・警告を報告してください。セキュリティ上の問題も検出してください。",
				aiSystemPrompt:
					"あなたはセキュリティとコード品質の専門家です。静的解析ツールの結果を正確に解釈し、重要度順に報告します。",
				aiMaxTokens: 4096,
				aiEnabledTools: ["shell_exec", "self_eval"],
				needsAgent: true,
			},
			{
				type: "ai",
				title: "コードレビュー",
				color: "#6a1b9a",
				w: 16,
				h: 11,
				aiPrompt:
					"上流の静的解析結果とソースコードを総合的にレビューしてください。設計パターン・命名規則・エラーハンドリング・パフォーマンスの観点から改善点を指摘してください。",
				aiSystemPrompt:
					"あなたはシニアソフトウェアエンジニアです。コードレビューを通じて品質向上のための具体的なフィードバックを提供します。",
				aiMaxTokens: 4096,
				aiEnabledTools: ["web_search"],
				needsAgent: true,
			},
			{
				type: "ai",
				title: "改善提案",
				color: "#2e7d32",
				w: 16,
				h: 11,
				aiPrompt:
					"上流のレビュー結果に基づき、優先度の高い改善をコードに反映してください。変更内容をGitコミットとして記録してください。",
				aiSystemPrompt:
					"あなたは熟練のソフトウェアエンジニアです。レビュー指摘を正確に反映し、品質の高いコードを生成します。",
				aiMaxTokens: 8192,
				aiEnabledTools: ["file_write", "git_ops"],
				aiOrchestrationMode: "approval",
				needsAgent: true,
			},
		],
		edges: [
			{ sourceIndex: 0, targetIndex: 1 },
			{ sourceIndex: 1, targetIndex: 2 },
			{ sourceIndex: 2, targetIndex: 3 },
		],
	},
	// ── セルフブートストラップ（自律開発ループ）テンプレート ──
	{
		id: "self-bootstrap",
		label: "セルフブートストラップ",
		description:
			"tebiki自身のコードと市場トレンドを分析し、プロダクト方針の決定から機能生成・検証まで自律的に実行します",
		panels: [
			{
				type: "folder",
				title: "tebiki ソース",
				color: "#795548",
				w: 14,
				h: 14,
				needsFolderPath: true,
			},
			{
				type: "ai",
				title: "市場調査",
				color: "#1565c0",
				w: 16,
				h: 11,
				aiPrompt:
					"AIオーケストレーション・AIエージェント・ノーコードAI開発ツールの最新トレンドを調査してください。競合製品（LangFlow, Dify, n8n AI等）の機能と差別化ポイントを分析し、2026年の市場動向をまとめてください。",
				aiSystemPrompt:
					"あなたはAI業界のマーケットリサーチャーです。Web検索を活用して最新の市場動向を調査し、客観的なデータに基づいた分析レポートを作成します。",
				aiMaxTokens: 4096,
				aiEnabledTools: ["web_search", "web_fetch"],
				needsAgent: true,
			},
			{
				type: "ai",
				title: "分析・判断",
				color: "#6a1b9a",
				w: 16,
				h: 13,
				aiPrompt:
					"以下の2つの情報源を統合分析してください:\n\n1. tebikiの現在のソースコード（アーキテクチャ・実装済み機能・技術的負債）\n2. 市場調査結果（トレンド・競合の機能）\n\nこれらを比較し、以下を出力してください:\n- tebikiの強み・弱みの整理\n- 競合との機能ギャップ\n- 優先実装すべき機能トップ3（理由付き）\n- 各機能の実装方針（対象ファイル・必要な変更の概要）",
				aiSystemPrompt:
					"あなたはプロダクトマネージャー兼ソフトウェアアーキテクトです。市場データと技術的実態の両面から、最も効果的な機能投資の優先順位を判断します。具体的かつ実行可能な提案を行ってください。",
				aiMaxTokens: 8192,
				aiEnabledTools: ["web_search"],
				needsAgent: true,
			},
			{
				type: "ai",
				title: "仕様策定・コード生成",
				color: "#e65100",
				w: 16,
				h: 13,
				aiPrompt:
					"上流の分析結果から最優先の機能について、以下を実行してください:\n\n1. 詳細な技術仕様を策定（型定義・API設計・UI仕様）\n2. 仕様に基づいてコードを生成\n3. 既存のコーディング規約（Biome, TypeScript strict）に準拠\n4. 生成したコードをファイルに書き出し\n\n生成するコードは最小限の変更で既存アーキテクチャに統合できるようにしてください。",
				aiSystemPrompt:
					"あなたはフルスタックエンジニアです。Tauri 2 + SolidJS + Rust/Axum のアーキテクチャに精通しており、プロダクション品質のコードを生成します。仕様と実装の一貫性を最重視します。",
				aiMaxTokens: 8192,
				aiEnabledTools: ["file_write", "shell_exec"],
				aiOrchestrationMode: "approval",
				needsAgent: true,
			},
			{
				type: "ai",
				title: "検証・コミット",
				color: "#2e7d32",
				w: 16,
				h: 11,
				aiPrompt:
					"生成されたコードに対して以下の検証を実行してください:\n\n1. TypeScript型チェック（tsc --noEmit）\n2. Lint（biome check）\n3. フロントエンドビルド（vite build）\n4. Rustビルド（cargo check）\n\n全チェックが通過した場合:\n- 変更内容を要約したコミットメッセージを作成\n- git add & commit を実行\n\n失敗した場合:\n- エラー内容を詳細に報告（「失敗」を含めて出力）\n- 修正すべき点を具体的に指摘",
				aiSystemPrompt:
					"あなたはCI/CDエンジニア兼QAエンジニアです。コードの品質ゲートを厳密に管理し、基準を満たすコードのみをコミットします。",
				aiMaxTokens: 4096,
				aiEnabledTools: ["self_eval", "shell_exec", "git_ops"],
				needsAgent: true,
			},
		],
		edges: [
			{ sourceIndex: 0, targetIndex: 2 },
			{ sourceIndex: 1, targetIndex: 2 },
			{ sourceIndex: 2, targetIndex: 3 },
			{ sourceIndex: 3, targetIndex: 4 },
			{
				sourceIndex: 4,
				targetIndex: 3,
				condition: "contains:失敗",
				maxRetries: 3,
				retryDelayMs: 5000,
			},
		],
	},
];
