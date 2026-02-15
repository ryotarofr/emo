# 設計書: セルフブートストラップ・ツールシステム

> tebikiのAIエージェントがLLM tool_useを介して外部リソース（Web、ファイル、コマンド、Git）を操作できるようにする

---

## 1. 設計方針

### 1.1 既存アーキテクチャとの整合

現在のツールシステムは `services/orchestration/tools.rs` に3つのツール（`create_sub_agent`, `execute_sub_agent`, `get_sub_agent_result`）がハードコードされている。このアーキテクチャを以下の方針で拡張する:

1. **ツールを独立モジュールに分離** — 各ツールを `src-tauri/src/tools/` 配下に個別ファイルとして実装
2. **ツールレジストリパターン** — LLMレジストリ（`llm/mod.rs`）と同じパターンでツールを動的登録
3. **既存のtool_loopを再利用** — `tool_loop.rs` の `run_tool_loop` / `run_tool_loop_approval` はそのまま利用し、`orchestrator_tools()` が返すツールリストを拡張
4. **セキュリティレイヤー** — 各ツールにPermission設定を持たせ、エージェントごとに有効/無効を制御

### 1.2 変更の影響範囲

```
変更なし（既存のまま）:
  - llm/types.rs          ContentBlock, ToolDefinition は変更不要
  - llm/anthropic.rs      tool_use対応済み、変更不要
  - tool_loop.rs          ツールリスト取得元を差し替えるだけ
  - event_bus.rs          新イベントを追加するが既存は変更なし
  - error.rs              新エラーバリアントを追加

新規作成:
  - src-tauri/src/tools/   ツールモジュール（6ファイル + mod.rs + types.rs）
  - migration              tool_permissions テーブル
  - handlers.rs            ツール設定API（2エンドポイント）
  - フロントエンド          AIパネルにツール選択UI

変更:
  - constants.rs           新ツール名の定数追加
  - services/orchestration/tools.rs  ツールレジストリからの動的取得
  - services/orchestration/context.rs  enabled_tools フィールド追加
  - services/orchestration/api.rs     ToolContext構築 + approve_orchestrationにtool_registry追加
  - lib.rs                 ToolRegistry初期化 + 新ルート登録
  - handlers.rs            AppState変更 + オーケストレーションハンドラにtool_registry追加
  - commands.rs            オーケストレーション系コマンドにtool_registry追加
  - models.rs              ToolPermission モデル追加
```

---

## 2. Rustバックエンド設計

### 2.1 ディレクトリ構成

```
src-tauri/src/
├── tools/                          # 新規ディレクトリ
│   ├── mod.rs                      # ToolRegistry + ToolTrait
│   ├── types.rs                    # ToolContext, ToolResult, ToolPermission
│   ├── web_fetch.rs                # Web情報取得
│   ├── web_search.rs               # Web検索
│   ├── file_write.rs               # ファイル書き出し
│   ├── shell_exec.rs               # コマンド実行
│   ├── git_ops.rs                  # Git操作
│   └── self_eval.rs                # 自己評価
├── services/
│   └── orchestration/
│       ├── tools.rs                # 変更: レジストリから動的にツールを取得
│       └── context.rs              # 変更: enabled_tools追加
└── ...
```

### 2.2 ツールトレイト & レジストリ (`tools/mod.rs`)

```rust
// src-tauri/src/tools/mod.rs

pub mod types;
pub mod web_fetch;
pub mod web_search;
pub mod file_write;
pub mod shell_exec;
pub mod git_ops;
pub mod self_eval;

use std::collections::HashMap;
use async_trait::async_trait;
use crate::llm::types::ToolDefinition;
use types::{ToolContext, ToolResult};

/// 全ツールが実装するトレイト
#[async_trait]
pub trait Tool: Send + Sync {
    /// ツール名（LLM APIに渡す識別子）
    fn name(&self) -> &str;

    /// ツールの説明カテゴリ
    fn category(&self) -> ToolCategory;

    /// LLM APIに渡すToolDefinition（JSONスキーマ含む）
    fn definition(&self) -> ToolDefinition;

    /// ツールを実行し結果を返す
    async fn execute(
        &self,
        input: &serde_json::Value,
        ctx: &ToolContext,
    ) -> ToolResult;
}

/// ツールのカテゴリ（**UI表示専用**）
/// 注意: アクセス制御にはこのカテゴリではなく、ToolContextのフィールド
/// （allowed_commands, allowed_write_dirs, git_permission）を使用する。
/// git_opsのように1つのツールが読み取り・書き込み両方の操作を持つ場合、
/// カテゴリでは制御できない。git_permissionフィールドで操作レベルを制御する。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolCategory {
    ReadOnly,       // web_fetch, web_search
    FileSystem,     // file_write
    Execution,      // shell_exec
    VersionControl, // git_ops（読み取り・書き込み両方を含む）
    Composite,      // self_eval（内部で他ツールを呼ぶ）
}

/// ツールレジストリ — LlmRegistryと同じパターン
pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn Tool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self { tools: HashMap::new() }
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    /// 名前でツールを取得
    pub fn get(&self, name: &str) -> Option<&dyn Tool> {
        self.tools.get(name).map(|t| t.as_ref())
    }

    /// 指定されたツール名リストに対応するToolDefinitionを返す
    pub fn definitions_for(&self, enabled_names: &[String]) -> Vec<ToolDefinition> {
        enabled_names
            .iter()
            .filter_map(|name| self.tools.get(name))
            .map(|t| t.definition())
            .collect()
    }

    /// 全ツール名を返す
    pub fn tool_names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    /// ツールを実行
    pub async fn execute(
        &self,
        name: &str,
        input: &serde_json::Value,
        ctx: &ToolContext,
    ) -> ToolResult {
        match self.tools.get(name) {
            Some(tool) => tool.execute(input, ctx).await,
            None => ToolResult::error(format!("Unknown tool: {name}")),
        }
    }
}
```

### 2.3 ツール共通型 (`tools/types.rs`)

```rust
// src-tauri/src/tools/types.rs

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// ツール実行時のコンテキスト（セキュリティ境界を含む）
#[derive(Debug, Clone)]
pub struct ToolContext {
    /// ツール実行のワーキングディレクトリ
    pub working_dir: PathBuf,
    /// ファイル書き込み許可ディレクトリ（allowlist）
    pub allowed_write_dirs: Vec<PathBuf>,
    /// コマンド実行許可リスト
    pub allowed_commands: Vec<String>,
    /// Git操作許可レベル
    pub git_permission: GitPermission,
    /// HTTP要求タイムアウト（秒）
    pub http_timeout_secs: u64,
    /// シェル実行タイムアウト（ミリ秒）
    pub shell_timeout_ms: u64,
}

impl Default for ToolContext {
    fn default() -> Self {
        Self {
            // 注意: "." は Tauri/Windows 環境では不定になる。
            // 実際の初期化は lib.rs の setup() 内で明示的にプロジェクトルートを設定する。
            // See: Section 2.5.5, 2.5.7
            working_dir: PathBuf::from("."),
            allowed_write_dirs: vec![],
            allowed_commands: vec![
                // デフォルトは読み取り系のみ
                "ls".into(), "cat".into(), "head".into(), "wc".into(),
                "find".into(), "grep".into(), "tree".into(),
            ],
            git_permission: GitPermission::ReadOnly,
            http_timeout_secs: 30,
            shell_timeout_ms: 30_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GitPermission {
    Disabled,
    ReadOnly,   // status, log, diff のみ
    ReadWrite,  // add, commit, branch も許可
}

/// ツール実行結果
#[derive(Debug)]
pub struct ToolResult {
    pub content: String,
    pub is_error: bool,
}

impl ToolResult {
    pub fn ok(content: String) -> Self {
        Self { content, is_error: false }
    }
    pub fn error(message: String) -> Self {
        Self { content: message, is_error: true }
    }
}
```

### 2.4 各ツールの実装

---

