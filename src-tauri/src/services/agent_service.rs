use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{Agent, CreateAgentRequest, LlmProvider};

pub async fn create_agent(db: &DbPool, request: &CreateAgentRequest) -> Result<Agent, AppError> {
    let pool = db.get()?;
    let agent = sqlx::query_as::<_, Agent>(
        r#"
        INSERT INTO agents (workflow_id, llm_provider_id, name, description, system_prompt, model, temperature, max_tokens)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        "#,
    )
    .bind(request.workflow_id)
    .bind(request.llm_provider_id)
    .bind(&request.name)
    .bind(&request.description)
    .bind(&request.system_prompt)
    .bind(request.model.as_deref().unwrap_or("claude-sonnet-4-5-20250929"))
    .bind(request.temperature.unwrap_or(0.7))
    .bind(request.max_tokens.unwrap_or(1024))
    .fetch_one(&pool)
    .await?;

    Ok(agent)
}

pub async fn get_agents_by_workflow(
    db: &DbPool,
    workflow_id: Uuid,
) -> Result<Vec<Agent>, AppError> {
    let pool = db.get()?;
    let agents = sqlx::query_as::<_, Agent>(
        "SELECT * FROM agents WHERE workflow_id = $1 ORDER BY created_at ASC",
    )
    .bind(workflow_id)
    .fetch_all(&pool)
    .await?;

    Ok(agents)
}

#[allow(dead_code)]
pub async fn get_agent(db: &DbPool, id: Uuid) -> Result<Agent, AppError> {
    let pool = db.get()?;
    let agent = sqlx::query_as::<_, Agent>("SELECT * FROM agents WHERE id = $1")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(agent)
}

pub async fn get_llm_providers(db: &DbPool) -> Result<Vec<LlmProvider>, AppError> {
    let pool = db.get()?;
    let providers = sqlx::query_as::<_, LlmProvider>(
        "SELECT * FROM llm_providers WHERE is_enabled = true ORDER BY name ASC",
    )
    .fetch_all(&pool)
    .await?;

    Ok(providers)
}
