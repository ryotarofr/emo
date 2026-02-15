use std::sync::Arc;

use uuid::Uuid;

use crate::db::DbPool;
use crate::event_bus::EventBus;
use crate::llm::LlmRegistry;
use crate::tools::ToolRegistry;

/// オーケストレーション実行全体で共有する状態をまとめた構造体。
/// パラメータ数を12個以上から2個（ctx + messages）に削減する。
pub(super) struct OrchestrationContext {
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
    // Tool system fields
    pub tool_registry: Arc<ToolRegistry>,
    pub enabled_tools: Vec<String>,
    pub tool_context: crate::tools::types::ToolContext,
}
