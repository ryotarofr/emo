use uuid::Uuid;

use crate::db::DbPool;
use crate::error::AppError;
use crate::models::{CreateWorkflowRequest, Workflow};

pub async fn create_workflow(
    db: &DbPool,
    request: &CreateWorkflowRequest,
) -> Result<Workflow, AppError> {
    let pool = db.get()?;
    let workflow = sqlx::query_as::<_, Workflow>(
        r#"
        INSERT INTO workflows (user_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING *
        "#,
    )
    .bind(request.user_id)
    .bind(&request.name)
    .bind(&request.description)
    .fetch_one(&pool)
    .await?;

    Ok(workflow)
}

pub async fn get_workflows_by_user(db: &DbPool, user_id: Uuid) -> Result<Vec<Workflow>, AppError> {
    let pool = db.get()?;
    let workflows = sqlx::query_as::<_, Workflow>(
        "SELECT * FROM workflows WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await?;

    Ok(workflows)
}

pub async fn get_workflow(db: &DbPool, id: Uuid) -> Result<Workflow, AppError> {
    let pool = db.get()?;
    let workflow = sqlx::query_as::<_, Workflow>("SELECT * FROM workflows WHERE id = $1")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(workflow)
}
