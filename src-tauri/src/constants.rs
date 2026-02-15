// ステータス
#[allow(dead_code)]
pub const STATUS_RUNNING: &str = "running";
pub const STATUS_COMPLETED: &str = "completed";
pub const STATUS_FAILED: &str = "failed";
pub const STATUS_REJECTED: &str = "rejected";
pub const STATUS_AWAITING_APPROVAL: &str = "awaiting_approval";

// オーケストレーションモード
pub const MODE_AUTOMATIC: &str = "automatic";
pub const MODE_APPROVAL: &str = "approval";

// メッセージロール
pub const ROLE_USER: &str = "user";
pub const ROLE_ASSISTANT: &str = "assistant";

// LLMストップリーズン
pub const STOP_END_TURN: &str = "end_turn";
pub const STOP_STOP: &str = "stop";
pub const STOP_TOOL_USE: &str = "tool_use";

// ツール名（オーケストレーション組み込み）
pub const TOOL_CREATE_SUB_AGENT: &str = "create_sub_agent";
pub const TOOL_EXECUTE_SUB_AGENT: &str = "execute_sub_agent";
pub const TOOL_GET_SUB_AGENT_RESULT: &str = "get_sub_agent_result";

// ツール名（外部ツール）
#[allow(dead_code)]
pub const TOOL_WEB_FETCH: &str = "web_fetch";
#[allow(dead_code)]
pub const TOOL_WEB_SEARCH: &str = "web_search";
#[allow(dead_code)]
pub const TOOL_FILE_WRITE: &str = "file_write";
#[allow(dead_code)]
pub const TOOL_SHELL_EXEC: &str = "shell_exec";
#[allow(dead_code)]
pub const TOOL_GIT_OPS: &str = "git_ops";
#[allow(dead_code)]
pub const TOOL_SELF_EVAL: &str = "self_eval";