#### 2.4.1 `web_fetch.rs` — Web情報取得

```rust
// src-tauri/src/tools/web_fetch.rs

use async_trait::async_trait;
use crate::llm::types::ToolDefinition;
use super::{Tool, ToolCategory};
use super::types::{ToolContext, ToolResult};

pub struct WebFetchTool {
    client: reqwest::Client,
}

impl WebFetchTool {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("tebiki/0.1.0")
            .build()
            .expect("Failed to build HTTP client for WebFetchTool");
        Self { client }
    }
}

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str { "web_fetch" }
    fn category(&self) -> ToolCategory { ToolCategory::ReadOnly }

    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_fetch".to_string(),
            description: "Fetch content from a web URL. Returns the page text content (HTML tags stripped). Use this to read documentation, articles, or any public web page.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch (must start with http:// or https://)"
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum characters to return (default: 50000, max: 100000)"
                    }
                },
                "required": ["url"]
            }),
        }
    }

    async fn execute(&self, input: &serde_json::Value, ctx: &ToolContext) -> ToolResult {
        let url = match input["url"].as_str() {
            Some(u) => u,
            None => return ToolResult::error("Missing 'url' parameter".into()),
        };

        // URLバリデーション
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return ToolResult::error("URL must start with http:// or https://".into());
        }

        let max_length = input["max_length"]
            .as_u64()
            .unwrap_or(50_000)
            .min(100_000) as usize;

        let response = match self.client
            .get(url)
            .timeout(std::time::Duration::from_secs(ctx.http_timeout_secs))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return ToolResult::error(format!("HTTP request failed: {e}")),
        };

        let status = response.status();
        if !status.is_success() {
            return ToolResult::error(format!("HTTP {status} for {url}"));
        }

        let body = match response.text().await {
            Ok(t) => t,
            Err(e) => return ToolResult::error(format!("Failed to read response body: {e}")),
        };

        // HTML→テキスト変換（簡易実装: タグ除去）
        let text = strip_html_tags(&body);

        // 長さ制限
        let truncated = if text.len() > max_length {
            format!("{}...\n\n[Truncated: {} total chars]", &text[..max_length], text.len())
        } else {
            text
        };

        ToolResult::ok(serde_json::json!({
            "url": url,
            "status": status.as_u16(),
            "content": truncated,
            "content_length": truncated.len()
        }).to_string())
    }
}

/// 簡易HTMLタグ除去（<script>, <style>ブロックも除去）
///
/// 注意: Phase 1 の while + to_lowercase().find() は O(n²) の計算量になる。
/// Phase 1 では毎ループ文字列全体の to_lowercase() を再計算し、
/// さらに format!() で文字列を再構築するため大きなHTMLで遅くなる可能性がある。
/// Phase 2 以降の処理で十分な品質になるため、Phase 1 は将来的に
/// regex クレート（例: `regex::Regex::new(r"(?is)<script[^>]*>.*?</script>")`)
/// または ammonia/scraper クレートへの置き換えを検討する。
fn strip_html_tags(html: &str) -> String {
    // Phase 1: <script>と<style>ブロックを除去
    // TODO: O(n²) — regex または html パーサクレートで最適化
    let mut result = html.to_string();
    for tag in &["script", "style"] {
        while let Some(start) = result.to_lowercase().find(&format!("<{tag}")) {
            if let Some(end) = result.to_lowercase()[start..].find(&format!("</{tag}>")) {
                let end_pos = start + end + format!("</{tag}>").len();
                result = format!("{}{}", &result[..start], &result[end_pos..]);
            } else {
                break;
            }
        }
    }

    // Phase 2: 残りのHTMLタグを除去
    let mut output = String::with_capacity(result.len());
    let mut in_tag = false;
    for ch in result.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }

    // Phase 3: 連続空白行を圧縮
    let lines: Vec<&str> = output.lines().collect();
    let mut compressed = Vec::new();
    let mut blank_count = 0;
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            blank_count += 1;
            if blank_count <= 1 { compressed.push(""); }
        } else {
            blank_count = 0;
            compressed.push(trimmed);
        }
    }
    compressed.join("\n")
}
```

---

#### 2.4.2 `web_search.rs` — Web検索

```rust
// src-tauri/src/tools/web_search.rs

use async_trait::async_trait;
use crate::llm::types::ToolDefinition;
use super::{Tool, ToolCategory};
use super::types::{ToolContext, ToolResult};

pub struct WebSearchTool {
    client: reqwest::Client,
    api_key: Option<String>, // Brave Search API key
}

impl WebSearchTool {
    pub fn new() -> Self {
        let api_key = std::env::var("BRAVE_SEARCH_API_KEY").ok();
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("Failed to build HTTP client for WebSearchTool");
        Self { client, api_key }
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str { "web_search" }
    fn category(&self) -> ToolCategory { ToolCategory::ReadOnly }

    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_search".to_string(),
            description: "Search the web for information. Returns a list of search results with titles, URLs, and snippets. Use this to find recent information, documentation, or market research.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (default: 5, max: 20)"
                    }
                },
                "required": ["query"]
            }),
        }
    }

    async fn execute(&self, input: &serde_json::Value, ctx: &ToolContext) -> ToolResult {
        let query = match input["query"].as_str() {
            Some(q) => q,
            None => return ToolResult::error("Missing 'query' parameter".into()),
        };

        let num_results = input["num_results"]
            .as_u64()
            .unwrap_or(5)
            .min(20) as usize;

        let api_key = match &self.api_key {
            Some(k) => k,
            None => return ToolResult::error(
                "BRAVE_SEARCH_API_KEY not configured. Set this environment variable to enable web search.".into()
            ),
        };

        // Brave Search API呼び出し
        let response = match self.client
            .get("https://api.search.brave.com/res/v1/web/search")
            .header("X-Subscription-Token", api_key)
            .header("Accept", "application/json")
            .query(&[
                ("q", query),
                ("count", &num_results.to_string()),
            ])
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return ToolResult::error(format!("Search API request failed: {e}")),
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return ToolResult::error(format!("Search API error ({status}): {body}"));
        }

        let body: serde_json::Value = match response.json().await {
            Ok(v) => v,
            Err(e) => return ToolResult::error(format!("Failed to parse search results: {e}")),
        };

        // 検索結果を抽出
        let results: Vec<serde_json::Value> = body["web"]["results"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .take(num_results)
            .map(|r| serde_json::json!({
                "title": r["title"].as_str().unwrap_or(""),
                "url": r["url"].as_str().unwrap_or(""),
                "description": r["description"].as_str().unwrap_or("")
            }))
            .collect();

        ToolResult::ok(serde_json::json!({
            "query": query,
            "num_results": results.len(),
            "results": results
        }).to_string())
    }
}
```

---

#### 2.4.3 `file_write.rs` — ファイル書き出し

