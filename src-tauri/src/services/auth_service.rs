use std::time::Duration;

use crate::auth;
use crate::auth::oauth::OAuthUserInfo;
use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{User, UserAuthProvider};

pub async fn check_session(db: &DbPool) -> Result<Option<User>, AppError> {
    let session = match auth::session::load_session() {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(None),
        Err(_) => return Ok(None),
    };

    // A keyring session exists — wait for the DB connection attempt to finish
    // so we can verify the user before deciding to redirect to login.
    let pool = match db.wait_ready(Duration::from_secs(10)).await {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1 AND is_active = TRUE")
        .bind(session.user_id)
        .fetch_optional(&pool)
        .await?;

    if user.is_none() {
        let _ = auth::session::clear_session();
    }

    Ok(user)
}

pub async fn login_with_password(
    db: &DbPool,
    email: &str,
    password: &str,
) -> Result<User, AppError> {
    let pool = db.get()?;

    let user =
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1 AND is_active = TRUE")
            .bind(email)
            .fetch_optional(&pool)
            .await?
            .ok_or_else(|| AppError::AuthFailed("Invalid email or password".to_string()))?;

    let password_hash = user
        .password_hash
        .as_ref()
        .ok_or_else(|| AppError::AuthFailed("This account uses social login".to_string()))?;

    if !auth::password::verify_password(password, password_hash)? {
        return Err(AppError::AuthFailed(
            "Invalid email or password".to_string(),
        ));
    }

    auth::session::save_session(&auth::SessionData {
        user_id: user.id,
        provider: "email".to_string(),
    })?;

    Ok(user)
}

pub async fn register_with_password(
    db: &DbPool,
    username: &str,
    email: &str,
    password: &str,
) -> Result<User, AppError> {
    if password.len() < 8 {
        return Err(AppError::InvalidInput(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    let pool = db.get()?;

    let existing: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)")
        .bind(email)
        .fetch_one(&pool)
        .await?;

    if existing {
        return Err(AppError::InvalidInput(
            "Email already registered".to_string(),
        ));
    }

    let password_hash = auth::password::hash_password(password)?;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, email, password_hash, display_name) \
         VALUES ($1, $2, $3, $1) RETURNING *",
    )
    .bind(username)
    .bind(email)
    .bind(&password_hash)
    .fetch_one(&pool)
    .await?;

    auth::session::save_session(&auth::SessionData {
        user_id: user.id,
        provider: "email".to_string(),
    })?;

    Ok(user)
}

pub async fn oauth_login(
    db: &DbPool,
    provider: &str,
    user_info: OAuthUserInfo,
) -> Result<User, AppError> {
    let pool = db.get()?;

    // Check if this OAuth account is already linked
    let existing_link = sqlx::query_as::<_, UserAuthProvider>(
        "SELECT * FROM user_auth_providers WHERE provider = $1 AND provider_user_id = $2",
    )
    .bind(provider)
    .bind(&user_info.provider_user_id)
    .fetch_optional(&pool)
    .await?;

    let user = if let Some(link) = existing_link {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1 AND is_active = TRUE")
            .bind(link.user_id)
            .fetch_optional(&pool)
            .await?
            .ok_or_else(|| AppError::AuthFailed("Linked account is deactivated".to_string()))?
    } else {
        let existing_user = if let Some(ref email) = user_info.email {
            sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1 AND is_active = TRUE")
                .bind(email)
                .fetch_optional(&pool)
                .await?
        } else {
            None
        };

        let user = if let Some(user) = existing_user {
            user
        } else {
            sqlx::query_as::<_, User>(
                "INSERT INTO users (username, email, display_name, avatar_url) \
                 VALUES ($1, $2, $3, $4) RETURNING *",
            )
            .bind(&user_info.username)
            .bind(&user_info.email)
            .bind(&user_info.display_name)
            .bind(&user_info.avatar_url)
            .fetch_one(&pool)
            .await?
        };

        sqlx::query(
            "INSERT INTO user_auth_providers (user_id, provider, provider_user_id) \
             VALUES ($1, $2, $3)",
        )
        .bind(user.id)
        .bind(provider)
        .bind(&user_info.provider_user_id)
        .execute(&pool)
        .await?;

        user
    };

    auth::session::save_session(&auth::SessionData {
        user_id: user.id,
        provider: provider.to_string(),
    })?;

    Ok(user)
}

pub fn logout() -> Result<(), AppError> {
    auth::session::clear_session()
}
