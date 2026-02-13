use chrono::Utc;
use uuid::Uuid;

use crate::constants::*;
use crate::db::DbPool;

/// オーケストレーションの終了処理: orchestration_run、agent_execution、workflow_runを更新
pub(super) async fn finalize_orchestration(
    db: &DbPool,
    orchestration_run_id: Uuid,
    execution_id: Uuid,
    status: &str,
    final_output: Option<&str>,
    error_message: Option<&str>,
) {
    let pool = match db.get() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[orchestration] Failed to get DB pool for finalization: {e}");
            return;
        }
    };

    let now = Utc::now();

    // orchestration_runを更新
    if let Err(e) = sqlx::query(
        r#"
        UPDATE orchestration_runs
        SET status = $1, final_output = $2, updated_at = $3
        WHERE id = $4
        "#,
    )
    .bind(status)
    .bind(final_output)
    .bind(now)
    .bind(orchestration_run_id)
    .execute(&pool)
    .await
    {
        eprintln!("[orchestration] Failed to update orchestration_run {orchestration_run_id}: {e}");
    }

    // agent_executionを更新
    let exec_status = match status {
        STATUS_COMPLETED => STATUS_COMPLETED,
        STATUS_FAILED | STATUS_REJECTED => STATUS_FAILED,
        _ => return,
    };

    if let Err(e) = sqlx::query(
        r#"
        UPDATE agent_executions
        SET status = $1, output_text = $2, error_message = $3, completed_at = $4
        WHERE id = $5
        "#,
    )
    .bind(exec_status)
    .bind(final_output)
    .bind(error_message)
    .bind(now)
    .bind(execution_id)
    .execute(&pool)
    .await
    {
        eprintln!("[orchestration] Failed to update agent_execution {execution_id}: {e}");
    }

    // orchestration_runのworkflow_run_id経由でworkflow_runを更新
    let wf_status = match status {
        STATUS_COMPLETED => STATUS_COMPLETED,
        _ => STATUS_FAILED,
    };

    if let Err(e) = sqlx::query(
        r#"
        UPDATE workflow_runs
        SET status = $1, error_message = $2, completed_at = $3
        WHERE id = (SELECT workflow_run_id FROM orchestration_runs WHERE id = $4)
          AND status = 'running'
        "#,
    )
    .bind(wf_status)
    .bind(error_message)
    .bind(now)
    .bind(orchestration_run_id)
    .execute(&pool)
    .await
    {
        eprintln!("[orchestration] Failed to update workflow_run for orchestration {orchestration_run_id}: {e}");
    }
}