```rust
// src-tauri/src/tools/file_write.rs

use async_trait::async_trait;
use std::path::Path;
use crate::llm::types::ToolDefinition;
use super::{Tool, ToolCategory};
use super::types::{ToolContext, ToolResult};

pub struct FileWriteTool;

impl FileWriteTool {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Tool for FileWriteTool {
    fn name(&self) -> &str { "file_write" }
    fn category(&self) -> ToolCategory { ToolCategory::FileSystem }

    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "file_write".to_string(),
            description: "Write content to a file on disk. Can create new files or overwrite/append to existing files. The file path must be within the allowed directories.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path to write to (relative to working directory, or absolute)"
                    },
                    "content": {
                        "type": "string",
                        "description": "The content to write to the file"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["create", "overwrite", "append"],
                        "description": "Write mode: 'create' fails if file exists, 'overwrite' replaces content, 'append' adds to end (default: overwrite)"
                    }
                },
                "required": ["path", "content"]
            }),
        }
    }

    async fn execute(&self, input: &serde_json::Value, ctx: &ToolContext) -> ToolResult {
        let path_str = match input["path"].as_str() {
            Some(p) => p,
            None => return ToolResult::error("Missing 'path' parameter".into()),
        };
        let content = match input["content"].as_str() {
            Some(c) => c,
            None => return ToolResult::error("Missing 'content' parameter".into()),
        };
        let mode = input["mode"].as_str().unwrap_or("overwrite");

        // パスを解決
        let path = if Path::new(path_str).is_absolute() {
            std::path::PathBuf::from(path_str)
        } else {
            ctx.working_dir.join(path_str)
        };

        // allowed_write_dirsチェック
        if ctx.allowed_write_dirs.is_empty() {
            return ToolResult::error(
                "File writing is disabled. No allowed write directories configured.".into()
            );
        }

        // パストラバーサル対策: canonicalize() で正規化してから比較する。
        // path.starts_with(allowed) だけでは "../../etc/passwd" のような
        // 相対パスでのディレクトリ脱出を防げない。
        //
        // 注意: canonicalize() はファイル/ディレクトリが存在する必要があるため、
        // 親ディレクトリを先に作成してからチェックする。
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                if let Err(e) = tokio::fs::create_dir_all(parent).await {
                    return ToolResult::error(format!("Failed to create directory: {e}"));
                }
            }
        }

        let canonical_path = match tokio::fs::canonicalize(
            path.parent().unwrap_or(&path)
        ).await {
            Ok(p) => p.join(path.file_name().unwrap_or_default()),
            Err(e) => return ToolResult::error(format!(
                "Failed to resolve path '{}': {e}", path.display()
            )),
        };

        let is_allowed = ctx.allowed_write_dirs.iter().any(|allowed| {
            // allowed ディレクトリも canonicalize して比較
            match std::fs::canonicalize(allowed) {
                Ok(canonical_allowed) => canonical_path.starts_with(&canonical_allowed),
                Err(_) => false,
            }
        });

        if !is_allowed {
            return ToolResult::error(format!(
                "Path '{}' is not within any allowed write directory. Allowed: {:?}",
                canonical_path.display(),
                ctx.allowed_write_dirs
            ));
        }

        // モード別書き込み（ディレクトリは上記セキュリティチェック内で作成済み）
        match mode {
            "create" => {
                if path.exists() {
                    return ToolResult::error(format!(
                        "File already exists: {}. Use 'overwrite' mode to replace.",
                        path.display()
                    ));
                }
                match tokio::fs::write(&path, content).await {
                    Ok(_) => {},
                    Err(e) => return ToolResult::error(format!("Failed to write file: {e}")),
                }
            }
            "append" => {
                use tokio::io::AsyncWriteExt;
                let mut file = match tokio::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&path)
                    .await
                {
                    Ok(f) => f,
                    Err(e) => return ToolResult::error(format!("Failed to open file: {e}")),
                };
                if let Err(e) = file.write_all(content.as_bytes()).await {
                    return ToolResult::error(format!("Failed to append to file: {e}"));
                }
            }
            _ => {
                // overwrite
                match tokio::fs::write(&path, content).await {
                    Ok(_) => {},
                    Err(e) => return ToolResult::error(format!("Failed to write file: {e}")),
                }
            }
        }

        let bytes_written = content.len();
        ToolResult::ok(serde_json::json!({
            "path": path.display().to_string(),
            "mode": mode,
            "bytes_written": bytes_written,
            "success": true
        }).to_string())
    }
}
```

---

#### 2.4.4 `shell_exec.rs` — コマンド実行

```rust
// src-tauri/src/tools/shell_exec.rs

use async_trait::async_trait;
use crate::llm::types::ToolDefinition;
use super::{Tool, ToolCategory};
use super::types::{ToolContext, ToolResult};

pub struct ShellExecTool;

impl ShellExecTool {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Tool for ShellExecTool {
    fn name(&self) -> &str { "shell_exec" }
    fn category(&self) -> ToolCategory { ToolCategory::Execution }

    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "shell_exec".to_string(),
            description: "Execute a shell command and return stdout/stderr. Commands must be in the allowed list. Use this to run build tools, tests, linters, and other development commands.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute (e.g., 'bun run build', 'cargo test')"
                    },
                    "working_dir": {
                        "type": "string",
                        "description": "Working directory for the command (optional, defaults to project root)"
                    }
                },
                "required": ["command"]
            }),
        }
    }

    async fn execute(&self, input: &serde_json::Value, ctx: &ToolContext) -> ToolResult {
        let command = match input["command"].as_str() {
            Some(c) => c,
            None => return ToolResult::error("Missing 'command' parameter".into()),
        };

        let working_dir = input["working_dir"]
            .as_str()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| ctx.working_dir.clone());

        // コマンドインジェクション対策:
        // "ls && rm -rf /" のようなチェーン攻撃を防ぐため、
        // シェルメタ文字を含むコマンドを拒否する。
        // allowed_commands に "ls" があるとき "ls && rm -rf /" は
        // starts_with("ls") を通過してしまうため、先にメタ文字チェックを行う。
        const FORBIDDEN_PATTERNS: &[&str] = &[
            "&&", "||", ";", "|", "$(", "`", "${",
            ">", ">>", "<",           // リダイレクト
            "\n", "\r",               // 改行による複数コマンド
        ];

        for pattern in FORBIDDEN_PATTERNS {
            if command.contains(pattern) {
                return ToolResult::error(format!(
                    "Command contains forbidden shell metacharacter '{}'. \
                     Each command must be a single, simple command without chaining or redirection.",
                    pattern
                ));
            }
        }

        // コマンドのホワイトリストチェック（先頭トークンのみ比較）
        let base_command = command.split_whitespace().next().unwrap_or("");
        if !ctx.allowed_commands.iter().any(|allowed| {
            base_command == allowed.as_str()
        }) {
            return ToolResult::error(format!(
                "Command '{}' is not in the allowed command list. Allowed: {:?}",
                base_command,
                ctx.allowed_commands
            ));
        }

        // プロセス実行
        let timeout = std::time::Duration::from_millis(ctx.shell_timeout_ms);
        let start = std::time::Instant::now();

        let output = match tokio::time::timeout(timeout, async {
            tokio::process::Command::new("bash")
                .arg("-c")
                .arg(command)
                .current_dir(&working_dir)
                .output()
                .await
        }).await {
            Ok(Ok(output)) => output,
            Ok(Err(e)) => return ToolResult::error(format!("Failed to execute command: {e}")),
            Err(_) => return ToolResult::error(format!(
                "Command timed out after {}ms", ctx.shell_timeout_ms
            )),
        };

        let duration_ms = start.elapsed().as_millis();
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // 出力サイズ制限（50KB）
        let max_output = 50_000;
        let stdout_truncated = if stdout.len() > max_output {
            format!("{}...\n[truncated]", &stdout[..max_output])
        } else {
            stdout.to_string()
        };
        let stderr_truncated = if stderr.len() > max_output {
            format!("{}...\n[truncated]", &stderr[..max_output])
        } else {
            stderr.to_string()
        };

        ToolResult::ok(serde_json::json!({
            "command": command,
            "exit_code": output.status.code(),
            "stdout": stdout_truncated,
            "stderr": stderr_truncated,
            "duration_ms": duration_ms,
            "success": output.status.success()
        }).to_string())
    }
}
```

---

#### 2.4.5 `git_ops.rs` — Git操作

```rust
// src-tauri/src/tools/git_ops.rs

use async_trait::async_trait;
use crate::llm::types::ToolDefinition;
use super::{Tool, ToolCategory};
use super::types::{ToolContext, ToolResult, GitPermission};

pub struct GitOpsTool;

impl GitOpsTool {
    pub fn new() -> Self { Self }
}

// 読み取り専用操作
const READ_ONLY_ACTIONS: &[&str] = &["status", "diff", "log", "show", "branch_list"];
// 書き込み操作
const WRITE_ACTIONS: &[&str] = &["add", "commit", "branch_create", "checkout"];

