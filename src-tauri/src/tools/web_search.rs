use async_trait::async_trait;

use crate::llm::types::ToolDefinition;

use super::types::{ToolContext, ToolResult};
use super::{Tool, ToolCategory};

pub struct WebSearchTool {
    client: reqwest::Client,
    api_key: Option<String>,
}

impl WebSearchTool {
    pub fn new() -> Self {
        let api_key = std::env::var("BRAVE_SEARCH_API_KEY").ok();
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("Failed to build HTTP client for WebSearchTool");
        Self { client, api_key }
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }
    fn category(&self) -> ToolCategory {
        ToolCategory::ReadOnly
    }

    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_search".to_string(),
            description: "Search the web for information. Returns a list of search results with titles, URLs, and snippets. Use this to find recent information, documentation, or market research.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (default: 5, max: 20)"
                    }
                },
                "required": ["query"]
            }),
        }
    }

    async fn execute(&self, input: &serde_json::Value, _ctx: &ToolContext) -> ToolResult {
        let query = match input["query"].as_str() {
            Some(q) => q,
            None => return ToolResult::error("Missing 'query' parameter".into()),
        };

        let num_results = input["num_results"].as_u64().unwrap_or(5).min(20) as usize;

        let api_key = match &self.api_key {
            Some(k) => k,
            None => {
                return ToolResult::error(
                    "BRAVE_SEARCH_API_KEY not configured. Set this environment variable to enable web search.".into(),
                )
            }
        };

        let response = match self
            .client
            .get("https://api.search.brave.com/res/v1/web/search")
            .header("X-Subscription-Token", api_key)
            .header("Accept", "application/json")
            .query(&[("q", query), ("count", &num_results.to_string())])
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return ToolResult::error(format!("Search API request failed: {e}")),
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return ToolResult::error(format!("Search API error ({status}): {body}"));
        }

        let body: serde_json::Value = match response.json().await {
            Ok(v) => v,
            Err(e) => return ToolResult::error(format!("Failed to parse search results: {e}")),
        };

        let empty_vec = vec![];
        let results: Vec<serde_json::Value> = body["web"]["results"]
            .as_array()
            .unwrap_or(&empty_vec)
            .iter()
            .take(num_results)
            .map(|r| {
                serde_json::json!({
                    "title": r["title"].as_str().unwrap_or(""),
                    "url": r["url"].as_str().unwrap_or(""),
                    "description": r["description"].as_str().unwrap_or("")
                })
            })
            .collect();

        ToolResult::ok(
            serde_json::json!({
                "query": query,
                "num_results": results.len(),
                "results": results
            })
            .to_string(),
        )
    }
}
