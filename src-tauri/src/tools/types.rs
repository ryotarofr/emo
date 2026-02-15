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
            working_dir: PathBuf::from("."),
            allowed_write_dirs: vec![],
            allowed_commands: vec![
                // デフォルトは読み取り系のみ
                "ls".into(),
                "cat".into(),
                "head".into(),
                "wc".into(),
                "find".into(),
                "grep".into(),
                "tree".into(),
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
    ReadOnly,  // status, log, diff のみ
    ReadWrite, // add, commit, branch も許可
}

/// ツール実行結果
#[derive(Debug)]
pub struct ToolResult {
    pub content: String,
    pub is_error: bool,
}

impl ToolResult {
    pub fn ok(content: String) -> Self {
        Self {
            content,
            is_error: false,
        }
    }
    pub fn error(message: String) -> Self {
        Self {
            content: message,
            is_error: true,
        }
    }
}