#[async_trait]
impl Tool for GitOpsTool {
    fn name(&self) -> &str { "git_ops" }
    fn category(&self) -> ToolCategory { ToolCategory::VersionControl }

    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "git_ops".to_string(),
            description: "Perform git operations on the repository. Supports: status, diff, log, show, branch_list (read-only), and add, commit, branch_create, checkout (if write permission is granted).".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["status", "diff", "log", "show", "branch_list",
                                 "add", "commit", "branch_create", "checkout"],
                        "description": "The git operation to perform"
                    },
                    "args": {
                        "type": "object",
                        "description": "Action-specific arguments",
                        "properties": {
                            "files": {
                                "type": "array",
                                "items": { "type": "string" },
                                "description": "File paths for 'add' action"
                            },
                            "message": {
                                "type": "string",
                                "description": "Commit message for 'commit' action"
                            },
                            "branch_name": {
                                "type": "string",
                                "description": "Branch name for 'branch_create' or 'checkout'"
                            },
                            "max_count": {
                                "type": "integer",
                                "description": "Max entries for 'log' action (default: 10)"
                            },
                            "ref": {
                                "type": "string",
                                "description": "Ref for 'show' (commit hash, branch, tag)"
                            }
                        }
                    }
                },
                "required": ["action"]
            }),
        }
    }

    async fn execute(&self, input: &serde_json::Value, ctx: &ToolContext) -> ToolResult {
        let action = match input["action"].as_str() {
            Some(a) => a,
            None => return ToolResult::error("Missing 'action' parameter".into()),
        };
        let args = &input["args"];

        // パーミッションチェック
        if ctx.git_permission == GitPermission::Disabled {
            return ToolResult::error("Git operations are disabled.".into());
        }

        if WRITE_ACTIONS.contains(&action) && ctx.git_permission != GitPermission::ReadWrite {
            return ToolResult::error(format!(
                "Git write action '{}' requires ReadWrite permission. Current: {:?}",
                action, ctx.git_permission
            ));
        }

        let working_dir = &ctx.working_dir;

        match action {
            "status" => {
                run_git(working_dir, &["status", "--porcelain"]).await
            }
            "diff" => {
                run_git(working_dir, &["diff"]).await
            }
            "log" => {
                let max_count = args["max_count"].as_u64().unwrap_or(10);
                run_git(working_dir, &[
                    "log",
                    &format!("--max-count={max_count}"),
                    "--oneline",
                    "--decorate"
                ]).await
            }
            "show" => {
                let ref_name = args["ref"].as_str().unwrap_or("HEAD");
                run_git(working_dir, &["show", "--stat", ref_name]).await
            }
            "branch_list" => {
                run_git(working_dir, &["branch", "-a"]).await
            }
            "add" => {
                let files: Vec<&str> = args["files"]
                    .as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                    .unwrap_or_default();
                if files.is_empty() {
                    return ToolResult::error("No files specified for 'add'".into());
                }
                let mut cmd_args = vec!["add"];
                cmd_args.extend(files.iter());
                run_git(working_dir, &cmd_args).await
            }
            "commit" => {
                let message = match args["message"].as_str() {
                    Some(m) => m,
                    None => return ToolResult::error("Missing commit message".into()),
                };
                run_git(working_dir, &["commit", "-m", message]).await
            }
            "branch_create" => {
                let name = match args["branch_name"].as_str() {
                    Some(n) => n,
                    None => return ToolResult::error("Missing branch_name".into()),
                };
                run_git(working_dir, &["checkout", "-b", name]).await
            }
            "checkout" => {
                let name = match args["branch_name"].as_str() {
                    Some(n) => n,
                    None => return ToolResult::error("Missing branch_name".into()),
                };
                // 安全チェック: force checkoutは禁止
                run_git(working_dir, &["checkout", name]).await
            }
            _ => ToolResult::error(format!("Unknown git action: {action}")),
        }
    }
}

async fn run_git(working_dir: &std::path::Path, args: &[&str]) -> ToolResult {
    match tokio::process::Command::new("git")
        .args(args)
        .current_dir(working_dir)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if output.status.success() {
                ToolResult::ok(serde_json::json!({
                    "output": stdout.trim(),
                    "success": true
                }).to_string())
            } else {
                ToolResult::error(format!("git {} failed:\n{}", args.join(" "), stderr.trim()))
            }
        }
        Err(e) => ToolResult::error(format!("Failed to run git: {e}")),
    }
}
```

---

#### 2.4.6 `self_eval.rs` — 自己評価

```rust
// src-tauri/src/tools/self_eval.rs

use async_trait::async_trait;
use crate::llm::types::ToolDefinition;
use super::{Tool, ToolCategory};
use super::types::{ToolContext, ToolResult};

pub struct SelfEvalTool;

impl SelfEvalTool {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Tool for SelfEvalTool {
    fn name(&self) -> &str { "self_eval" }
    fn category(&self) -> ToolCategory { ToolCategory::Composite }

    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "self_eval".to_string(),
            description: "Run project quality checks (build, lint, type-check) and return structured metrics. Use this to verify code quality after making changes.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "checks": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["build", "lint", "type_check", "test"]
                        },
                        "description": "Which checks to run (default: all)"
                    }
                }
            }),
        }
    }

    async fn execute(&self, input: &serde_json::Value, ctx: &ToolContext) -> ToolResult {
        let checks: Vec<&str> = input["checks"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
            .unwrap_or_else(|| vec!["build", "lint", "type_check"]);

        let working_dir = &ctx.working_dir;
        let timeout = std::time::Duration::from_millis(ctx.shell_timeout_ms.max(120_000));
        let mut results = serde_json::Map::new();
        let mut all_passed = true;

        for check in &checks {
            let (cmd, label) = match *check {
                "build" => ("bun run build", "build"),
                "lint" => ("bun run lint", "lint"),
                "type_check" => ("bun run check", "type_check"),
                "test" => ("cargo test", "test"),
                _ => continue,
            };

            let start = std::time::Instant::now();
            let output = match tokio::time::timeout(timeout, async {
                tokio::process::Command::new("bash")
                    .arg("-c")
                    .arg(cmd)
                    .current_dir(working_dir)
                    .output()
                    .await
            }).await {
                Ok(Ok(o)) => o,
                Ok(Err(e)) => {
                    results.insert(label.into(), serde_json::json!({
                        "passed": false,
                        "error": format!("Failed to run: {e}"),
                        "duration_ms": start.elapsed().as_millis() as u64
                    }));
                    all_passed = false;
                    continue;
                }
                Err(_) => {
                    results.insert(label.into(), serde_json::json!({
                        "passed": false,
                        "error": "Timeout",
                        "duration_ms": start.elapsed().as_millis() as u64
                    }));
                    all_passed = false;
                    continue;
                }
            };

            let duration_ms = start.elapsed().as_millis() as u64;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let passed = output.status.success();

            if !passed { all_passed = false; }

            // 出力を制限（各5KB）
            let max = 5_000;
            results.insert(label.into(), serde_json::json!({
                "passed": passed,
                "exit_code": output.status.code(),
                "stdout": if stdout.len() > max { &stdout[..max] } else { &stdout },
                "stderr": if stderr.len() > max { &stderr[..max] } else { &stderr },
                "duration_ms": duration_ms
            }));
        }

        ToolResult::ok(serde_json::json!({
            "all_passed": all_passed,
            "checks": results,
            "total_checks": checks.len()
        }).to_string())
    }
}
```

---

### 2.5 既存コードへの変更

#### 2.5.1 `constants.rs` — ツール名定数追加

```rust
// 追加分（既存の定数はそのまま）
pub const TOOL_WEB_FETCH: &str = "web_fetch";
pub const TOOL_WEB_SEARCH: &str = "web_search";
pub const TOOL_FILE_WRITE: &str = "file_write";
pub const TOOL_SHELL_EXEC: &str = "shell_exec";
pub const TOOL_GIT_OPS: &str = "git_ops";
pub const TOOL_SELF_EVAL: &str = "self_eval";
```

#### 2.5.2 `services/orchestration/context.rs` — enabled_tools追加

```rust
// 変更: ToolContextとenabled_toolsを追加

