pub mod messages;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::WebSocketUpgrade;
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};

use crate::event_bus::EventBus;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    axum::extract::State(state): axum::extract::State<crate::handlers::AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_connection(socket, state.event_bus))
}

async fn handle_ws_connection(socket: WebSocket, event_bus: EventBus) {
    let (mut sender, mut receiver) = socket.split();
    let mut event_rx = event_bus.subscribe();

    loop {
        tokio::select! {
            // Forward events from EventBus to WebSocket client
            event = event_rx.recv() => {
                match event {
                    Ok(envelope) => {
                        if let Ok(json) = serde_json::to_string(&envelope) {
                            if sender.send(Message::Text(json.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        eprintln!("[ws] Lagged behind by {n} messages");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            // Handle incoming messages from client
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        if sender.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(_)) => {
                        // Phase 1: ignore client messages
                    }
                    Some(Err(_)) => break,
                }
            }
        }
    }
}
