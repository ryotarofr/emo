use chrono::Utc;

use crate::constants::*;
use crate::event_bus::ExecutionEvent;
use crate::llm::types::{ContentBlock, LlmMessage, LlmRequest, MessageContent};

use super::context::OrchestrationContext;
use super::finalize::finalize_orchestration;
use super::tools::{orchestrator_tools, process_tool_calls};

/// 暴走API呼び出しを防ぐためのツールループ最大反復回数
const MAX_TOOL_LOOP_ITERATIONS: u32 = 20;

/// オーケストレーターのツールループを実行する
pub(super) async fn run_tool_loop(ctx: &OrchestrationContext, mut messages: Vec<LlmMessage>) {
    let tools = orchestrator_tools(ctx);

    let llm_provider = match ctx.registry.get(&ctx.provider_name) {
        Some(p) => p,
        None => {
            let error = format!("Provider '{}' not registered", ctx.provider_name);
            finalize_orchestration(
                &ctx.db,
                ctx.orchestration_run_id,
                ctx.execution_id,
                STATUS_FAILED,
                None,
                Some(&error),
            )
            .await;
            ctx.event_bus.publish(ExecutionEvent::OrchestratorFailed {
                orchestration_run_id: ctx.orchestration_run_id,
                orchestrator_agent_id: ctx.orchestrator_agent_id,
                error,
            });
            return;
        }
    };

    let mut iteration: u32 = 0;

    loop {
        iteration += 1;
        if iteration > MAX_TOOL_LOOP_ITERATIONS {
            let error = format!(
                "Tool loop exceeded maximum iterations ({MAX_TOOL_LOOP_ITERATIONS}). Stopping to prevent runaway execution."
            );
            finalize_orchestration(
                &ctx.db,
                ctx.orchestration_run_id,
                ctx.execution_id,
                STATUS_FAILED,
                None,
                Some(&error),
            )
            .await;
            ctx.event_bus.publish(ExecutionEvent::OrchestratorFailed {
                orchestration_run_id: ctx.orchestration_run_id,
                orchestrator_agent_id: ctx.orchestrator_agent_id,
                error,
            });
            return;
        }

        let llm_request = LlmRequest {
            model: ctx.model.clone(),
            messages: messages.clone(),
            system: ctx.system_prompt.clone(),
            temperature: ctx.temperature,
            max_tokens: ctx.max_tokens,
            tools: Some(tools.clone()),
        };

        let llm_response = match llm_provider.complete(&llm_request).await {
            Ok(r) => r,
            Err(e) => {
                let error = e.to_string();
                finalize_orchestration(
                    &ctx.db,
                    ctx.orchestration_run_id,
                    ctx.execution_id,
                    STATUS_FAILED,
                    None,
                    Some(&error),
                )
                .await;
                ctx.event_bus.publish(ExecutionEvent::OrchestratorFailed {
                    orchestration_run_id: ctx.orchestration_run_id,
                    orchestrator_agent_id: ctx.orchestrator_agent_id,
                    error,
                });
                return;
            }
        };

        let stop_reason = llm_response.stop_reason.as_deref().unwrap_or(STOP_END_TURN);

        if stop_reason == STOP_END_TURN || stop_reason == STOP_STOP {
            let output = llm_response.content.clone();
            finalize_orchestration(
                &ctx.db,
                ctx.orchestration_run_id,
                ctx.execution_id,
                STATUS_COMPLETED,
                Some(&output),
                None,
            )
            .await;
            ctx.event_bus.publish(ExecutionEvent::OrchestratorCompleted {
                orchestration_run_id: ctx.orchestration_run_id,
                orchestrator_agent_id: ctx.orchestrator_agent_id,
                output,
            });
            return;
        }

        if stop_reason == STOP_TOOL_USE {
            // tool_useブロック付きのアシスタントメッセージを追加
            messages.push(LlmMessage {
                role: ROLE_ASSISTANT.to_string(),
                content: MessageContent::Blocks(llm_response.content_blocks.clone()),
            });

            // tool_useブロックを抽出
            let tool_uses: Vec<ContentBlock> = llm_response
                .content_blocks
                .iter()
                .filter(|b| matches!(b, ContentBlock::ToolUse { .. }))
                .cloned()
                .collect();

            // ツールを実行
            let tool_results = process_tool_calls(tool_uses, ctx).await;

            // ツール結果をユーザーメッセージとして追加
            messages.push(LlmMessage {
                role: ROLE_USER.to_string(),
                content: MessageContent::Blocks(tool_results),
            });

            continue;
        }

        // 不明な停止理由 - 完了として処理
        let output = llm_response.content.clone();
        finalize_orchestration(
            &ctx.db,
            ctx.orchestration_run_id,
            ctx.execution_id,
            STATUS_COMPLETED,
            Some(&output),
            None,
        )
        .await;
        ctx.event_bus.publish(ExecutionEvent::OrchestratorCompleted {
            orchestration_run_id: ctx.orchestration_run_id,
            orchestrator_agent_id: ctx.orchestrator_agent_id,
            output,
        });
        return;
    }
}

