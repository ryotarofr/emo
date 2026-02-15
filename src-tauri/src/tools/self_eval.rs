use async_trait::async_trait;

use crate::llm::types::ToolDefinition;

use super::types::{ToolContext, ToolResult};
use super::{Tool, ToolCategory};

pub struct SelfEvalTool;

#[async_trait]
impl Tool for SelfEvalTool {
    fn name(&self) -> &str {
        "self_eval"
    }
    fn category(&self) -> ToolCategory {
        ToolCategory::Composite
    }

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
                tokio::process::Command::new(shell)
                    .arg(shell_arg)
                    .arg(cmd)
                    .current_dir(working_dir)
                    .output()
                    .await
            })
            .await
            {
                Ok(Ok(o)) => o,
                Ok(Err(e)) => {
                    results.insert(
                        label.into(),
                        serde_json::json!({
                            "passed": false,
                            "error": format!("Failed to run: {e}"),
                            "duration_ms": start.elapsed().as_millis() as u64
                        }),
                    );
                    all_passed = false;
                    continue;
                }
                Err(_) => {
                    results.insert(
                        label.into(),
                        serde_json::json!({
                            "passed": false,
                            "error": "Timeout",
                            "duration_ms": start.elapsed().as_millis() as u64
                        }),
                    );
                    all_passed = false;
                    continue;
                }
            };

            let duration_ms = start.elapsed().as_millis() as u64;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let passed = output.status.success();

            if !passed {
                all_passed = false;
            }

            // 出力を制限（各5KB）
            let max = 5_000;
            let stdout_val: &str = if stdout.len() > max {
                &stdout[..max]
            } else {
                &stdout
            };
            let stderr_val: &str = if stderr.len() > max {
                &stderr[..max]
            } else {
                &stderr
            };
            results.insert(
                label.into(),
                serde_json::json!({
                    "passed": passed,
                    "exit_code": output.status.code(),
                    "stdout": stdout_val,
                    "stderr": stderr_val,
                    "duration_ms": duration_ms
                }),
            );
        }

        ToolResult::ok(
            serde_json::json!({
                "all_passed": all_passed,
                "checks": results,
                "total_checks": checks.len()
            })
            .to_string(),
        )
    }
}