use crate::tools::ToolRegistry;
use std::sync::Arc;

pub(super) struct OrchestrationContext {
    // ... 既存フィールドはすべて維持 ...
    pub db: DbPool,
    pub registry: Arc<LlmRegistry>,
    pub event_bus: EventBus,
    pub orchestration_run_id: Uuid,
    pub execution_id: Uuid,
    pub orchestrator_agent_id: Uuid,
    pub workflow_id: Uuid,
    pub llm_provider_id: Uuid,
    pub provider_name: String,
    pub model: String,
    pub system_prompt: Option<String>,
    pub temperature: f64,
    pub max_tokens: i32,

    // 新規追加
    pub tool_registry: Arc<ToolRegistry>,
    pub enabled_tools: Vec<String>,       // このエージェントで有効なツール名
    pub tool_context: crate::tools::types::ToolContext,  // セキュリティ境界
}
```

#### 2.5.3 `services/orchestration/tools.rs` — 動的ツール取得

```rust
// 変更: orchestrator_tools() をレジストリベースに変更

use crate::llm::types::{ContentBlock, ToolDefinition};
use super::context::OrchestrationContext;

/// エージェントに提供するツール定義を構築
/// 既存の3ツール（sub_agent系）+ 有効化された外部ツールを結合
pub(super) fn orchestrator_tools(ctx: &OrchestrationContext) -> Vec<ToolDefinition> {
    // 1. 既存のオーケストレーション固有ツール（sub_agent系）
    let mut tools = builtin_orchestrator_tools();

    // 2. ToolRegistryから有効なツールのDefinitionを追加
    let external_tools = ctx.tool_registry.definitions_for(&ctx.enabled_tools);
    tools.extend(external_tools);

    tools
}

/// 既存の3ツール（変更なし）
fn builtin_orchestrator_tools() -> Vec<ToolDefinition> {
    vec![
        // create_sub_agent, execute_sub_agent, get_sub_agent_result
        // ... 既存のコードをそのまま維持 ...
    ]
}

/// ツール呼び出しハンドラ — 組み込みツールと外部ツールを振り分け
pub(super) async fn handle_tool_call(
    tool_name: &str,
    tool_input: &serde_json::Value,
    ctx: &OrchestrationContext,
) -> (String, bool) {
    // 1. 組み込みツール（sub_agent系）を先にチェック
    match tool_name {
        TOOL_CREATE_SUB_AGENT => { /* 既存の実装そのまま */ }
        TOOL_EXECUTE_SUB_AGENT => { /* 既存の実装そのまま */ }
        TOOL_GET_SUB_AGENT_RESULT => { /* 既存の実装そのまま */ }
        _ => {
            // 2. ToolRegistryに委譲
            let result = ctx.tool_registry
                .execute(tool_name, tool_input, &ctx.tool_context)
                .await;
            (result.content, result.is_error)
        }
    }
}
```

#### 2.5.4 `services/orchestration/tool_loop.rs` — ツールリスト取得の変更

```rust
// 変更箇所: orchestrator_tools() → orchestrator_tools(ctx)

// Before:
let tools = orchestrator_tools();

// After:
let tools = orchestrator_tools(ctx);
```

この変更は `run_tool_loop` と `run_tool_loop_approval` の両方に適用。

#### 2.5.5 `lib.rs` — ToolRegistry初期化 & mod宣言

```rust
// ファイル先頭の mod 宣言に追加:
mod tools;  // 追加

// setup()内に追加（EventBus初期化の後に配置）:

// Initialize Tool Registry
let mut tool_registry = tools::ToolRegistry::new();
tool_registry.register(Box::new(tools::web_fetch::WebFetchTool::new()));
tool_registry.register(Box::new(tools::web_search::WebSearchTool::new()));
tool_registry.register(Box::new(tools::file_write::FileWriteTool::new()));
tool_registry.register(Box::new(tools::shell_exec::ShellExecTool::new()));
tool_registry.register(Box::new(tools::git_ops::GitOpsTool::new()));
tool_registry.register(Box::new(tools::self_eval::SelfEvalTool::new()));
let tool_registry = Arc::new(tool_registry);
app.manage(tool_registry.clone());  // Tauriのcommands.rsから State<Arc<ToolRegistry>> で参照

// AppStateにtool_registryを追加
let app_state = AppState {
    db: db_pool.clone(),
    llm_registry: registry,
    event_bus,
    tool_registry,  // 追加
};

// 新規ルート追加（router に追加）:
.route("/api/tools", get(handlers::list_tools_handler))
.route("/api/tools/config", post(handlers::update_tool_config_handler))
// ツール付き実行エンドポイント
.route("/api/execute-with-tools", post(handlers::execute_agent_with_tools_handler))
```

#### 2.5.6 `handlers.rs` — AppState変更 & 新エンドポイント & 既存ハンドラ変更

```rust
// AppStateに追加:
pub struct AppState {
    pub db: DbPool,
    pub llm_registry: Arc<LlmRegistry>,
    pub event_bus: EventBus,
    pub tool_registry: Arc<ToolRegistry>,  // 追加
}

// 新規ハンドラ:

/// 利用可能なツール一覧
pub async fn list_tools_handler(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let tools: Vec<serde_json::Value> = state.tool_registry
        .tool_names()
        .iter()
        .map(|name| {
            let tool = state.tool_registry.get(name).unwrap();
            serde_json::json!({
                "name": tool.name(),
                "category": format!("{:?}", tool.category()),
                "definition": tool.definition(),
            })
        })
        .collect();
    Json(tools)
}

/// ツール設定の更新（将来的にDB保存）
pub async fn update_tool_config_handler(
    State(state): State<AppState>,
    Json(config): Json<ToolConfigRequest>,
) -> impl IntoResponse {
    // Phase1では設定をメモリ内で管理
    // Phase2でDB永続化
    Json(serde_json::json!({ "status": "ok" }))
}

// 既存ハンドラの変更:
// orchestrate_agent_handler と approve_orchestration_handler は
// サービス関数に &state.tool_registry を追加で渡す必要がある。

pub async fn orchestrate_agent_handler(
    State(state): State<AppState>,
    Json(request): Json<OrchestrateRequest>,
) -> Result<Json<OrchestrationRun>, AppError> {
    let run = orchestration::orchestrate_agent(
        &state.db,
        &state.llm_registry,
        &state.tool_registry,    // 追加
        &state.event_bus,
        &request,
    )
    .await?;
    Ok(Json(run))
}

