use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{CreateUserRequest, User};

pub async fn health_check(db: &DbPool) -> Result<String, AppError> {
    let pool = db.get()?;
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&pool)
        .await?;
    Ok("Database connection is healthy".to_string())
}

pub async fn get_users(db: &DbPool) -> Result<Vec<User>, AppError> {
    let pool = db.get()?;
    let users = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE is_active = TRUE ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await?;
    Ok(users)
}

pub async fn create_user(db: &DbPool, request: &CreateUserRequest) -> Result<User, AppError> {
    let pool = db.get()?;
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, email, display_name) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(&request.username)
    .bind(&request.email)
    .bind(&request.display_name)
    .fetch_one(&pool)
    .await?;
    Ok(user)
}
