use uuid::Uuid;

use crate::constants::*;
use crate::event_bus::ExecutionEvent;
use crate::llm::types::{ContentBlock, ToolDefinition};
use crate::services::execution_service;

use super::context::OrchestrationContext;

/// オーケストレーターLLM用のツール定義
pub(super) fn orchestrator_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: TOOL_CREATE_SUB_AGENT.to_string(),
            description: "Create a new sub-agent to handle a specific subtask. The sub-agent will be created with its own panel on the dashboard.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "A short descriptive name for the sub-agent (e.g. 'Researcher', 'Code Generator')"
                    },
                    "description": {
                        "type": "string",
                        "description": "Description of what this sub-agent should do"
                    },
                    "system_prompt": {
                        "type": "string",
                        "description": "System prompt for the sub-agent that defines its role and behavior"
                    }
                },
                "required": ["name", "description", "system_prompt"]
            }),
        },
        ToolDefinition {
            name: TOOL_EXECUTE_SUB_AGENT.to_string(),
            description: "Execute a sub-agent with a specific input prompt. The agent must have been created first with create_sub_agent.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "The UUID of the sub-agent to execute"
                    },
                    "input": {
                        "type": "string",
                        "description": "The input prompt to send to the sub-agent"
                    }
                },
                "required": ["agent_id", "input"]
            }),
        },
        ToolDefinition {
            name: TOOL_GET_SUB_AGENT_RESULT.to_string(),
            description: "Get the execution result of a sub-agent. Use this after executing a sub-agent to retrieve its output.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "execution_id": {
                        "type": "string",
                        "description": "The UUID of the agent execution to get results from"
                    }
                },
                "required": ["execution_id"]
            }),
        },
    ]
}

/// 単一のツール呼び出しを処理し、結果コンテンツを返す
pub(super) async fn handle_tool_call(
    tool_name: &str,
    tool_input: &serde_json::Value,
    ctx: &OrchestrationContext,
) -> (String, bool) {
    match tool_name {
        TOOL_CREATE_SUB_AGENT => {
            let name = tool_input["name"].as_str().unwrap_or("Sub Agent");
            let description = tool_input["description"].as_str().unwrap_or("");
            let system_prompt = tool_input["system_prompt"].as_str();

            let pool = match ctx.db.get() {
                Ok(p) => p,
                Err(e) => return (format!("Database error: {e}"), true),
            };

            let agent = match sqlx::query_as::<_, crate::models::Agent>(
                r#"
                INSERT INTO agents (workflow_id, llm_provider_id, name, description, system_prompt, model, temperature, max_tokens)
                VALUES ($1, $2, $3, $4, $5, $6, 0.7, 2048)
                RETURNING *
                "#,
            )
            .bind(ctx.workflow_id)
            .bind(ctx.llm_provider_id)
            .bind(name)
            .bind(Some(description))
            .bind(system_prompt)
            .bind(&ctx.model)
            .fetch_one(&pool)
            .await
            {
                Ok(a) => a,
                Err(e) => return (format!("Failed to create sub-agent: {e}"), true),
            };

            ctx.event_bus.publish(ExecutionEvent::SubAgentCreated {
                agent_id: agent.id,
                orchestrator_agent_id: ctx.orchestrator_agent_id,
                name: name.to_string(),
                description: description.to_string(),
                workflow_id: ctx.workflow_id,
            });

            (
                serde_json::json!({
                    "agent_id": agent.id.to_string(),
                    "name": name,
                    "status": "created"
                })
                .to_string(),
                false,
            )
        }
        TOOL_EXECUTE_SUB_AGENT => {
            let agent_id_str = tool_input["agent_id"].as_str().unwrap_or("");
            let input = tool_input["input"].as_str().unwrap_or("");

            let agent_id = match Uuid::parse_str(agent_id_str) {
                Ok(id) => id,
                Err(_) => return (format!("Invalid agent_id: {agent_id_str}"), true),
            };

            let request = crate::models::ExecuteAgentRequest {
                agent_id,
                input: input.to_string(),
            };

            match execution_service::execute_agent(&ctx.db, &ctx.registry, &ctx.event_bus, &request)
                .await
            {
                Ok(execution) => (
                    serde_json::json!({
                        "execution_id": execution.id.to_string(),
                        "status": execution.status,
                        "output": execution.output_text.unwrap_or_default()
                    })
                    .to_string(),
                    false,
                ),
                Err(e) => (format!("Execution failed: {e}"), true),
            }
        }
        TOOL_GET_SUB_AGENT_RESULT => {
            let execution_id_str = tool_input["execution_id"].as_str().unwrap_or("");

            let execution_id = match Uuid::parse_str(execution_id_str) {
                Ok(id) => id,
                Err(_) => return (format!("Invalid execution_id: {execution_id_str}"), true),
            };

            match execution_service::get_execution(&ctx.db, execution_id).await {
                Ok(execution) => (
                    serde_json::json!({
                        "execution_id": execution.id.to_string(),
                        "agent_id": execution.agent_id.to_string(),
                        "status": execution.status,
                        "output": execution.output_text.unwrap_or_default(),
                        "error": execution.error_message,
                        "duration_ms": execution.duration_ms
                    })
                    .to_string(),
                    false,
                ),
                Err(e) => (format!("Failed to get result: {e}"), true),
            }
        }
        _ => (format!("Unknown tool: {tool_name}"), true),
    }
}

/// LLMレスポンスからのツール呼び出しを処理する
pub(super) async fn process_tool_calls(
    tool_uses: Vec<ContentBlock>,
    ctx: &OrchestrationContext,
) -> Vec<ContentBlock> {
    let mut results = Vec::new();

    for tool_use in &tool_uses {
        if let ContentBlock::ToolUse { id, name, input } = tool_use {
            let (content, is_error) = handle_tool_call(name, input, ctx).await;
            results.push(ContentBlock::ToolResult {
                tool_use_id: id.clone(),
                content,
                is_error,
            });
        }
    }

    results
}