pub async fn approve_orchestration_handler(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<OrchestrationRun>, AppError> {
    let run = orchestration::approve_orchestration(
        &state.db,
        &state.llm_registry,
        &state.tool_registry,    // 追加
        &state.event_bus,
        id,
    )
    .await?;
    Ok(Json(run))
}
```

#### 2.5.6b `commands.rs` — Tauriコマンドにtool_registry追加

> **設計書レビュー指摘 B-3**: `commands.rs` が変更ファイルリストから欠落していた。
> handlers.rsと同様に、Tauriコマンド経由のオーケストレーション呼び出しにも
> `tool_registry` パラメータを追加する必要がある。

```rust
// commands.rs の変更:

#[tauri::command(rename_all = "snake_case")]
pub async fn orchestrate_agent(
    db: State<'_, DbPool>,
    registry: State<'_, Arc<LlmRegistry>>,
    tool_registry: State<'_, Arc<ToolRegistry>>,  // 追加
    event_bus: State<'_, EventBus>,
    agent_id: Uuid,
    input: String,
    mode: String,
) -> Result<OrchestrationRun, AppError> {
    let request = OrchestrateRequest { agent_id, input, mode };
    orchestration::orchestrate_agent(&db, &registry, &tool_registry, &event_bus, &request).await
}

#[tauri::command]
pub async fn approve_orchestration(
    db: State<'_, DbPool>,
    registry: State<'_, Arc<LlmRegistry>>,
    tool_registry: State<'_, Arc<ToolRegistry>>,  // 追加
    event_bus: State<'_, EventBus>,
    id: Uuid,
) -> Result<OrchestrationRun, AppError> {
    orchestration::approve_orchestration(&db, &registry, &tool_registry, &event_bus, id).await
}
```

#### 2.5.7 `services/orchestration/api.rs` — ToolRegistry利用

> **設計書レビュー指摘 B-5**: `std::env::current_dir()` は Tauri/Windows 環境では
> 不定値（インストーラ実行時の CWD やシステムディレクトリ等）になる可能性がある。
> 環境変数 `TEBIKI_PROJECT_ROOT` またはTauriのアプリデータパスを使用する。

```rust
// orchestrate_agent() のシグネチャ変更:
pub async fn orchestrate_agent(
    db: &DbPool,
    registry: &Arc<LlmRegistry>,
    tool_registry: &Arc<ToolRegistry>,  // 追加
    event_bus: &EventBus,
    request: &OrchestrateRequest,
) -> Result<OrchestrationRun, AppError> {
    // ...

    // working_dir の決定: 環境変数 > cargo manifest dir > current_dir
    let project_root = std::env::var("TEBIKI_PROJECT_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            // 開発時は CARGO_MANIFEST_DIR が使える
            std::env::var("CARGO_MANIFEST_DIR")
                .map(|d| std::path::PathBuf::from(d).parent().unwrap_or(std::path::Path::new(".")).to_path_buf())
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
        });

    let tool_context = crate::tools::types::ToolContext {
        working_dir: project_root.clone(),
        allowed_write_dirs: vec![
            // プロジェクトのdoc/ディレクトリのみ許可（デフォルト）
            project_root.join("doc"),
        ],
        allowed_commands: vec![
            "bun".into(), "cargo".into(), "biome".into(),
            "ls".into(), "cat".into(), "wc".into(), "tree".into(),
        ],
        git_permission: crate::tools::types::GitPermission::ReadOnly,
        http_timeout_secs: 30,
        shell_timeout_ms: 60_000,
    };

    let ctx = OrchestrationContext {
        // ... 既存フィールド ...
        tool_registry: tool_registry.clone(),
        enabled_tools: vec![                   // エージェント設定から取得（Phase2でDB化）
            "web_fetch".into(),
            "web_search".into(),
        ],
        tool_context,
    };
    // ...
}
```

> **設計書レビュー指摘 B-4**: `approve_orchestration()` も `OrchestrationContext` を
> 再構築するため、同様に `tool_registry` パラメータを受け取る必要がある。

```rust
// approve_orchestration() のシグネチャ変更:
pub async fn approve_orchestration(
    db: &DbPool,
    registry: &Arc<LlmRegistry>,
    tool_registry: &Arc<ToolRegistry>,  // 追加
    event_bus: &EventBus,
    orchestration_run_id: Uuid,
) -> Result<OrchestrationRun, AppError> {
    // ...

    // OrchestrationContext再構築時に tool_registry と tool_context を追加
    // （orchestrate_agent() と同じ working_dir 決定ロジックを使用）
    let project_root = std::env::var("TEBIKI_PROJECT_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("CARGO_MANIFEST_DIR")
                .map(|d| std::path::PathBuf::from(d).parent().unwrap_or(std::path::Path::new(".")).to_path_buf())
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
        });

    let tool_context = crate::tools::types::ToolContext {
        working_dir: project_root.clone(),
        allowed_write_dirs: vec![project_root.join("doc")],
        // ... 他のフィールドは orchestrate_agent() と同じ ...
        ..Default::default()
    };

    let ctx = OrchestrationContext {
        // ... 既存フィールド（現在のコードと同じ） ...
        tool_registry: tool_registry.clone(),
        enabled_tools: vec!["web_fetch".into(), "web_search".into()],
        tool_context,
    };
    // ...
}
```

---

## 3. execution_service.rs へのツールサポート追加

現在の `execute_agent()` は `tools: None` でLLMを呼んでいる。

> **設計書レビュー指摘 A-5**: 既存の `execute_agent()` は変更しない。
> 新たに `execute_agent_with_tools()` を追加し、ツール対応版として提供する。
> 既存のAPI呼び出し（`handlers::execute_agent_handler`, `commands::execute_agent`,
> `orchestration/tools.rs` の `TOOL_EXECUTE_SUB_AGENT`）は既存関数をそのまま使用し、
> 後方互換性を維持する。

### 3.1 設計方針

```text
execute_agent()               ← 既存。変更なし。tools: None のまま。
                                 オーケストレーション内のサブエージェント実行で引き続き使用。

execute_agent_with_tools()    ← 新規追加。ツール対応版。
                                 フロントエンドのAIパネルからのツール付き実行で使用。
                                 新しいハンドラ/コマンドから呼ばれる。

呼び出し元:
  handlers.rs:
    execute_agent_handler         → execute_agent()          (変更なし)
    execute_agent_with_tools_handler → execute_agent_with_tools() (新規)

  commands.rs:
    execute_agent                 → execute_agent()          (変更なし)
    execute_agent_with_tools      → execute_agent_with_tools() (新規)

  orchestration/tools.rs:
    TOOL_EXECUTE_SUB_AGENT        → execute_agent()          (変更なし)
```

### 3.1b ExecuteAgentRequest の拡張

```rust
// models.rs — 既存のリクエストはそのまま維持
#[derive(Debug, Deserialize)]
pub struct ExecuteAgentRequest {
    pub agent_id: Uuid,
    pub input: String,
}

// 新規: ツール付き実行リクエスト
#[derive(Debug, Deserialize)]
pub struct ExecuteAgentWithToolsRequest {
    pub agent_id: Uuid,
    pub input: String,
    pub enabled_tools: Vec<String>,
    pub tool_config: Option<serde_json::Value>,  // ツール固有設定のオーバーライド
}
```

### 3.2 単体実行でのツールループ

```rust
/// ツール対応の単体エージェント実行
pub async fn execute_agent_with_tools(
    db: &DbPool,
    registry: &Arc<LlmRegistry>,
    tool_registry: &Arc<ToolRegistry>,
    event_bus: &EventBus,
    request: &ExecuteAgentRequest,
    enabled_tools: Vec<String>,
    tool_context: ToolContext,
) -> Result<AgentExecution, AppError> {
    // ... 既存のagent/provider読み込み、execution作成 ...

    let tool_defs = if enabled_tools.is_empty() {
        None
    } else {
        Some(tool_registry.definitions_for(&enabled_tools))
    };

    let mut messages = vec![LlmMessage {
        role: ROLE_USER.to_string(),
        content: MessageContent::Text(request.input.clone()),
    }];

    let max_iterations = 5; // 単体実行は最大5回
    let mut iteration = 0;

    loop {
        iteration += 1;
        if iteration > max_iterations { break; }

        let llm_request = LlmRequest {
            model: agent.model.clone(),
            messages: messages.clone(),
            system: agent.system_prompt.clone(),
            temperature: agent.temperature,
            max_tokens: agent.max_tokens,
            tools: tool_defs.clone(),
        };

        let response = llm_provider.complete(&llm_request).await?;
        let stop_reason = response.stop_reason.as_deref().unwrap_or("end_turn");

        if stop_reason == "end_turn" || stop_reason == "stop" {
            // 完了 — 結果を保存して返す
            // ... 既存の完了処理 ...
            break;
        }

        if stop_reason == "tool_use" {
            // ツール呼び出しを実行
            messages.push(LlmMessage {
                role: ROLE_ASSISTANT.to_string(),
                content: MessageContent::Blocks(response.content_blocks.clone()),
            });

            let tool_uses: Vec<ContentBlock> = response.content_blocks.iter()
                .filter(|b| matches!(b, ContentBlock::ToolUse { .. }))
                .cloned()
                .collect();

            let mut results = Vec::new();
            for tu in &tool_uses {
                if let ContentBlock::ToolUse { id, name, input } = tu {
                    let result = tool_registry.execute(name, input, &tool_context).await;
                    results.push(ContentBlock::ToolResult {
                        tool_use_id: id.clone(),
                        content: result.content,
                        is_error: result.is_error,
                    });
                }
            }

            messages.push(LlmMessage {
                role: ROLE_USER.to_string(),
                content: MessageContent::Blocks(results),
            });

            continue;
        }

        break; // 不明なstop_reason
    }

    // ... 結果の保存 ...
}
```

---

## 4. データベース設計

### 4.1 新規マイグレーション

```sql
-- 20260216000001_create_tool_permissions.sql

