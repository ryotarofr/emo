use std::sync::Arc;

use chrono::Utc;
use uuid::Uuid;

use crate::constants::*;
use crate::db::DbPool;
use crate::error::AppError;
use crate::event_bus::{EventBus, ExecutionEvent};
use crate::llm::types::{LlmMessage, LlmRequest, MessageContent};
use crate::llm::LlmRegistry;
use crate::models::{AgentExecution, AgentMessage, ExecuteAgentRequest};

/// Maximum allowed input text length (100KB)
const MAX_INPUT_LENGTH: usize = 100_000;

pub async fn execute_agent(
    db: &DbPool,
    registry: &Arc<LlmRegistry>,
    event_bus: &EventBus,
    request: &ExecuteAgentRequest,
) -> Result<AgentExecution, AppError> {
    if request.input.len() > MAX_INPUT_LENGTH {
        return Err(AppError::InvalidInput(format!(
            "Input text too long ({} bytes). Maximum is {} bytes.",
            request.input.len(),
            MAX_INPUT_LENGTH
        )));
    }

    let pool = db.get()?;

    // 1. Load agent config and LLM provider from DB
    let agent = sqlx::query_as::<_, crate::models::Agent>(
        "SELECT * FROM agents WHERE id = $1 AND is_active = true",
    )
    .bind(request.agent_id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let provider_row = sqlx::query_as::<_, crate::models::LlmProvider>(
        "SELECT * FROM llm_providers WHERE id = $1 AND is_enabled = true",
    )
    .bind(agent.llm_provider_id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    // 2. Create ad-hoc workflow_run
    let workflow_run = sqlx::query_as::<_, crate::models::WorkflowRun>(
        r#"
        INSERT INTO workflow_runs (workflow_id, status, started_at)
        VALUES ($1, 'running', $2)
        RETURNING *
        "#,
    )
    .bind(agent.workflow_id)
    .bind(Utc::now())
    .fetch_one(&pool)
    .await?;

    event_bus.publish(ExecutionEvent::WorkflowRunStarted {
        workflow_run_id: workflow_run.id,
        workflow_id: agent.workflow_id,
    });

    // 3. Create agent_execution record (status: running)
    let execution = sqlx::query_as::<_, AgentExecution>(
        r#"
        INSERT INTO agent_executions (agent_id, workflow_run_id, status, input_text, started_at)
        VALUES ($1, $2, 'running', $3, $4)
        RETURNING *
        "#,
    )
    .bind(agent.id)
    .bind(workflow_run.id)
    .bind(&request.input)
    .bind(Utc::now())
    .fetch_one(&pool)
    .await?;

    event_bus.publish(ExecutionEvent::AgentExecutionStarted {
        execution_id: execution.id,
        agent_id: agent.id,
    });

    // 4. Build messages from system_prompt + user input
    let mut messages = Vec::new();
    let system = agent.system_prompt.clone();

    messages.push(LlmMessage {
        role: ROLE_USER.to_string(),
        content: MessageContent::Text(request.input.clone()),
    });

    let llm_request = LlmRequest {
        model: agent.model.clone(),
        messages,
        system,
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
        tools: None,
    };

    // 5. Call LLM
    let llm_provider = registry.get(&provider_row.name).ok_or_else(|| {
        AppError::LlmError(format!("Provider '{}' not registered", provider_row.name))
    })?;

    let start_time = std::time::Instant::now();
    let llm_result = llm_provider.complete(&llm_request).await;
    let duration_ms = start_time.elapsed().as_millis() as i64;

    match llm_result {
        Ok(llm_response) => {
            // 6. Save messages to DB
            let mut seq = 0;
            if let Some(ref sys) = agent.system_prompt {
                save_message(&pool, execution.id, "system", sys, seq).await?;
                seq += 1;
            }
            save_message(&pool, execution.id, "user", &request.input, seq).await?;
            seq += 1;
            save_message(&pool, execution.id, "assistant", &llm_response.content, seq).await?;

            // 7. Update execution as completed
            let token_usage =
                serde_json::to_value(&llm_response.token_usage).unwrap_or(serde_json::Value::Null);

            let updated_execution = sqlx::query_as::<_, AgentExecution>(
                r#"
                UPDATE agent_executions
                SET status = 'completed', output_text = $1, token_usage = $2, duration_ms = $3, completed_at = $4
                WHERE id = $5
                RETURNING *
                "#,
            )
            .bind(&llm_response.content)
            .bind(&token_usage)
            .bind(duration_ms)
            .bind(Utc::now())
            .bind(execution.id)
            .fetch_one(&pool)
            .await?;

            // Update workflow_run as completed
            sqlx::query(
                "UPDATE workflow_runs SET status = 'completed', completed_at = $1 WHERE id = $2",
            )
            .bind(Utc::now())
            .bind(workflow_run.id)
            .execute(&pool)
            .await?;

            event_bus.publish(ExecutionEvent::AgentExecutionCompleted {
                execution_id: execution.id,
                agent_id: agent.id,
                output: llm_response.content,
                duration_ms,
            });

            event_bus.publish(ExecutionEvent::WorkflowRunCompleted {
                workflow_run_id: workflow_run.id,
                workflow_id: agent.workflow_id,
                status: STATUS_COMPLETED.to_string(),
            });

            Ok(updated_execution)
        }
        Err(err) => {
            // 7. Record failure
            let error_msg = err.to_string();

            let updated_execution = sqlx::query_as::<_, AgentExecution>(
                r#"
                UPDATE agent_executions
                SET status = 'failed', error_message = $1, duration_ms = $2, completed_at = $3
                WHERE id = $4
                RETURNING *
                "#,
            )
            .bind(&error_msg)
            .bind(duration_ms)
            .bind(Utc::now())
            .bind(execution.id)
            .fetch_one(&pool)
            .await?;

            // Update workflow_run as failed
            sqlx::query(
                "UPDATE workflow_runs SET status = 'failed', error_message = $1, completed_at = $2 WHERE id = $3",
            )
            .bind(&error_msg)
            .bind(Utc::now())
            .bind(workflow_run.id)
            .execute(&pool)
            .await?;

            event_bus.publish(ExecutionEvent::AgentExecutionFailed {
                execution_id: execution.id,
                agent_id: agent.id,
                error: error_msg,
            });

            event_bus.publish(ExecutionEvent::WorkflowRunCompleted {
                workflow_run_id: workflow_run.id,
                workflow_id: agent.workflow_id,
                status: STATUS_FAILED.to_string(),
            });

            Ok(updated_execution)
        }
    }
}

async fn save_message(
    pool: &sqlx::PgPool,
    execution_id: Uuid,
    role: &str,
    content: &str,
    sequence_order: i32,
) -> Result<AgentMessage, AppError> {
    let msg = sqlx::query_as::<_, AgentMessage>(
        r#"
        INSERT INTO agent_messages (execution_id, role, content, sequence_order)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#,
    )
    .bind(execution_id)
    .bind(role)
    .bind(content)
    .bind(sequence_order)
    .fetch_one(pool)
    .await?;

    Ok(msg)
}

pub async fn get_execution(db: &DbPool, id: Uuid) -> Result<AgentExecution, AppError> {
    let pool = db.get()?;
    let execution =
        sqlx::query_as::<_, AgentExecution>("SELECT * FROM agent_executions WHERE id = $1")
            .bind(id)
            .fetch_optional(&pool)
            .await?
            .ok_or(AppError::NotFound)?;

    Ok(execution)
}

pub async fn get_execution_messages(
    db: &DbPool,
    execution_id: Uuid,
) -> Result<Vec<AgentMessage>, AppError> {
    let pool = db.get()?;
    let messages = sqlx::query_as::<_, AgentMessage>(
        "SELECT * FROM agent_messages WHERE execution_id = $1 ORDER BY sequence_order ASC",
    )
    .bind(execution_id)
    .fetch_all(&pool)
    .await?;

    Ok(messages)
}
