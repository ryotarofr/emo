use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub is_active: bool,
    #[serde(skip)]
    pub password_hash: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserAuthProvider {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub provider_user_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Agent Orchestration Models ---

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct LlmProvider {
    pub id: Uuid,
    pub name: String,
    pub display_name: String,
    pub api_base_url: Option<String>,
    pub is_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Workflow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Agent {
    pub id: Uuid,
    pub workflow_id: Uuid,
    pub llm_provider_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WorkflowRun {
    pub id: Uuid,
    pub workflow_id: Uuid,
    pub status: String,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AgentExecution {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub workflow_run_id: Option<Uuid>,
    pub status: String,
    pub input_text: Option<String>,
    pub output_text: Option<String>,
    pub token_usage: Option<serde_json::Value>,
    pub duration_ms: Option<i64>,
    pub error_message: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AgentMessage {
    pub id: Uuid,
    pub execution_id: Uuid,
    pub role: String,
    pub content: String,
    pub sequence_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Request DTOs ---

#[derive(Debug, Deserialize)]
pub struct CreateWorkflowRequest {
    pub user_id: Uuid,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentRequest {
    pub workflow_id: Uuid,
    pub llm_provider_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteAgentRequest {
    pub agent_id: Uuid,
    pub input: String,
}

// --- Orchestration Models ---

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OrchestrationRun {
    pub id: Uuid,
    pub orchestrator_agent_id: Uuid,
    pub workflow_run_id: Uuid,
    pub execution_id: Uuid,
    pub mode: String,
    pub status: String,
    pub plan_json: Option<serde_json::Value>,
    pub messages_json: Option<serde_json::Value>,
    pub final_output: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct OrchestrateRequest {
    pub agent_id: Uuid,
    pub input: String,
    pub mode: String,
}

// --- Tool System Models ---

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AgentToolPermission {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub tool_name: String,
    pub is_enabled: bool,
    pub config: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[allow(dead_code)]
pub struct ToolExecution {
    pub id: Uuid,
    pub execution_id: Option<Uuid>,
    pub tool_name: String,
    pub input: serde_json::Value,
    pub output: Option<String>,
    pub is_error: bool,
    pub duration_ms: Option<i64>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ExecuteAgentWithToolsRequest {
    pub agent_id: Uuid,
    pub input: String,
    pub enabled_tools: Vec<String>,
    pub tool_config: Option<serde_json::Value>,
}

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
