use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::Json;
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::event_bus::EventBus;
use crate::llm::LlmRegistry;
use crate::models::{
    Agent, AgentExecution, AgentMessage, CreateAgentRequest, CreateUserRequest,
    CreateWorkflowRequest, ExecuteAgentRequest, LlmProvider, OrchestrateRequest, OrchestrationRun,
    UpdateToolPermissionsRequest, User, Workflow,
};
use crate::services::{
    agent_service, auth_service, execution_service, orchestration, user_service,
    workflow_service,
};
use crate::tools::ToolRegistry;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub llm_registry: Arc<LlmRegistry>,
    pub event_bus: EventBus,
    pub tool_registry: Arc<ToolRegistry>,
}

// --- DB handlers ---

pub async fn health_check(State(state): State<AppState>) -> Result<Json<String>, AppError> {
    let msg = user_service::health_check(&state.db).await?;
    Ok(Json(msg))
}

pub async fn get_users(State(state): State<AppState>) -> Result<Json<Vec<User>>, AppError> {
    let users = user_service::get_users(&state.db).await?;
    Ok(Json(users))
}

pub async fn create_user(
    State(state): State<AppState>,
    Json(request): Json<CreateUserRequest>,
) -> Result<Json<User>, AppError> {
    let user = user_service::create_user(&state.db, &request).await?;
    Ok(Json(user))
}

// --- Auth handlers ---

pub async fn check_session(State(state): State<AppState>) -> Result<Json<Option<User>>, AppError> {
    let user = auth_service::check_session(&state.db).await?;
    Ok(Json(user))
}

#[derive(serde::Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

pub async fn login_with_password(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<User>, AppError> {
    let user = auth_service::login_with_password(&state.db, &req.email, &req.password).await?;
    Ok(Json(user))
}

#[derive(serde::Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

pub async fn register_with_password(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<User>, AppError> {
    let user =
        auth_service::register_with_password(&state.db, &req.username, &req.email, &req.password)
            .await?;
    Ok(Json(user))
}

pub async fn logout() -> Result<Json<()>, AppError> {
    auth_service::logout()?;
    Ok(Json(()))
}

// --- Workflow handlers ---

pub async fn create_workflow_handler(
    State(state): State<AppState>,
    Json(request): Json<CreateWorkflowRequest>,
) -> Result<Json<Workflow>, AppError> {
    let workflow = workflow_service::create_workflow(&state.db, &request).await?;
    Ok(Json(workflow))
}

#[derive(serde::Deserialize)]
pub struct UserIdQuery {
    pub user_id: Uuid,
}

pub async fn get_workflows_handler(
    State(state): State<AppState>,
    Query(query): Query<UserIdQuery>,
) -> Result<Json<Vec<Workflow>>, AppError> {
    let workflows = workflow_service::get_workflows_by_user(&state.db, query.user_id).await?;
    Ok(Json(workflows))
}

pub async fn get_workflow_handler(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Workflow>, AppError> {
    let workflow = workflow_service::get_workflow(&state.db, id).await?;
    Ok(Json(workflow))
}

// --- Agent handlers ---

pub async fn create_agent_handler(
    State(state): State<AppState>,
    Json(request): Json<CreateAgentRequest>,
) -> Result<Json<Agent>, AppError> {
    let agent = agent_service::create_agent(&state.db, &request).await?;
    Ok(Json(agent))
}

#[derive(serde::Deserialize)]
pub struct WorkflowIdQuery {
    pub workflow_id: Uuid,
}

pub async fn get_agents_handler(
    State(state): State<AppState>,
    Query(query): Query<WorkflowIdQuery>,
) -> Result<Json<Vec<Agent>>, AppError> {
    let agents = agent_service::get_agents_by_workflow(&state.db, query.workflow_id).await?;
    Ok(Json(agents))
}

pub async fn get_llm_providers_handler(
    State(state): State<AppState>,
) -> Result<Json<Vec<LlmProvider>>, AppError> {
    let providers = agent_service::get_llm_providers(&state.db).await?;
    Ok(Json(providers))
}

// --- Execution handlers ---

pub async fn execute_agent_handler(
    State(state): State<AppState>,
    Json(request): Json<ExecuteAgentRequest>,
) -> Result<Json<AgentExecution>, AppError> {
    let execution = execution_service::execute_agent(
        &state.db,
        &state.llm_registry,
        &state.event_bus,
        &request,
    )
    .await?;
    Ok(Json(execution))
}

pub async fn get_execution_handler(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<AgentExecution>, AppError> {
    let execution = execution_service::get_execution(&state.db, id).await?;
    Ok(Json(execution))
}

pub async fn get_execution_messages_handler(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<AgentMessage>>, AppError> {
    let messages = execution_service::get_execution_messages(&state.db, id).await?;
    Ok(Json(messages))
}

// --- Orchestration handlers ---

pub async fn orchestrate_agent_handler(
    State(state): State<AppState>,
    Json(request): Json<OrchestrateRequest>,
) -> Result<Json<OrchestrationRun>, AppError> {
    let run = orchestration::orchestrate_agent(
        &state.db,
        &state.llm_registry,
        &state.event_bus,
        &state.tool_registry,
        &request,
    )
    .await?;
    Ok(Json(run))
}

pub async fn get_orchestration_handler(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<OrchestrationRun>, AppError> {
    let run = orchestration::get_orchestration(&state.db, id).await?;
    Ok(Json(run))
}

pub async fn approve_orchestration_handler(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<OrchestrationRun>, AppError> {
    let run = orchestration::approve_orchestration(
        &state.db,
        &state.llm_registry,
        &state.event_bus,
        &state.tool_registry,
        id,
    )
    .await?;
    Ok(Json(run))
}

pub async fn reject_orchestration_handler(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<OrchestrationRun>, AppError> {
    let run = orchestration::reject_orchestration(&state.db, &state.event_bus, id).await?;
    Ok(Json(run))
}

// --- Tool handlers ---

/// 利用可能な全ツール定義を返す
pub async fn list_tools_handler(
    State(state): State<AppState>,
) -> Result<Json<Vec<crate::llm::types::ToolDefinition>>, AppError> {
    let names = state.tool_registry.tool_names();
    let definitions = state.tool_registry.definitions_for(&names);
    Ok(Json(definitions))
}

/// エージェントのツール権限を更新
pub async fn update_tool_permissions_handler(
    State(state): State<AppState>,
    Json(request): Json<UpdateToolPermissionsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let pool = state.db.get()?;

    for entry in &request.tools {
        sqlx::query(
            r#"
            INSERT INTO agent_tool_permissions (agent_id, tool_name, is_enabled, config)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (agent_id, tool_name) DO UPDATE
            SET is_enabled = EXCLUDED.is_enabled, config = EXCLUDED.config, updated_at = NOW()
            "#,
        )
        .bind(request.agent_id)
        .bind(&entry.tool_name)
        .bind(entry.is_enabled)
        .bind(&entry.config)
        .execute(&pool)
        .await?;
    }

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

/// エージェントのツール権限を取得
pub async fn get_tool_permissions_handler(
    State(state): State<AppState>,
    Path(agent_id): Path<Uuid>,
) -> Result<Json<Vec<crate::models::AgentToolPermission>>, AppError> {
    let pool = state.db.get()?;
    let permissions = sqlx::query_as::<_, crate::models::AgentToolPermission>(
        "SELECT * FROM agent_tool_permissions WHERE agent_id = $1 ORDER BY tool_name",
    )
    .bind(agent_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(permissions))
}