-- エージェントごとのツール有効/無効設定
CREATE TABLE IF NOT EXISTS agent_tool_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_name VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    config JSONB,  -- ツール固有設定（allowed_dirs, allowed_commands等）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, tool_name)
);

-- ツール実行ログ
CREATE TABLE IF NOT EXISTS tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
    tool_name VARCHAR(100) NOT NULL,
    input JSONB NOT NULL,
    output TEXT,
    is_error BOOLEAN NOT NULL DEFAULT false,
    duration_ms BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_executions_execution_id ON tool_executions(execution_id);
CREATE INDEX idx_agent_tool_permissions_agent_id ON agent_tool_permissions(agent_id);

-- updated_atトリガー（既存マイグレーションの命名規則に合わせる）
CREATE TRIGGER update_agent_tool_permissions_updated_at
    BEFORE UPDATE ON agent_tool_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 4.2 新規モデル (`models.rs` に追加)

```rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentToolPermission {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub tool_name: String,
    pub is_enabled: bool,
    pub config: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ToolExecution {
    pub id: Uuid,
    pub execution_id: Option<Uuid>,
    pub tool_name: String,
    pub input: serde_json::Value,
    pub output: Option<String>,
    pub is_error: bool,
    pub duration_ms: Option<i64>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// APIリクエスト
#[derive(Debug, Deserialize)]
pub struct UpdateToolPermissionsRequest {
    pub agent_id: Uuid,
    pub tools: Vec<ToolPermissionEntry>,
}

#[derive(Debug, Deserialize)]
pub struct ToolPermissionEntry {
    pub tool_name: String,
    pub is_enabled: bool,
    pub config: Option<serde_json::Value>,
}
```

---

## 5. フロントエンド設計

### 5.1 型定義の追加 (`types.ts`)

```typescript
// src/pages/dashboard/types.ts に追加

/** バックエンドツールの定義 */
export interface BackendToolDef {
  name: string;
  category: "ReadOnly" | "FileSystem" | "Execution" | "VersionControl" | "Composite";
  definition: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
}

/** エージェントのツール設定 */
export interface AgentToolConfig {
  toolName: string;
  isEnabled: boolean;
  config?: Record<string, unknown>;
}
```

### 5.2 APIユーティリティの追加 (`utils/agent.ts`)

```typescript
// src/utils/agent.ts に追加

/** 利用可能なツール一覧を取得 */
export async function listTools(): Promise<BackendToolDef[]> {
  return apiCall<BackendToolDef[]>(
    "list_tools", "GET", "/api/tools", {}
  );
}

/** エージェントのツール設定を更新 */
export async function updateToolPermissions(
  agentId: string,
  tools: AgentToolConfig[],
): Promise<void> {
  return apiCall<void>(
    "update_tool_permissions", "POST", "/api/tools/config",
    { agent_id: agentId, tools }
  );
}
```

### 5.3 AIパネルUIの変更 (`Dashboard.tsx`)

AIパネルの設定エリアに「ツール」セクションを追加:

```
┌─ AI Panel Settings ─────────────────────┐
│ System Prompt: [                       ] │
│ User Prompt:   [                       ] │
│ Model:         [claude-sonnet-4-5  ▼]    │
│ Temperature:   [0.7    ]                 │
│ Max Tokens:    [4096   ]                 │
│ Provider:      [anthropic ▼]             │
│ Orchestration: [none ▼]                  │
│                                          │
│ ── Tools ──────────────────────────────  │
│ ☑ web_fetch    (ReadOnly)   [Configure]  │
│ ☑ web_search   (ReadOnly)   [Configure]  │
│ ☐ file_write   (FileSystem) [Configure]  │
│ ☐ shell_exec   (Execution)  [Configure]  │
│ ☐ git_ops      (VCS)        [Configure]  │
│ ☐ self_eval    (Composite)  [Configure]  │
│                                          │
│ [Configure] クリック時:                   │
│ ┌─ file_write Config ──────────────────┐ │
│ │ Allowed Dirs: [doc/, src/generated/] │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 5.4 `widgetContent.ts` の変更

`makeAiContent()` にツール選択UIのHTMLを追加:

```typescript
// ツール選択UIのHTML生成
function makeToolsSection(tools: BackendToolDef[], enabledTools: string[]): string {
  return `
    <div class="ai-tools-section" style="margin-top:8px; border-top:1px solid var(--border);">
      <div style="font-size:11px; color:var(--text-muted); margin:4px 0;">Tools</div>
      ${tools.map(t => `
        <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;">
          <input type="checkbox" data-tool-name="${t.name}"
            ${enabledTools.includes(t.name) ? 'checked' : ''}>
          <span>${t.name}</span>
          <span style="color:var(--text-muted); font-size:10px;">(${t.category})</span>
        </label>
      `).join('')}
    </div>
  `;
}
```

### 5.5 `PanelConfig` の変更

```typescript
export interface PanelConfig {
  // ... 既存フィールド ...
  aiEnabledTools: string[];     // 有効なツール名リスト（追加）
  aiToolConfig: Record<string, Record<string, unknown>>;  // ツール固有設定（追加）
}
```

### 5.6 パイプラインエンジンの変更 (`pipelineEngine.ts`)

`executePipeline()` がAIパネル実行時にツール設定を渡すよう変更:

```typescript
// AIパネル実行時にツール設定をdata属性から取得
const enabledTools = aiRoot?.getAttribute("data-ai-enabled-tools")?.split(",").filter(Boolean) ?? [];

// executeAgentに渡す（バックエンドがツール対応版を呼ぶ）
const execution = await executeAgentWithTools(agentId, augmentedPrompt, enabledTools);
```

---

## 6. イベントバスの拡張 (`event_bus.rs`)

```rust
// ExecutionEventに追加:

/// ツール実行イベント（リアルタイムでフロントエンドに通知）
ToolExecutionStarted {
    execution_id: Uuid,
    tool_name: String,
},
ToolExecutionCompleted {
    execution_id: Uuid,
    tool_name: String,
    duration_ms: u64,
    is_error: bool,
},
```

---

## 7. エラー型の拡張 (`error.rs`)

```rust
// AppErrorに追加:

/// ツール実行失敗
ToolExecutionFailed(String),    // → 500