/// 承認モードでオーケストレーターのツールループを実行する。
/// 最初のLLM呼び出しでプラン（tool_uses）を返し、ユーザー承認まで一時停止する。
pub(super) async fn run_tool_loop_approval(
    ctx: &OrchestrationContext,
    mut messages: Vec<LlmMessage>,
) {
    let tools = orchestrator_tools(ctx);

    let llm_provider = match ctx.registry.get(&ctx.provider_name) {
        Some(p) => p,
        None => {
            let error = format!("Provider '{}' not registered", ctx.provider_name);
            finalize_orchestration(
                &ctx.db,
                ctx.orchestration_run_id,
                ctx.execution_id,
                STATUS_FAILED,
                None,
                Some(&error),
            )
            .await;
            ctx.event_bus.publish(ExecutionEvent::OrchestratorFailed {
                orchestration_run_id: ctx.orchestration_run_id,
                orchestrator_agent_id: ctx.orchestrator_agent_id,
                error,
            });
            return;
        }
    };

    // 最初のLLM呼び出し
    let llm_request = LlmRequest {
        model: ctx.model.clone(),
        messages: messages.clone(),
        system: ctx.system_prompt.clone(),
        temperature: ctx.temperature,
        max_tokens: ctx.max_tokens,
        tools: Some(tools.clone()),
    };

    let llm_response = match llm_provider.complete(&llm_request).await {
        Ok(r) => r,
        Err(e) => {
            let error = e.to_string();
            finalize_orchestration(
                &ctx.db,
                ctx.orchestration_run_id,
                ctx.execution_id,
                STATUS_FAILED,
                None,
                Some(&error),
            )
            .await;
            ctx.event_bus.publish(ExecutionEvent::OrchestratorFailed {
                orchestration_run_id: ctx.orchestration_run_id,
                orchestrator_agent_id: ctx.orchestrator_agent_id,
                error,
            });
            return;
        }
    };

    let stop_reason = llm_response.stop_reason.as_deref().unwrap_or(STOP_END_TURN);

    if stop_reason == STOP_END_TURN || stop_reason == STOP_STOP {
        let output = llm_response.content.clone();
        finalize_orchestration(
            &ctx.db,
            ctx.orchestration_run_id,
            ctx.execution_id,
            STATUS_COMPLETED,
            Some(&output),
            None,
        )
        .await;
        ctx.event_bus.publish(ExecutionEvent::OrchestratorCompleted {
            orchestration_run_id: ctx.orchestration_run_id,
            orchestrator_agent_id: ctx.orchestrator_agent_id,
            output,
        });
        return;
    }

    if stop_reason == STOP_TOOL_USE {
        // アシスタントメッセージを追加
        messages.push(LlmMessage {
            role: ROLE_ASSISTANT.to_string(),
            content: MessageContent::Blocks(llm_response.content_blocks.clone()),
        });

        // tool_usesからプランを構築
        let tool_uses: Vec<serde_json::Value> = llm_response
            .content_blocks
            .iter()
            .filter_map(|b| match b {
                ContentBlock::ToolUse { id, name, input } => Some(serde_json::json!({
                    "tool_use_id": id,
                    "name": name,
                    "input": input
                })),
                _ => None,
            })
            .collect();

        let plan = serde_json::json!({
            "steps": tool_uses,
            "text": llm_response.content
        });

        // 会話状態とプランを保存
        let messages_json = serde_json::to_value(&messages).ok();
        let pool = match ctx.db.get() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[orchestration] Failed to get DB pool for plan save: {e}");
                return;
            }
        };
        if let Err(e) = sqlx::query(
            r#"
            UPDATE orchestration_runs
            SET status = 'awaiting_approval', plan_json = $1, messages_json = $2, updated_at = $3
            WHERE id = $4
            "#,
        )
        .bind(&plan)
        .bind(&messages_json)
        .bind(Utc::now())
        .bind(ctx.orchestration_run_id)
        .execute(&pool)
        .await
        {
            eprintln!(
                "[orchestration] Failed to save plan for {}: {e}",
                ctx.orchestration_run_id
            );
        }

        ctx.event_bus
            .publish(ExecutionEvent::OrchestratorPlanProposed {
                orchestration_run_id: ctx.orchestration_run_id,
                orchestrator_agent_id: ctx.orchestrator_agent_id,
                plan,
            });
        // ここで一時停止 - approve_orchestration()で再開される
    }
}
