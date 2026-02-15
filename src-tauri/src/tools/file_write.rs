use std::path::Path;

use async_trait::async_trait;

use crate::llm::types::ToolDefinition;

use super::types::{ToolContext, ToolResult};
use super::{Tool, ToolCategory};

pub struct FileWriteTool;

#[async_trait]
impl Tool for FileWriteTool {
    fn name(&self) -> &str {
        "file_write"
    }
    fn category(&self) -> ToolCategory {
        ToolCategory::FileSystem
    }

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
                "File writing is disabled. No allowed write directories configured.".into(),
            );
        }

        // パストラバーサル対策: canonicalize() で正規化してから比較する。
        // path.starts_with(allowed) だけでは "../../etc/passwd" のような
        // 相対パスでのディレクトリ脱出を防げない。
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                if let Err(e) = tokio::fs::create_dir_all(parent).await {
                    return ToolResult::error(format!("Failed to create directory: {e}"));
                }
            }
        }

        let canonical_path = match tokio::fs::canonicalize(path.parent().unwrap_or(&path)).await {
            Ok(p) => p.join(path.file_name().unwrap_or_default()),
            Err(e) => {
                return ToolResult::error(format!(
                    "Failed to resolve path '{}': {e}",
                    path.display()
                ))
            }
        };

        let is_allowed = ctx.allowed_write_dirs.iter().any(|allowed| {
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
                if let Err(e) = tokio::fs::write(&path, content).await {
                    return ToolResult::error(format!("Failed to write file: {e}"));
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
                if let Err(e) = tokio::fs::write(&path, content).await {
                    return ToolResult::error(format!("Failed to write file: {e}"));
                }
            }
        }

        let bytes_written = content.len();
        ToolResult::ok(
            serde_json::json!({
                "path": path.display().to_string(),
                "mode": mode,
                "bytes_written": bytes_written,
                "success": true
            })
            .to_string(),
        )
    }
}