/// ツール権限なし
ToolPermissionDenied(String),   // → 403
```

---

## 8. 実装フェーズ

### Phase 1: 基盤 + ReadOnlyツール

**変更ファイル:**
| ファイル | 変更内容 |
|---|---|
| `src-tauri/src/tools/mod.rs` | 新規: ToolRegistry, Tool trait |
| `src-tauri/src/tools/types.rs` | 新規: ToolContext, ToolResult |
| `src-tauri/src/tools/web_fetch.rs` | 新規: WebFetchTool |
| `src-tauri/src/tools/web_search.rs` | 新規: WebSearchTool |
| `src-tauri/src/constants.rs` | 追加: ツール名定数 |
| `src-tauri/src/lib.rs` | 追加: ToolRegistry初期化, mod tools, 新ルート |
| `src-tauri/src/handlers.rs` | 追加: AppState変更, list_tools, update_tool_config, orchestrate系ハンドラ変更 |
| `src-tauri/src/commands.rs` | 変更: orchestrate/approve コマンドに tool_registry 追加 |
| `src-tauri/src/services/orchestration/context.rs` | 変更: tool_registry, enabled_tools追加 |
| `src-tauri/src/services/orchestration/tools.rs` | 変更: 動的ツール取得, ToolRegistry委譲 |
| `src-tauri/src/services/orchestration/tool_loop.rs` | 変更: orchestrator_tools(ctx) |
| `src-tauri/src/services/orchestration/api.rs` | 変更: ToolContext構築 |
| `migrations/` | 新規: agent_tool_permissions, tool_executions |
| `src-tauri/src/models.rs` | 追加: AgentToolPermission, ToolExecution |
| `src/pages/dashboard/types.ts` | 追加: BackendToolDef, AgentToolConfig |
| `src/utils/agent.ts` | 追加: listTools(), updateToolPermissions() |
| `.env.example` | 追加: BRAVE_SEARCH_API_KEY |

**検証方法:**
1. `GET /api/tools` で6ツールが返る
2. オーケストレーション実行でweb_fetchが呼べる
3. フロントエンドでツール一覧が表示される

### Phase 2: FileSystem + Executionツール

**追加変更:**
| ファイル | 変更内容 |
|---|---|
| `src-tauri/src/tools/file_write.rs` | 新規 |
| `src-tauri/src/tools/shell_exec.rs` | 新規 |
| `src-tauri/src/tools/git_ops.rs` | 新規 |
| `src/pages/dashboard/widgetContent.ts` | 変更: ツール選択UI追加 |
| `src/pages/Dashboard.tsx` | 変更: ツール設定パネル |
| `src/pages/dashboard/types.ts` | 変更: PanelConfig拡張 |
| `src-tauri/src/services/execution_service.rs` | 変更: ツール対応実行追加 |
| `src-tauri/src/event_bus.rs` | 追加: ToolExecution イベント |
| `src-tauri/src/error.rs` | 追加: ToolExecutionFailed, ToolPermissionDenied |

**検証方法:**
1. AIパネルからfile_writeでdoc/にファイル作成
2. shell_execで`bun run check`を実行して結果取得
3. git_opsでstatus/diffが取得できる

### Phase 3: self_eval + パイプライン統合

**追加変更:**
| ファイル | 変更内容 |
|---|---|
| `src-tauri/src/tools/self_eval.rs` | 新規 |
| `src/pages/dashboard/pipelineEngine.ts` | 変更: ツール設定の伝播 |

**検証方法:**
1. self_evalがbuild/lint/type_checkを一括実行
2. パイプラインでの多段ツール利用（web_search → AI分析 → file_write）

---

## 9. セキュリティ考慮事項

### 9.0 設計書レビューで追加されたセキュリティ修正

| 指摘ID | 重要度 | 内容 | 修正箇所 |
| -------- | -------- | ------ | ---------- |
| A-2 | **Critical** | `shell_exec` のコマンドインジェクション。`command.starts_with(allowed)` だけでは `ls && rm -rf /` を防げない | Section 2.4.4: `FORBIDDEN_PATTERNS` による禁止メタ文字チェックを追加。ホワイトリスト比較を先頭トークン完全一致に変更 |
| A-3 | **Critical** | `file_write` のパストラバーサル。`path.starts_with(allowed)` だけでは `../../etc/passwd` を防げない | Section 2.4.3: `canonicalize()` で正規化してから比較。allowed側も canonicalize |
| B-5 | Medium | `std::env::current_dir()` が Tauri/Windows で不定 | Section 2.5.7: `TEBIKI_PROJECT_ROOT` 環境変数を使用 |
| A-7 | High | マイグレーション関数名の不一致 | Section 4.1: `update_updated_at_column()` に統一 |
| A-5 | High | `execute_agent_with_tools` と既存関数の関係が不明確 | Section 3.1: 既存は変更なし、新規関数を追加 |
| A-6, B-3, B-4 | High | `orchestrate/approve` のシグネチャ波及漏れ | Section 2.5.6, 2.5.6b, 2.5.7: handlers.rs, commands.rs, approve_orchestration を網羅 |

### 9.1 デフォルトで安全

- 全ツールはデフォルト無効（エージェントごとに明示的に有効化が必要）
- `file_write` のallowed_dirsはデフォルトで `doc/` のみ
- `shell_exec` のallowed_commandsはデフォルトで読み取り系のみ
- `git_ops` はデフォルトでReadOnly

### 9.2 絶対に禁止する操作

- `rm -rf`, `rmdir` 等の破壊的コマンド（shell_execのホワイトリストで制御）
- `git push`, `git push --force`（git_opsに含めない）
- `/etc`, `/usr`, `C:\Windows` 等のシステムディレクトリへの書き込み（file_writeのallowlist）
- 環境変数の読み取り・書き込み（shell_execで`env`, `export`を禁止）

### 9.3 承認フロー連携

- `ToolCategory::FileSystem` と `ToolCategory::Execution` のツールは、オーケストレーションの`approval`モードでは実行前にユーザー確認が入る（既存の承認UI再利用）
- `ToolCategory::ReadOnly` は承認不要で即座に実行

---

## 10. Cargo.toml の依存関係

追加が必要なクレートはない。既存の依存関係で全ツールが実装可能:

| ツール | 使用クレート | 状態 |
|---|---|---|
| web_fetch | `reqwest` | 既存 |
| web_search | `reqwest` | 既存 |
| file_write | `tokio::fs` | 既存（tokio） |
| shell_exec | `tokio::process` | 既存（tokio） |
| git_ops | `tokio::process`（git CLI呼出） | 既存（tokio） |
| self_eval | `tokio::process` | 既存（tokio） |

---

## 付録: ファイル変更一覧（全フェーズ合計）

### 新規作成（8ファイル）

```
src-tauri/src/tools/mod.rs
src-tauri/src/tools/types.rs
src-tauri/src/tools/web_fetch.rs
src-tauri/src/tools/web_search.rs
src-tauri/src/tools/file_write.rs
src-tauri/src/tools/shell_exec.rs
src-tauri/src/tools/git_ops.rs
src-tauri/src/tools/self_eval.rs
src-tauri/migrations/20260216000001_create_tool_permissions.sql
```

### 変更（13ファイル）

```
src-tauri/src/lib.rs                          # mod tools, ToolRegistry初期化, ルート追加
src-tauri/src/constants.rs                    # ツール名定数追加
src-tauri/src/models.rs                       # AgentToolPermission, ToolExecution, ExecuteAgentWithToolsRequest追加
src-tauri/src/handlers.rs                     # AppState変更, 新ハンドラ3つ, orchestrate系ハンドラ変更
src-tauri/src/commands.rs                     # orchestrate/approve コマンドに tool_registry 追加
src-tauri/src/error.rs                        # エラーバリアント2つ追加
src-tauri/src/event_bus.rs                    # ToolExecutionイベント追加
src-tauri/src/services/orchestration/context.rs  # tool_registry, enabled_tools, tool_context追加
src-tauri/src/services/orchestration/tools.rs    # 動的ツール取得, ToolRegistry委譲
src-tauri/src/services/orchestration/tool_loop.rs # orchestrator_tools(ctx)
src-tauri/src/services/orchestration/api.rs      # ToolContext構築, tool_registry渡し, approve_orchestration変更
src-tauri/src/services/execution_service.rs      # execute_agent_with_tools() 新規追加
.env.example                                     # BRAVE_SEARCH_API_KEY, TEBIKI_PROJECT_ROOT追加
```

### フロントエンド変更（5ファイル）

```
src/pages/dashboard/types.ts                  # BackendToolDef, AgentToolConfig, PanelConfig拡張
src/utils/agent.ts                            # listTools(), updateToolPermissions()
src/pages/dashboard/widgetContent.ts          # ツール選択UI
src/pages/Dashboard.tsx                       # ツール設定パネル
src/pages/dashboard/pipelineEngine.ts         # ツール設定の伝播
```
