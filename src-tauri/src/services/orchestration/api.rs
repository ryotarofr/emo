use std::sync::Arc;

use chrono::Utc;
use uuid::Uuid;

use crate::constants::*;
use crate::db::DbPool;
use crate::error::AppError;
use crate::event_bus::{EventBus, ExecutionEvent};
use crate::llm::types::{ContentBlock, LlmMessage, MessageContent};
use crate::llm::LlmRegistry;
use crate::models::{AgentExecution, OrchestrateRequest, OrchestrationRun};

use super::context::OrchestrationContext;
use super::finalize::finalize_orchestration;
use super::tool_loop::{run_tool_loop, run_tool_loop_approval};
use super::tools::process_tool_calls;

/// 許容される入力テキストの最大長（100KB）
const MAX_INPUT_LENGTH: usize = 100_000;

/// エージェントのsystem_promptからオーケストレーターのシステムプロンプトを構築
fn build_orchestrator_system(agent_system_prompt: Option<&str>) -> String {
    format!(
        "{}\n\nYou are an orchestrator agent. When given a complex task, break it down into subtasks and use the provided tools to create sub-agents, execute them, and collect their results. Then synthesize a final answer.\n\nAvailable tools:\n- create_sub_agent: Create a new sub-agent for a specific subtask\n- execute_sub_agent: Execute a created sub-agent with an input prompt\n- get_sub_agent_result: Get the result of a completed execution",
        agent_system_prompt.unwrap_or("")
    )
}

/// モードが有効な値であることを検証
fn validate_mode(mode: &str) -> Result<(), AppError> {
    match mode {
        MODE_AUTOMATIC | MODE_APPROVAL => Ok(()),
        _ => Err(AppError::InvalidInput(format!(
            "Invalid orchestration mode '{mode}'. Must be '{MODE_AUTOMATIC}' or '{MODE_APPROVAL}'."
        ))),
    }
}

/// メインエントリーポイント: オーケストレーション実行を作成しツールループを開始
pub async fn orchestrate_agent(
    db: &DbPool,
    registry: &Arc<LlmRegistry>,
    event_bus: &EventBus,
    request: &OrchestrateRequest,
) -> Result<OrchestrationRun, AppError> {
    // Validate input before any DB work
    validate_mode(&request.mode)?;

    if request.input.len() > MAX_INPUT_LENGTH {
        return Err(AppError::InvalidInput(format!(
            "Input text too long ({} bytes). Maximum is {} bytes.",
            request.input.len(),
            MAX_INPUT_LENGTH
        )));
    }

    let pool = db.get()?;

    // 1. エージェントとプロバイダーを読み込み
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

    // 2. トランザクション内でworkflow_run、agent_execution、orchestration_runを作成
    let mut tx = pool.begin().await.map_err(|e| AppError::Database(e))?;

    let workflow_run = sqlx::query_as::<_, crate::models::WorkflowRun>(
        r#"
        INSERT INTO workflow_runs (workflow_id, status, started_at)
        VALUES ($1, 'running', $2)
        RETURNING *
        "#,
    )
    .bind(agent.workflow_id)
    .bind(Utc::now())
    .fetch_one(&mut *tx)
    .await?;

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
    .fetch_one(&mut *tx)
    .await?;

    let orchestration_run = sqlx::query_as::<_, OrchestrationRun>(
        r#"
        INSERT INTO orchestration_runs (orchestrator_agent_id, workflow_run_id, execution_id, mode, status)
        VALUES ($1, $2, $3, $4, 'running')
        RETURNING *
        "#,
    )
    .bind(agent.id)
    .bind(workflow_run.id)
    .bind(execution.id)
    .bind(&request.mode)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await.map_err(|e| AppError::Database(e))?;

    // コミット成功後にイベントを発行
    event_bus.publish(ExecutionEvent::WorkflowRunStarted {
        workflow_run_id: workflow_run.id,
        workflow_id: agent.workflow_id,
    });

    event_bus.publish(ExecutionEvent::AgentExecutionStarted {
        execution_id: execution.id,
        agent_id: agent.id,
    });

    // 5. 初期メッセージとコンテキストを構築
    let orchestrator_system = build_orchestrator_system(agent.system_prompt.as_deref());

    let messages = vec![LlmMessage {
        role: ROLE_USER.to_string(),
        content: MessageContent::Text(request.input.clone()),
    }];

    let ctx = OrchestrationContext {
        db: db.clone(),
        registry: registry.clone(),
        event_bus: event_bus.clone(),
        orchestration_run_id: orchestration_run.id,
        execution_id: execution.id,
        orchestrator_agent_id: agent.id,
        workflow_id: agent.workflow_id,
        llm_provider_id: agent.llm_provider_id,
        provider_name: provider_row.name.clone(),
        model: agent.model.clone(),
        system_prompt: Some(orchestrator_system),
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
    };

    let mode = request.mode.clone();

    // 6. バックグラウンドタスクを起動
    tokio::spawn(async move {
        let result = if mode == MODE_APPROVAL {
            tokio::spawn(async move {
                run_tool_loop_approval(&ctx, messages).await;
            })
            .await
        } else {
            tokio::spawn(async move {
                run_tool_loop(&ctx, messages).await;
            })
            .await
        };

        if let Err(join_err) = result {
            let error = if join_err.is_panic() {
                "Orchestration task panicked unexpectedly".to_string()
            } else {
                format!("Orchestration task failed: {join_err}")
            };
            eprintln!("[orchestration] {error}");
        }
    });

    // 即座にリターン
    Ok(orchestration_run)
}

