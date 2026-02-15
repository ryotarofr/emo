use async_trait::async_trait;

use crate::llm::types::ToolDefinition;

use super::types::{ToolContext, ToolResult};
use super::{Tool, ToolCategory};

/// シェルメタ文字として禁止するパターン
const FORBIDDEN_PATTERNS: &[&str] = &[
    "&&", "||", ";", "|", "$(", "`", "${", ">", ">>", "<", "\n", "\r",
];

pub struct ShellExecTool;

#[async_trait]
impl Tool for ShellExecTool {
    fn name(&self) -> &str {
        "shell_exec"
    }
    fn category(&self) -> ToolCategory {
        ToolCategory::Execution
    }

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
        for pattern in FORBIDDEN_PATTERNS {
            if command.contains(pattern) {
                return ToolResult::error(format!(
                    "Command contains forbidden shell metacharacter '{}'. \
                     Each command must be a single, simple command without chaining or redirection.",
                    pattern
                ));
            }
        }

        // コマンドのホワイトリストチェック（先頭トークンのみ完全一致）
        let base_command = command.split_whitespace().next().unwrap_or("");
        if !ctx
            .allowed_commands
            .iter()
            .any(|allowed| base_command == allowed.as_str())
        {
            return ToolResult::error(format!(
                "Command '{}' is not in the allowed command list. Allowed: {:?}",
                base_command, ctx.allowed_commands
            ));
        }

        // プロセス実行
        let timeout = std::time::Duration::from_millis(ctx.shell_timeout_ms);
        let start = std::time::Instant::now();

        let shell = if cfg!(target_os = "windows") {
            "cmd"
        } else {
            "bash"
        };
        let shell_arg = if cfg!(target_os = "windows") {
            "/C"
        } else {
            "-c"
        };

        let output = match tokio::time::timeout(timeout, async {
            tokio::process::Command::new(shell)
                .arg(shell_arg)
                .arg(command)
                .current_dir(&working_dir)
                .output()
                .await
        })
        .await
        {
            Ok(Ok(output)) => output,
            Ok(Err(e)) => return ToolResult::error(format!("Failed to execute command: {e}")),
            Err(_) => {
                return ToolResult::error(format!(
                    "Command timed out after {}ms",
                    ctx.shell_timeout_ms
                ))
            }
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

        ToolResult::ok(
            serde_json::json!({
                "command": command,
                "exit_code": output.status.code(),
                "stdout": stdout_truncated,
                "stderr": stderr_truncated,
                "duration_ms": duration_ms as u64,
                "success": output.status.success()
            })
            .to_string(),
        )
    }
}
