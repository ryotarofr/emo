pub mod types;
pub mod web_fetch;
pub mod web_search;
pub mod file_write;
pub mod git_ops;
pub mod self_eval;
pub mod shell_exec;

use std::collections::HashMap;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::llm::types::ToolDefinition;
use types::{ToolContext, ToolResult};

/// 全ツールが実装するトレイト
#[async_trait]
pub trait Tool: Send + Sync {
    /// ツール名（LLM APIに渡す識別子）
    fn name(&self) -> &str;

    /// ツールの説明カテゴリ（UI表示専用）
    fn category(&self) -> ToolCategory;

    /// LLM APIに渡すToolDefinition（JSONスキーマ含む）
    fn definition(&self) -> ToolDefinition;

    /// ツールを実行し結果を返す
    async fn execute(&self, input: &serde_json::Value, ctx: &ToolContext) -> ToolResult;
}

/// ツールのカテゴリ（**UI表示専用**）
/// アクセス制御にはこのカテゴリではなく、ToolContextのフィールド
/// （allowed_commands, allowed_write_dirs, git_permission）を使用する。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[allow(dead_code)]
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
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    /// 名前でツールを取得
    #[allow(dead_code)]
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
