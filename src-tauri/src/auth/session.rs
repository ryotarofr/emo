use crate::error::AppError;

use super::SessionData;

const SERVICE_NAME: &str = "tebiki";
const SESSION_KEY: &str = "session";

pub fn save_session(session: &SessionData) -> Result<(), AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, SESSION_KEY)
        .map_err(|e| AppError::Internal(format!("Keyring error: {e}")))?;
    let json = serde_json::to_string(session)
        .map_err(|e| AppError::Internal(format!("Session serialization error: {e}")))?;
    entry
        .set_password(&json)
        .map_err(|e| AppError::Internal(format!("Failed to save session: {e}")))?;
    Ok(())
}

pub fn load_session() -> Result<Option<SessionData>, AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, SESSION_KEY)
        .map_err(|e| AppError::Internal(format!("Keyring error: {e}")))?;
    match entry.get_password() {
        Ok(json) => {
            let session = serde_json::from_str(&json)
                .map_err(|e| AppError::Internal(format!("Session deserialization error: {e}")))?;
            Ok(Some(session))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Internal(format!("Failed to load session: {e}"))),
    }
}

pub fn clear_session() -> Result<(), AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, SESSION_KEY)
        .map_err(|e| AppError::Internal(format!("Keyring error: {e}")))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Internal(format!("Failed to clear session: {e}"))),
    }
}
