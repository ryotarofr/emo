pub mod anthropic;
pub mod types;

use std::collections::HashMap;

use async_trait::async_trait;

use crate::error::AppError;
use types::{LlmRequest, LlmResponse};

#[async_trait]
pub trait LlmProviderTrait: Send + Sync {
    fn name(&self) -> &str;
    async fn complete(&self, request: &LlmRequest) -> Result<LlmResponse, AppError>;
    #[allow(dead_code)]
    async fn health_check(&self) -> Result<(), AppError>;
}

pub struct LlmRegistry {
    providers: HashMap<String, Box<dyn LlmProviderTrait>>,
}

impl LlmRegistry {
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
        }
    }

    pub fn register(&mut self, provider: Box<dyn LlmProviderTrait>) {
        let name = provider.name().to_string();
        self.providers.insert(name, provider);
    }

    pub fn get(&self, name: &str) -> Option<&dyn LlmProviderTrait> {
        self.providers.get(name).map(|p| p.as_ref())
    }

    #[allow(dead_code)]
    pub fn provider_names(&self) -> Vec<String> {
        self.providers.keys().cloned().collect()
    }
}
