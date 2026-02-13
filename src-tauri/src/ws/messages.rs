use serde::{Deserialize, Serialize};

/// Messages sent from client to server (future use)
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    Ping,
    Subscribe { channel: String },
    Unsubscribe { channel: String },
}

/// Messages sent from server to client (future use)
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    Pong,
    Error { message: String },
}
