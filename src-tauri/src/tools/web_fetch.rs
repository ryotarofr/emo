use async_trait::async_trait;

use crate::llm::types::ToolDefinition;

use super::types::{ToolContext, ToolResult};
use super::{Tool, ToolCategory};

pub struct WebFetchTool {
    client: reqwest::Client,
}

impl WebFetchTool {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("tebiki/0.1.0")
            .build()
            .expect("Failed to build HTTP client for WebFetchTool");
        Self { client }
    }
}

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str {
        "web_fetch"
    }
    fn category(&self) -> ToolCategory {
        ToolCategory::ReadOnly
    }

    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_fetch".to_string(),
            description: "Fetch content from a web URL. Returns the page text content (HTML tags stripped). Use this to read documentation, articles, or any public web page.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch (must start with http:// or https://)"
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum characters to return (default: 50000, max: 100000)"
                    }
                },
                "required": ["url"]
            }),
        }
    }

    async fn execute(&self, input: &serde_json::Value, ctx: &ToolContext) -> ToolResult {
        let url = match input["url"].as_str() {
            Some(u) => u,
            None => return ToolResult::error("Missing 'url' parameter".into()),
        };

        if !url.starts_with("http://") && !url.starts_with("https://") {
            return ToolResult::error("URL must start with http:// or https://".into());
        }

        let max_length = input["max_length"]
            .as_u64()
            .unwrap_or(50_000)
            .min(100_000) as usize;

        let response = match self
            .client
            .get(url)
            .timeout(std::time::Duration::from_secs(ctx.http_timeout_secs))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return ToolResult::error(format!("HTTP request failed: {e}")),
        };

        let status = response.status();
        if !status.is_success() {
            return ToolResult::error(format!("HTTP {status} for {url}"));
        }

        let body = match response.text().await {
            Ok(t) => t,
            Err(e) => return ToolResult::error(format!("Failed to read response body: {e}")),
        };

        let text = strip_html_tags(&body);

        let truncated = if text.len() > max_length {
            format!(
                "{}...\n\n[Truncated: {} total chars]",
                &text[..max_length],
                text.len()
            )
        } else {
            text
        };

        ToolResult::ok(
            serde_json::json!({
                "url": url,
                "status": status.as_u16(),
                "content": truncated,
                "content_length": truncated.len()
            })
            .to_string(),
        )
    }
}

/// 簡易HTMLタグ除去（<script>, <style>ブロックも除去）
fn strip_html_tags(html: &str) -> String {
    // Phase 1: <script>と<style>ブロックを除去
    // TODO: O(n²) — regex または html パーサクレートで最適化
    let mut result = html.to_string();
    for tag in &["script", "style"] {
        while let Some(start) = result.to_lowercase().find(&format!("<{tag}")) {
            if let Some(end) = result.to_lowercase()[start..].find(&format!("</{tag}>")) {
                let end_pos = start + end + format!("</{tag}>").len();
                result = format!("{}{}", &result[..start], &result[end_pos..]);
            } else {
                break;
            }
        }
    }

    // Phase 2: 残りのHTMLタグを除去
    let mut output = String::with_capacity(result.len());
    let mut in_tag = false;
    for ch in result.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }

    // Phase 3: 連続空白行を圧縮
    let lines: Vec<&str> = output.lines().collect();
    let mut compressed = Vec::new();
    let mut blank_count = 0;
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            blank_count += 1;
            if blank_count <= 1 {
                compressed.push("");
            }
        } else {
            blank_count = 0;
            compressed.push(trimmed);
        }
    }
    compressed.join("\n")
}
