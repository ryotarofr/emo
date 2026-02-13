use sqlx::postgres::{PgPool, PgPoolOptions};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use crate::error::AppError;

#[derive(Clone)]
pub struct DbPool {
    inner: Arc<RwLock<Option<PgPool>>>,
    /// `true` once the DB connection attempt has finished (success or failure).
    resolved: Arc<AtomicBool>,
}

impl DbPool {
    pub fn unavailable() -> Self {
        Self {
            inner: Arc::new(RwLock::new(None)),
            resolved: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn connect(database_url: &str) -> Result<PgPool, sqlx::Error> {
        PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(3))
            .connect(database_url)
            .await
    }

    pub fn set_pool(&self, pool: PgPool) {
        let mut guard = self.inner.write().expect("DbPool lock poisoned");
        *guard = Some(pool);
        self.resolved.store(true, Ordering::Release);
    }

    /// Mark that the DB connection attempt has completed without a usable pool.
    pub fn mark_unavailable(&self) {
        self.resolved.store(true, Ordering::Release);
    }

    /// Wait until the DB connection attempt has resolved or timeout expires.
    /// Returns `Ok(pool)` if a pool is available, `Err(DatabaseUnavailable)` otherwise.
    pub async fn wait_ready(&self, timeout: Duration) -> Result<PgPool, AppError> {
        let start = tokio::time::Instant::now();
        while !self.resolved.load(Ordering::Acquire) {
            if start.elapsed() >= timeout {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        self.get()
    }

    pub fn get(&self) -> Result<PgPool, AppError> {
        let guard = self.inner.read().expect("DbPool lock poisoned");
        guard.clone().ok_or(AppError::DatabaseUnavailable)
    }
}