/// 保留中のオーケストレーションプランを承認し実行を再開
pub async fn approve_orchestration(
    db: &DbPool,
    registry: &Arc<LlmRegistry>,
    event_bus: &EventBus,
    orchestration_run_id: Uuid,
) -> Result<OrchestrationRun, AppError> {
    let pool = db.get()?;

    let orch_run =
        sqlx::query_as::<_, OrchestrationRun>("SELECT * FROM orchestration_runs WHERE id = $1")
            .bind(orchestration_run_id)
            .fetch_optional(&pool)
            .await?
            .ok_or(AppError::NotFound)?;

    if orch_run.status != STATUS_AWAITING_APPROVAL {
        return Err(AppError::InvalidInput(format!(
            "Orchestration run is not awaiting approval (status: {})",
            orch_run.status
        )));
    }

    // 会話状態を復元
    let messages: Vec<LlmMessage> = match &orch_run.messages_json {
        Some(json) => serde_json::from_value(json.clone())
            .map_err(|e| AppError::Internal(format!("Failed to deserialize messages: {e}")))?,
        None => {
            return Err(AppError::Internal(
                "No saved messages to restore".to_string(),
            ))
        }
    };

    // ステータスをrunningに更新
    let updated = sqlx::query_as::<_, OrchestrationRun>(
        r#"
        UPDATE orchestration_runs
        SET status = 'running', updated_at = $1
        WHERE id = $2
        RETURNING *
        "#,
    )
    .bind(Utc::now())
    .bind(orchestration_run_id)
    .fetch_one(&pool)
    .await?;

    event_bus.publish(ExecutionEvent::OrchestratorPlanApproved {
        orchestration_run_id,
        orchestrator_agent_id: orch_run.orchestrator_agent_id,
    });

    // ツールループ用のエージェント設定とプロバイダーを読み込み
    let agent = sqlx::query_as::<_, crate::models::Agent>("SELECT * FROM agents WHERE id = $1")
        .bind(orch_run.orchestrator_agent_id)
        .fetch_one(&pool)
        .await?;

    let provider_row = sqlx::query_as::<_, crate::models::LlmProvider>(
        "SELECT * FROM llm_providers WHERE id = $1",
    )
    .bind(agent.llm_provider_id)
    .fetch_one(&pool)
    .await?;

    let orchestrator_system = build_orchestrator_system(agent.system_prompt.as_deref());

    let ctx = OrchestrationContext {
        db: db.clone(),
        registry: registry.clone(),
        event_bus: event_bus.clone(),
        orchestration_run_id,
        execution_id: orch_run.execution_id,
        orchestrator_agent_id: orch_run.orchestrator_agent_id,
        workflow_id: agent.workflow_id,
        llm_provider_id: agent.llm_provider_id,
        provider_name: provider_row.name.clone(),
        model: agent.model.clone(),
        system_prompt: Some(orchestrator_system),
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
    };

    // 再開: 最後のアシスタントメッセージからtool_useブロックを抽出し、実行後ループを継続
    tokio::spawn(async move {
        // 最後のアシスタントメッセージに実行すべきtool_useブロックが含まれている
        let mut messages = messages;

        // 最後のアシスタントメッセージからtool_usesを検出
        let tool_uses: Vec<ContentBlock> = messages
            .iter()
            .rev()
            .find(|m| m.role == ROLE_ASSISTANT)
            .map(|m| match &m.content {
                MessageContent::Blocks(blocks) => blocks
                    .iter()
                    .filter(|b| matches!(b, ContentBlock::ToolUse { .. }))
                    .cloned()
                    .collect(),
                _ => vec![],
            })
            .unwrap_or_default();

        // 保留中のツール呼び出しを実行
        let tool_results = process_tool_calls(tool_uses, &ctx).await;

        // ツール結果を追加
        messages.push(LlmMessage {
            role: ROLE_USER.to_string(),
            content: MessageContent::Blocks(tool_results),
        });

        // 自動モードでツールループを継続
        run_tool_loop(&ctx, messages).await;
    });

    Ok(updated)
}

