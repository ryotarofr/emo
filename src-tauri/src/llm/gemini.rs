use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::types::{ContentBlock, LlmRequest, LlmResponse, MessageContent, TokenUsage};
use super::LlmProviderTrait;

pub struct GeminiProvider {
    api_key: String,
    client: reqwest::Client,
}

impl GeminiProvider {
    pub fn from_env() -> Result<Self, AppError> {
        let api_key = std::env::var("GOOGLE_AI_STUDIO_API_KEY").map_err(|_| {
            AppError::LlmError(
                "GOOGLE_AI_STUDIO_API_KEY environment variable not set".to_string(),
            )
        })?;
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| AppError::LlmError(format!("Failed to build HTTP client: {e}")))?;
        Ok(Self { api_key, client })
    }
}

// --- Gemini API request types ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiSystemInstruction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GeminiToolDeclaration>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiSystemInstruction {
    parts: Vec<GeminiTextPart>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiTextPart {
    text: String,
}

/// Gemini API の parts は text / functionCall / functionResponse のいずれか
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum GeminiPart {
    FunctionCall {
        #[serde(rename = "functionCall")]
        function_call: GeminiFunctionCall,
    },
    FunctionResponse {
        #[serde(rename = "functionResponse")]
        function_response: GeminiFunctionResponse,
    },
    Text {
        text: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiFunctionCall {
    name: String,
    args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiFunctionResponse {
    name: String,
    response: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    temperature: f64,
    max_output_tokens: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiToolDeclaration {
    function_declarations: Vec<GeminiFunctionDeclaration>,
}

#[derive(Debug, Serialize)]
struct GeminiFunctionDeclaration {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

// --- Gemini API response types ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    usage_metadata: Option<GeminiUsageMetadata>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiCandidate {
    content: Option<GeminiContent>,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiUsageMetadata {
    prompt_token_count: Option<u32>,
    candidates_token_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct GeminiErrorResponse {
    error: GeminiErrorDetail,
}

#[derive(Debug, Deserialize)]
struct GeminiErrorDetail {
    message: String,
}

// --- Conversion helpers ---

/// 内部の ContentBlock を GeminiPart に変換
fn content_block_to_gemini(block: &ContentBlock) -> GeminiPart {
    match block {
        ContentBlock::Text { text } => GeminiPart::Text { text: text.clone() },
        ContentBlock::ToolUse { name, input, .. } => GeminiPart::FunctionCall {
            function_call: GeminiFunctionCall {
                name: name.clone(),
                args: input.clone(),
            },
        },
        ContentBlock::ToolResult {
            tool_use_id,
            content,
            ..
        } => GeminiPart::FunctionResponse {
            function_response: GeminiFunctionResponse {
                name: tool_use_id.clone(),
                response: serde_json::json!({ "result": content }),
            },
        },
    }
}

/// Gemini の finishReason を内部の stop_reason に変換
fn map_finish_reason(reason: &str) -> String {
    match reason {
        "STOP" => "end_turn".to_string(),
        "MAX_TOKENS" => "max_tokens".to_string(),
        other => other.to_lowercase(),
    }
}

#[async_trait]
impl LlmProviderTrait for GeminiProvider {
    fn name(&self) -> &str {
        "google"
    }

    async fn complete(&self, request: &LlmRequest) -> Result<LlmResponse, AppError> {
        // 1. メッセージを Gemini 形式に変換
        let contents: Vec<GeminiContent> = request
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| {
                let role = if m.role == "assistant" {
                    "model".to_string()
                } else {
                    m.role.clone()
                };
                let parts = match &m.content {
                    MessageContent::Text(s) => vec![GeminiPart::Text { text: s.clone() }],
                    MessageContent::Blocks(blocks) => {
                        blocks.iter().map(content_block_to_gemini).collect()
                    }
                };
                GeminiContent { role, parts }
            })
            .collect();

        // 2. システムプロンプト
        let system_instruction = request.system.as_ref().map(|s| GeminiSystemInstruction {
            parts: vec![GeminiTextPart { text: s.clone() }],
        });

        // 3. ツール定義
        let tools = request.tools.as_ref().map(|tool_defs| {
            vec![GeminiToolDeclaration {
                function_declarations: tool_defs
                    .iter()
                    .map(|t| GeminiFunctionDeclaration {
                        name: t.name.clone(),
                        description: t.description.clone(),
                        parameters: t.input_schema.clone(),
                    })
                    .collect(),
            }]
        });

        // 4. リクエスト構築
        let api_request = GeminiRequest {
            contents,
            system_instruction,
            generation_config: Some(GeminiGenerationConfig {
                temperature: request.temperature,
                max_output_tokens: request.max_tokens,
            }),
            tools,
        };

        // 5. API 呼び出し
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            request.model
        );

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("content-type", "application/json")
            .json(&api_request)
            .send()
            .await
            .map_err(|e| AppError::LlmError(format!("Request failed: {e}")))?;

        // 6. エラーハンドリング
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            if let Ok(err) = serde_json::from_str::<GeminiErrorResponse>(&body) {
                return Err(AppError::LlmError(format!(
                    "Gemini API error ({}): {}",
                    status, err.error.message
                )));
            }
            return Err(AppError::LlmError(format!(
                "Gemini API error ({}): {}",
                status, body
            )));
        }

        // 7. レスポンス解析
        let api_response: GeminiResponse = response
            .json()
            .await
            .map_err(|e| AppError::LlmError(format!("Failed to parse response: {e}")))?;

        let candidate = api_response
            .candidates
            .as_ref()
            .and_then(|c| c.first())
            .ok_or_else(|| AppError::LlmError("No candidates in response".to_string()))?;

        let parts = candidate
            .content
            .as_ref()
            .map(|c| &c.parts)
            .cloned()
            .unwrap_or_default();

        // 8. ContentBlock に変換
        let mut content_blocks: Vec<ContentBlock> = Vec::new();
        let mut tool_use_counter = 0u32;

        for part in &parts {
            match part {
                GeminiPart::Text { text } => {
                    content_blocks.push(ContentBlock::Text { text: text.clone() });
                }
                GeminiPart::FunctionCall { function_call } => {
                    tool_use_counter += 1;
                    content_blocks.push(ContentBlock::ToolUse {
                        id: format!("toolu_{:08x}", tool_use_counter),
                        name: function_call.name.clone(),
                        input: function_call.args.clone(),
                    });
                }
                GeminiPart::FunctionResponse { .. } => {
                    // レスポンスに functionResponse が含まれることは通常ない
                }
            }
        }

        // 9. テキスト内容を結合
        let content = parts
            .iter()
            .filter_map(|p| match p {
                GeminiPart::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("");

        // 10. stop_reason を変換
        let stop_reason = candidate
            .finish_reason
            .as_deref()
            .map(map_finish_reason);

        // tool_use がある場合は stop_reason を "tool_use" に設定
        let stop_reason = if content_blocks
            .iter()
            .any(|b| matches!(b, ContentBlock::ToolUse { .. }))
        {
            Some("tool_use".to_string())
        } else {
            stop_reason
        };

        // 11. トークン使用量
        let token_usage = TokenUsage {
            input_tokens: api_response
                .usage_metadata
                .as_ref()
                .and_then(|u| u.prompt_token_count)
                .unwrap_or(0),
            output_tokens: api_response
                .usage_metadata
                .as_ref()
                .and_then(|u| u.candidates_token_count)
                .unwrap_or(0),
        };

        Ok(LlmResponse {
            content,
            model: request.model.clone(),
            token_usage,
            content_blocks,
            stop_reason,
        })
    }

    async fn health_check(&self) -> Result<(), AppError> {
        if self.api_key.is_empty() {
            return Err(AppError::LlmError(
                "Google AI Studio API key is empty".to_string(),
            ));
        }
        Ok(())
    }
}
