mod auth;
mod commands;
mod constants;
mod db;
mod error;
mod event_bus;
mod handlers;
mod llm;
mod models;
mod services;
mod tools;
mod ws;

use std::sync::{Arc, Mutex};

use axum::routing::{get, post};
use db::DbPool;
use event_bus::EventBus;
use handlers::AppState;
use llm::LlmRegistry;
use tauri::Manager;
use tower_http::cors::{Any, CorsLayer};

/// Stores the dynamically assigned API port so the frontend can query it.
struct ApiPort(u16);

/// Holds the shutdown signal sender for graceful Axum shutdown.
struct ShutdownSignal(Mutex<Option<tokio::sync::oneshot::Sender<()>>>);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Returns the port the embedded Axum HTTP server is listening on.
#[tauri::command]
fn get_api_port(port: tauri::State<'_, ApiPort>) -> u16 {
    port.0
}

/// Initialize ToolRegistry with all available tools
fn init_tool_registry() -> tools::ToolRegistry {
    let mut registry = tools::ToolRegistry::new();
    registry.register(Box::new(tools::web_fetch::WebFetchTool::new()));
    registry.register(Box::new(tools::web_search::WebSearchTool::new()));
    registry.register(Box::new(tools::file_write::FileWriteTool));
    registry.register(Box::new(tools::shell_exec::ShellExecTool));
    registry.register(Box::new(tools::git_ops::GitOpsTool));
    registry.register(Box::new(tools::self_eval::SelfEvalTool));
    registry
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Load .env file (ok to fail if not present)
            let _ = dotenvy::dotenv();

            // Register DbPool in unavailable state initially
            let db_pool = DbPool::unavailable();
            app.manage(db_pool.clone());

            // Initialize LLM Registry
            let mut registry = LlmRegistry::new();
            match llm::anthropic::AnthropicProvider::from_env() {
                Ok(provider) => {
                    println!("[tebiki] Anthropic provider registered.");
                    registry.register(Box::new(provider));
                }
                Err(e) => {
                    eprintln!("[tebiki] Anthropic provider not available: {e}");
                }
            }
            match llm::gemini::GeminiProvider::from_env() {
                Ok(provider) => {
                    println!("[tebiki] Google AI Studio provider registered.");
                    registry.register(Box::new(provider));
                }
                Err(e) => {
                    eprintln!("[tebiki] Google AI Studio provider not available: {e}");
                }
            }
            let registry = Arc::new(registry);
            app.manage(registry.clone());

            // Initialize EventBus
            let event_bus = EventBus::new(256);
            app.manage(event_bus.clone());

            // Initialize ToolRegistry
            let tool_registry = Arc::new(init_tool_registry());
            println!(
                "[tebiki] ToolRegistry initialized with {} tools: {:?}",
                tool_registry.tool_names().len(),
                tool_registry.tool_names()
            );
            app.manage(tool_registry.clone());

            // Prepare graceful shutdown channel
            let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
            app.manage(ShutdownSignal(Mutex::new(Some(shutdown_tx))));

            // --- Start embedded Axum HTTP server ---
            let app_state = AppState {
                db: db_pool.clone(),
                llm_registry: registry,
                event_bus,
                tool_registry,
            };

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let cors = CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any);

                let router = axum::Router::new()
                    // Existing routes
                    .route("/api/health", get(handlers::health_check))
                    .route("/api/users", get(handlers::get_users))
                    .route("/api/users", post(handlers::create_user))
                    .route("/api/auth/session", get(handlers::check_session))
                    .route("/api/auth/login", post(handlers::login_with_password))
                    .route("/api/auth/register", post(handlers::register_with_password))
                    .route("/api/auth/logout", post(handlers::logout))
                    // Workflow routes
                    .route("/api/workflows", get(handlers::get_workflows_handler))
                    .route("/api/workflows", post(handlers::create_workflow_handler))
                    .route("/api/workflows/{id}", get(handlers::get_workflow_handler))
                    // Agent routes
                    .route("/api/agents", get(handlers::get_agents_handler))
                    .route("/api/agents", post(handlers::create_agent_handler))
                    .route(
                        "/api/llm-providers",
                        get(handlers::get_llm_providers_handler),
                    )
                    // Execution routes
                    .route("/api/execute", post(handlers::execute_agent_handler))
                    .route("/api/executions/{id}", get(handlers::get_execution_handler))
                    .route(
                        "/api/executions/{id}/messages",
                        get(handlers::get_execution_messages_handler),
                    )
                    // Orchestration routes
                    .route(
                        "/api/orchestrate",
                        post(handlers::orchestrate_agent_handler),
                    )
                    .route(
                        "/api/orchestrate/{id}",
                        get(handlers::get_orchestration_handler),
                    )
                    .route(
                        "/api/orchestrate/{id}/approve",
                        post(handlers::approve_orchestration_handler),
                    )
                    .route(
                        "/api/orchestrate/{id}/reject",
                        post(handlers::reject_orchestration_handler),
                    )
                    // Tool routes
                    .route("/api/tools", get(handlers::list_tools_handler))
                    .route(
                        "/api/tools/permissions",
                        post(handlers::update_tool_permissions_handler),
                    )
                    .route(
                        "/api/tools/permissions/{agent_id}",
                        get(handlers::get_tool_permissions_handler),
                    )
                    // WebSocket
                    .route("/api/ws", get(ws::ws_handler))
                    .layer(cors)
                    .with_state(app_state);

                let listener = match tokio::net::TcpListener::bind("127.0.0.1:11419").await {
                    Ok(l) => l,
                    Err(e) => {
                        eprintln!("[tebiki] Failed to bind Axum server: {e}");
                        return;
                    }
                };
                let port = listener.local_addr().unwrap().port();
                println!("[tebiki] API server listening on http://127.0.0.1:{port}");

                // Store the port so the frontend can query it
                app_handle.manage(ApiPort(port));

                axum::serve(listener, router)
                    .with_graceful_shutdown(async {
                        shutdown_rx.await.ok();
                    })
                    .await
                    .ok();
            });

            // --- Connect to database asynchronously ---
            tauri::async_runtime::spawn(async move {
                let database_url = match std::env::var("DATABASE_URL") {
                    Ok(url) => url,
                    Err(_) => {
                        eprintln!("[tebiki] DATABASE_URL not set. Database features disabled.");
                        db_pool.mark_unavailable();
                        return;
                    }
                };

                match DbPool::connect(&database_url).await {
                    Ok(pool) => {
                        match sqlx::migrate!("./migrations").run(&pool).await {
                            Ok(_) => {
                                println!("[tebiki] Database connected and migrations applied.");
                            }
                            Err(e) => {
                                eprintln!("[tebiki] Migration error: {e}");
                            }
                        }
                        db_pool.set_pool(pool);
                    }
                    Err(e) => {
                        eprintln!("[tebiki] Database connection failed: {e}");
                        eprintln!("[tebiki] App will continue without database.");
                        db_pool.mark_unavailable();
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(tx) = window
                    .app_handle()
                    .try_state::<ShutdownSignal>()
                    .and_then(|s| s.0.lock().ok()?.take())
                {
                    let _ = tx.send(());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_api_port,
            commands::db_health_check,
            commands::get_users,
            commands::create_user,
            commands::check_session,
            commands::login_with_password,
            commands::register_with_password,
            commands::start_oauth,
            commands::logout,
            commands::create_workflow,
            commands::get_workflows,
            commands::get_workflow,
            commands::create_agent,
            commands::get_agents,
            commands::get_llm_providers,
            commands::execute_agent,
            commands::get_execution,
            commands::get_execution_messages,
            commands::orchestrate_agent,
            commands::get_orchestration,
            commands::approve_orchestration,
            commands::reject_orchestration,
            commands::list_tools,
            commands::update_tool_permissions,
            commands::get_tool_permissions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
