use async_trait::async_trait;

use crate::llm::types::ToolDefinition;

use super::types::{GitPermission, ToolContext, ToolResult};
use super::{Tool, ToolCategory};

pub struct GitOpsTool;

const WRITE_ACTIONS: &[&str] = &["add", "commit", "branch_create", "checkout"];

#[async_trait]
impl Tool for GitOpsTool {
    fn name(&self) -> &str {
        "git_ops"
    }
    fn category(&self) -> ToolCategory {
        ToolCategory::VersionControl
    }

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
            "status" => run_git(working_dir, &["status", "--porcelain"]).await,
            "diff" => run_git(working_dir, &["diff"]).await,
            "log" => {
                let max_count = args["max_count"].as_u64().unwrap_or(10);
                run_git(
                    working_dir,
                    &[
                        "log",
                        &format!("--max-count={max_count}"),
                        "--oneline",
                        "--decorate",
                    ],
                )
                .await
            }
            "show" => {
                let ref_name = args["ref"].as_str().unwrap_or("HEAD");
                run_git(working_dir, &["show", "--stat", ref_name]).await
            }
            "branch_list" => run_git(working_dir, &["branch", "-a"]).await,
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
                ToolResult::ok(
                    serde_json::json!({
                        "output": stdout.trim(),
                        "success": true
                    })
                    .to_string(),
                )
            } else {
                ToolResult::error(format!(
                    "git {} failed:\n{}",
                    args.join(" "),
                    stderr.trim()
                ))
            }
        }
        Err(e) => ToolResult::error(format!("Failed to run git: {e}")),
    }
}
