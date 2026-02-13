use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ExecutionEvent {
    WorkflowRunStarted {
        workflow_run_id: Uuid,
        workflow_id: Uuid,
    },
    WorkflowRunCompleted {
        workflow_run_id: Uuid,
        workflow_id: Uuid,
        status: String,
    },
    AgentExecutionStarted {
        execution_id: Uuid,
        agent_id: Uuid,
    },
    AgentExecutionProgress {
        execution_id: Uuid,
        agent_id: Uuid,
        message: String,
    },
    AgentExecutionCompleted {
        execution_id: Uuid,
        agent_id: Uuid,
        output: String,
        duration_ms: i64,
    },
    AgentExecutionFailed {
        execution_id: Uuid,
        agent_id: Uuid,
        error: String,
    },
    // --- Orchestration events ---
    SubAgentCreated {
        agent_id: Uuid,
        orchestrator_agent_id: Uuid,
        name: String,
        description: String,
        workflow_id: Uuid,
    },
    OrchestratorPlanProposed {
        orchestration_run_id: Uuid,
        orchestrator_agent_id: Uuid,
        plan: serde_json::Value,
    },
    OrchestratorPlanApproved {
        orchestration_run_id: Uuid,
        orchestrator_agent_id: Uuid,
    },
    OrchestratorPlanRejected {
        orchestration_run_id: Uuid,
        orchestrator_agent_id: Uuid,
    },
    OrchestratorCompleted {
        orchestration_run_id: Uuid,
        orchestrator_agent_id: Uuid,
        output: String,
    },
    OrchestratorFailed {
        orchestration_run_id: Uuid,
        orchestrator_agent_id: Uuid,
        error: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub event: ExecutionEvent,
}

impl EventEnvelope {
    pub fn new(event: ExecutionEvent) -> Self {
        Self {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            event,
        }
    }
}

#[derive(Clone)]
pub struct EventBus {
    sender: broadcast::Sender<EventEnvelope>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn publish(&self, event: ExecutionEvent) {
        let envelope = EventEnvelope::new(event);
        // Ignore error if no receivers
        let _ = self.sender.send(envelope);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<EventEnvelope> {
        self.sender.subscribe()
    }
}
