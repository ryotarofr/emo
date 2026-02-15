use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database is not available")]
    DatabaseUnavailable,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Not found")]
    NotFound,

    #[error("Authentication failed: {0}")]
    AuthFailed(String),

    #[error("Authentication timed out")]
    AuthTimeout,

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("OAuth provider not configured: {0}")]
    ProviderNotConfigured(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("LLM error: {0}")]
    LlmError(String),

    #[error("WebSocket error: {0}")]
    #[allow(dead_code)]
    WebSocketError(String),

    #[error("Tool execution failed: {0}")]
    #[allow(dead_code)]
    ToolExecutionFailed(String),

    #[error("Tool permission denied: {0}")]
    #[allow(dead_code)]
    ToolPermissionDenied(String),
}

// For Tauri command responses
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl AppError {
    /// Machine-readable error code for programmatic handling
    fn error_code(&self) -> &'static str {
        match self {
            AppError::DatabaseUnavailable => "database_unavailable",
            AppError::Database(_) => "database_error",
            AppError::NotFound => "not_found",
            AppError::AuthFailed(_) => "auth_failed",
            AppError::AuthTimeout => "auth_timeout",
            AppError::InvalidInput(_) => "invalid_input",
            AppError::ProviderNotConfigured(_) => "provider_not_configured",
            AppError::Internal(_) => "internal_error",
            AppError::LlmError(_) => "llm_error",
            AppError::WebSocketError(_) => "websocket_error",
            AppError::ToolExecutionFailed(_) => "tool_execution_failed",
            AppError::ToolPermissionDenied(_) => "tool_permission_denied",
        }
    }
}

// For Axum HTTP responses
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::DatabaseUnavailable => StatusCode::SERVICE_UNAVAILABLE,
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::AuthFailed(_) => StatusCode::UNAUTHORIZED,
            AppError::AuthTimeout => StatusCode::GATEWAY_TIMEOUT,
            AppError::InvalidInput(_) => StatusCode::BAD_REQUEST,
            AppError::ProviderNotConfigured(_) => StatusCode::BAD_REQUEST,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::LlmError(_) => StatusCode::BAD_GATEWAY,
            AppError::WebSocketError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::ToolExecutionFailed(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::ToolPermissionDenied(_) => StatusCode::FORBIDDEN,
        };

        let body = serde_json::json!({
            "error": self.to_string(),
            "error_code": self.error_code(),
        });
        (status, axum::Json(body)).into_response()
    }
}