/// 保留中のオーケストレーションプランを却下
pub async fn reject_orchestration(
    db: &DbPool,
    event_bus: &EventBus,
    orchestration_run_id: Uuid,
) -> Result<OrchestrationRun, AppError> {
    let pool = db.get()?;

    let orch_run =
        sqlx::query_as::<_, OrchestrationRun>("SELECT * FROM orchestration_runs WHERE id = $1")
            .bind(orchestration_run_id)
            .fetch_optional(&pool)
            .await?
            .ok_or(AppError::NotFound)?;

    if orch_run.status != STATUS_AWAITING_APPROVAL {
        return Err(AppError::InvalidInput(format!(
            "Orchestration run is not awaiting approval (status: {})",
            orch_run.status
        )));
    }

    // orchestration_runとagent_executionの両方を終了処理
    finalize_orchestration(
        db,
        orchestration_run_id,
        orch_run.execution_id,
        STATUS_REJECTED,
        None,
        Some("Plan rejected by user"),
    )
    .await;

    // 更新されたレコードを再読み込み
    let updated =
        sqlx::query_as::<_, OrchestrationRun>("SELECT * FROM orchestration_runs WHERE id = $1")
            .bind(orchestration_run_id)
            .fetch_one(&pool)
            .await?;

    event_bus.publish(ExecutionEvent::OrchestratorPlanRejected {
        orchestration_run_id,
        orchestrator_agent_id: orch_run.orchestrator_agent_id,
    });

    Ok(updated)
}

/// IDからオーケストレーション実行を取得
pub async fn get_orchestration(
    db: &DbPool,
    orchestration_run_id: Uuid,
) -> Result<OrchestrationRun, AppError> {
    let pool = db.get()?;

    let orch_run =
        sqlx::query_as::<_, OrchestrationRun>("SELECT * FROM orchestration_runs WHERE id = $1")
            .bind(orchestration_run_id)
            .fetch_optional(&pool)
            .await?
            .ok_or(AppError::NotFound)?;

    Ok(orch_run)
}
