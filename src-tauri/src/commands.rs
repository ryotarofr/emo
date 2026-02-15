use std::sync::Arc;

use tauri::State;
use uuid::Uuid;

use crate::auth;
use crate::db::DbPool;
use crate::error::AppError;
use crate::event_bus::EventBus;
use crate::llm::LlmRegistry;
use crate::models::{
    Agent, AgentExecution, AgentMessage, CreateAgentRequest, CreateUserRequest,
    CreateWorkflowRequest, ExecuteAgentRequest, LlmProvider, OrchestrateRequest, OrchestrationRun,
    User, Workflow,
};
use crate::services::{
    agent_service, auth_service, execution_service, orchestration, user_service,
    workflow_service,
};
use crate::tools::ToolRegistry;

// --- DB commands ---

#[tauri::command]
pub async fn db_health_check(db: State<'_, DbPool>) -> Result<String, AppError> {
    user_service::health_check(&db).await
}

#[tauri::command]
pub async fn get_users(db: State<'_, DbPool>) -> Result<Vec<User>, AppError> {
    user_service::get_users(&db).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_user(
    db: State<'_, DbPool>,
    username: String,
    email: Option<String>,
    display_name: Option<String>,
) -> Result<User, AppError> {
    let request = CreateUserRequest {
        username,
        email,
        display_name,
    };
    user_service::create_user(&db, &request).await
}

// --- Auth commands ---

#[tauri::command]
pub async fn check_session(db: State<'_, DbPool>) -> Result<Option<User>, AppError> {
    auth_service::check_session(&db).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn login_with_password(
    db: State<'_, DbPool>,
    email: String,
    password: String,
) -> Result<User, AppError> {
    auth_service::login_with_password(&db, &email, &password).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn register_with_password(
    db: State<'_, DbPool>,
    username: String,
    email: String,
    password: String,
) -> Result<User, AppError> {
    auth_service::register_with_password(&db, &username, &email, &password).await
}

#[tauri::command]
pub async fn start_oauth(db: State<'_, DbPool>, provider: String) -> Result<User, AppError> {
    let user_info = auth::oauth::start_oauth_flow(&provider).await?;
    auth_service::oauth_login(&db, &provider, user_info).await
}

#[tauri::command]
pub async fn logout() -> Result<(), AppError> {
    auth_service::logout()
}

// --- Workflow commands ---

#[tauri::command(rename_all = "snake_case")]
pub async fn create_workflow(
    db: State<'_, DbPool>,
    user_id: Uuid,
    name: String,
    description: Option<String>,
) -> Result<Workflow, AppError> {
    let request = CreateWorkflowRequest {
        user_id,
        name,
        description,
    };
    workflow_service::create_workflow(&db, &request).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_workflows(
    db: State<'_, DbPool>,
    user_id: Uuid,
) -> Result<Vec<Workflow>, AppError> {
    workflow_service::get_workflows_by_user(&db, user_id).await
}

#[tauri::command]
pub async fn get_workflow(db: State<'_, DbPool>, id: Uuid) -> Result<Workflow, AppError> {
    workflow_service::get_workflow(&db, id).await
}

// --- Agent commands ---

#[tauri::command(rename_all = "snake_case")]
pub async fn create_agent(
    db: State<'_, DbPool>,
    workflow_id: Uuid,
    llm_provider_id: Uuid,
    name: String,
    description: Option<String>,
    system_prompt: Option<String>,
    model: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<i32>,
) -> Result<Agent, AppError> {
    let request = CreateAgentRequest {
        workflow_id,
        llm_provider_id,
        name,
        description,
        system_prompt,
        model,
        temperature,
        max_tokens,
    };
    agent_service::create_agent(&db, &request).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_agents(db: State<'_, DbPool>, workflow_id: Uuid) -> Result<Vec<Agent>, AppError> {
    agent_service::get_agents_by_workflow(&db, workflow_id).await
}

#[tauri::command]
pub async fn get_llm_providers(db: State<'_, DbPool>) -> Result<Vec<LlmProvider>, AppError> {
    agent_service::get_llm_providers(&db).await
}

// --- Execution commands ---

#[tauri::command(rename_all = "snake_case")]
pub async fn execute_agent(
    db: State<'_, DbPool>,
    registry: State<'_, Arc<LlmRegistry>>,
    event_bus: State<'_, EventBus>,
    agent_id: Uuid,
    input: String,
) -> Result<AgentExecution, AppError> {
    let request = ExecuteAgentRequest { agent_id, input };
    execution_service::execute_agent(&db, &registry, &event_bus, &request).await
}

#[tauri::command]
pub async fn get_execution(db: State<'_, DbPool>, id: Uuid) -> Result<AgentExecution, AppError> {
    execution_service::get_execution(&db, id).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_execution_messages(
    db: State<'_, DbPool>,
    execution_id: Uuid,
) -> Result<Vec<AgentMessage>, AppError> {
    execution_service::get_execution_messages(&db, execution_id).await
}

// --- Orchestration commands ---

#[tauri::command(rename_all = "snake_case")]
pub async fn orchestrate_agent(
    db: State<'_, DbPool>,
    registry: State<'_, Arc<LlmRegistry>>,
    event_bus: State<'_, EventBus>,
    tool_registry: State<'_, Arc<ToolRegistry>>,
    agent_id: Uuid,
    input: String,
    mode: String,
) -> Result<OrchestrationRun, AppError> {
    let request = OrchestrateRequest {
        agent_id,
        input,
        mode,
    };
    orchestration::orchestrate_agent(&db, &registry, &event_bus, &tool_registry, &request).await
}

#[tauri::command]
pub async fn get_orchestration(
    db: State<'_, DbPool>,
    id: Uuid,
) -> Result<OrchestrationRun, AppError> {
    orchestration::get_orchestration(&db, id).await
}

#[tauri::command]
pub async fn approve_orchestration(
    db: State<'_, DbPool>,
    registry: State<'_, Arc<LlmRegistry>>,
    event_bus: State<'_, EventBus>,
    tool_registry: State<'_, Arc<ToolRegistry>>,
    id: Uuid,
) -> Result<OrchestrationRun, AppError> {
    orchestration::approve_orchestration(&db, &registry, &event_bus, &tool_registry, id).await
}

#[tauri::command]
pub async fn reject_orchestration(
    db: State<'_, DbPool>,
    event_bus: State<'_, EventBus>,
    id: Uuid,
) -> Result<OrchestrationRun, AppError> {
    orchestration::reject_orchestration(&db, &event_bus, id).await
}

// --- Tool commands ---

#[tauri::command]
pub async fn list_tools(
    tool_registry: State<'_, Arc<ToolRegistry>>,
) -> Result<Vec<crate::llm::types::ToolDefinition>, AppError> {
    let names = tool_registry.tool_names();
    Ok(tool_registry.definitions_for(&names))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_tool_permissions(
    db: State<'_, DbPool>,
    agent_id: Uuid,
    tools: Vec<crate::models::ToolPermissionEntry>,
) -> Result<serde_json::Value, AppError> {
    let pool = db.get()?;
    for entry in &tools {
        sqlx::query(
            r#"
            INSERT INTO agent_tool_permissions (agent_id, tool_name, is_enabled, config)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (agent_id, tool_name) DO UPDATE
            SET is_enabled = EXCLUDED.is_enabled, config = EXCLUDED.config, updated_at = NOW()
            "#,
        )
        .bind(agent_id)
        .bind(&entry.tool_name)
        .bind(entry.is_enabled)
        .bind(&entry.config)
        .execute(&pool)
        .await?;
    }
    Ok(serde_json::json!({ "status": "ok" }))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_tool_permissions(
    db: State<'_, DbPool>,
    agent_id: Uuid,
) -> Result<Vec<crate::models::AgentToolPermission>, AppError> {
    let pool = db.get()?;
    let permissions = sqlx::query_as::<_, crate::models::AgentToolPermission>(
        "SELECT * FROM agent_tool_permissions WHERE agent_id = $1 ORDER BY tool_name",
    )
    .bind(agent_id)
    .fetch_all(&pool)
    .await?;
    Ok(permissions)
}
