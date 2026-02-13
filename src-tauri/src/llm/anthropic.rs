use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::types::{ContentBlock, LlmRequest, LlmResponse, TokenUsage};
use super::LlmProviderTrait;

pub struct AnthropicProvider {
    api_key: String,
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn from_env() -> Result<Self, AppError> {
        let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
            AppError::LlmError("ANTHROPIC_API_KEY environment variable not set".to_string())
        })?;
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| AppError::LlmError(format!("Failed to build HTTP client: {e}")))?;
        Ok(Self { api_key, client })
    }
}

// Anthropic API request/response types

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    temperature: f64,
    max_tokens: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: AnthropicMessageContent,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum AnthropicMessageContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },
}

#[derive(Debug, Serialize)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicResponseContent>,
    model: String,
    usage: AnthropicUsage,
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicResponseContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct AnthropicError {
    error: AnthropicErrorDetail,
}

#[derive(Debug, Deserialize)]
struct AnthropicErrorDetail {
    message: String,
}

fn content_block_to_anthropic(block: &ContentBlock) -> AnthropicContentBlock {
    match block {
        ContentBlock::Text { text } => AnthropicContentBlock::Text { text: text.clone() },
        ContentBlock::ToolUse { id, name, input } => AnthropicContentBlock::ToolUse {
            id: id.clone(),
            name: name.clone(),
            input: input.clone(),
        },
        ContentBlock::ToolResult {
            tool_use_id,
            content,
            is_error,
        } => AnthropicContentBlock::ToolResult {
            tool_use_id: tool_use_id.clone(),
            content: content.clone(),
            is_error: if *is_error { Some(true) } else { None },
        },
    }
}

#[async_trait]
impl LlmProviderTrait for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }

    async fn complete(&self, request: &LlmRequest) -> Result<LlmResponse, AppError> {
        let messages: Vec<AnthropicMessage> = request
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| {
                let content = match &m.content {
                    super::types::MessageContent::Text(s) => {
                        AnthropicMessageContent::Text(s.clone())
                    }
                    super::types::MessageContent::Blocks(blocks) => {
                        AnthropicMessageContent::Blocks(
                            blocks.iter().map(content_block_to_anthropic).collect(),
                        )
                    }
                };
                AnthropicMessage {
                    role: m.role.clone(),
                    content,
                }
            })
            .collect();

        let tools = request.tools.as_ref().map(|tool_defs| {
            tool_defs
                .iter()
                .map(|t| AnthropicTool {
                    name: t.name.clone(),
                    description: t.description.clone(),
                    input_schema: t.input_schema.clone(),
                })
                .collect()
        });

        let api_request = AnthropicRequest {
            model: request.model.clone(),
            messages,
            system: request.system.clone(),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            tools,
        };

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&api_request)
            .send()
            .await
            .map_err(|e| AppError::LlmError(format!("Request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            if let Ok(err) = serde_json::from_str::<AnthropicError>(&body) {
                return Err(AppError::LlmError(format!(
                    "Anthropic API error ({}): {}",
                    status, err.error.message
                )));
            }
            return Err(AppError::LlmError(format!(
                "Anthropic API error ({}): {}",
                status, body
            )));
        }

        let api_response: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| AppError::LlmError(format!("Failed to parse response: {e}")))?;

        // Convert response content to ContentBlocks
        let content_blocks: Vec<ContentBlock> = api_response
            .content
            .iter()
            .map(|c| match c {
                AnthropicResponseContent::Text { text } => {
                    ContentBlock::Text { text: text.clone() }
                }
                AnthropicResponseContent::ToolUse { id, name, input } => ContentBlock::ToolUse {
                    id: id.clone(),
                    name: name.clone(),
                    input: input.clone(),
                },
            })
            .collect();

        // Build backward-compatible text content
        let content = api_response
            .content
            .iter()
            .filter_map(|c| match c {
                AnthropicResponseContent::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("");

        Ok(LlmResponse {
            content,
            model: api_response.model,
            token_usage: TokenUsage {
                input_tokens: api_response.usage.input_tokens,
                output_tokens: api_response.usage.output_tokens,
            },
            content_blocks,
            stop_reason: api_response.stop_reason,
        })
    }

    async fn health_check(&self) -> Result<(), AppError> {
        if self.api_key.is_empty() {
            return Err(AppError::LlmError("Anthropic API key is empty".to_string()));
        }
        Ok(())
    }
}
