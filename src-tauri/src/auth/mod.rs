pub mod oauth;
pub mod password;
pub mod session;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub user_id: uuid::Uuid,
    pub provider: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct OAuthProviderConfig {
    pub name: String,
    pub client_id: String,
    pub client_secret: String,
    pub auth_url: String,
    pub token_url: String,
    pub userinfo_url: String,
    pub scopes: Vec<String>,
    pub use_pkce: bool,
}

impl OAuthProviderConfig {
    pub fn from_name(name: &str) -> Result<Self, AppError> {
        match name {
            "google" => Self::google(),
            "github" => Self::github(),
            _ => Err(AppError::ProviderNotConfigured(name.to_string())),
        }
    }

    fn google() -> Result<Self, AppError> {
        Ok(Self {
            name: "google".to_string(),
            client_id: std::env::var("GOOGLE_CLIENT_ID").map_err(|_| {
                AppError::ProviderNotConfigured("google (GOOGLE_CLIENT_ID not set)".to_string())
            })?,
            client_secret: std::env::var("GOOGLE_CLIENT_SECRET").map_err(|_| {
                AppError::ProviderNotConfigured("google (GOOGLE_CLIENT_SECRET not set)".to_string())
            })?,
            auth_url: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
            token_url: "https://oauth2.googleapis.com/token".to_string(),
            userinfo_url: "https://www.googleapis.com/oauth2/v3/userinfo".to_string(),
            scopes: vec![
                "openid".to_string(),
                "email".to_string(),
                "profile".to_string(),
            ],
            use_pkce: true,
        })
    }

    fn github() -> Result<Self, AppError> {
        Ok(Self {
            name: "github".to_string(),
            client_id: std::env::var("GITHUB_CLIENT_ID").map_err(|_| {
                AppError::ProviderNotConfigured("github (GITHUB_CLIENT_ID not set)".to_string())
            })?,
            client_secret: std::env::var("GITHUB_CLIENT_SECRET").map_err(|_| {
                AppError::ProviderNotConfigured("github (GITHUB_CLIENT_SECRET not set)".to_string())
            })?,
            auth_url: "https://github.com/login/oauth/authorize".to_string(),
            token_url: "https://github.com/login/oauth/access_token".to_string(),
            userinfo_url: "https://api.github.com/user".to_string(),
            scopes: vec!["user:email".to_string(), "read:user".to_string()],
            use_pkce: false,
        })
    }
}
