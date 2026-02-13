import { apiCall } from "./api";

// --- Type Definitions ---

export interface LlmProvider {
	id: string;
	name: string;
	display_name: string;
	api_base_url: string | null;
	is_enabled: boolean;
	created_at: string;
	updated_at: string;
}

export interface Workflow {
	id: string;
	user_id: string;
	name: string;
	description: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface Agent {
	id: string;
	workflow_id: string;
	llm_provider_id: string;
	name: string;
	description: string | null;
	system_prompt: string | null;
	model: string;
	temperature: number;
	max_tokens: number;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface AgentExecution {
	id: string;
	agent_id: string;
	workflow_run_id: string | null;
	status: string;
	input_text: string | null;
	output_text: string | null;
	token_usage: TokenUsage | null;
	duration_ms: number | null;
	error_message: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface TokenUsage {
	input_tokens: number;
	output_tokens: number;
}

export interface AgentMessage {
	id: string;
	execution_id: string;
	role: string;
	content: string;
	sequence_order: number;
	created_at: string;
	updated_at: string;
}

export interface EventEnvelope {
	id: string;
	timestamp: string;
	event: ExecutionEvent;
}

export interface OrchestrationRun {
	id: string;
	orchestrator_agent_id: string;
	workflow_run_id: string;
	execution_id: string;
	mode: string;
	status: string;
	plan_json: unknown | null;
	messages_json: unknown | null;
	final_output: string | null;
	created_at: string;
	updated_at: string;
}

export type ExecutionEvent =
	| { type: "WorkflowRunStarted"; workflow_run_id: string; workflow_id: string }
	| {
			type: "WorkflowRunCompleted";
			workflow_run_id: string;
			workflow_id: string;
			status: string;
	  }
	| { type: "AgentExecutionStarted"; execution_id: string; agent_id: string }
	| {
			type: "AgentExecutionProgress";
			execution_id: string;
			agent_id: string;
			message: string;
	  }
	| {
			type: "AgentExecutionCompleted";
			execution_id: string;
			agent_id: string;
			output: string;
			duration_ms: number;
	  }
	| {
			type: "AgentExecutionFailed";
			execution_id: string;
			agent_id: string;
			error: string;
	  }
	| {
			type: "SubAgentCreated";
			agent_id: string;
			orchestrator_agent_id: string;
			name: string;
			description: string;
			workflow_id: string;
	  }
	| {
			type: "OrchestratorPlanProposed";
			orchestration_run_id: string;
			orchestrator_agent_id: string;
			plan: {
				steps: Array<{
					tool_use_id: string;
					name: string;
					input: Record<string, unknown>;
				}>;
				text: string;
			};
	  }
	| {
			type: "OrchestratorPlanApproved";
			orchestration_run_id: string;
			orchestrator_agent_id: string;
	  }
	| {
			type: "OrchestratorPlanRejected";
			orchestration_run_id: string;
			orchestrator_agent_id: string;
	  }
	| {
			type: "OrchestratorCompleted";
			orchestration_run_id: string;
			orchestrator_agent_id: string;
			output: string;
	  }
	| {
			type: "OrchestratorFailed";
			orchestration_run_id: string;
			orchestrator_agent_id: string;
			error: string;
	  };

// --- API Functions ---

export async function getLlmProviders(): Promise<LlmProvider[]> {
	return apiCall<LlmProvider[]>(
		"get_llm_providers",
		"GET",
		"/api/llm-providers",
	);
}

export async function createWorkflow(
	userId: string,
	name: string,
	description?: string,
): Promise<Workflow> {
	return apiCall<Workflow>("create_workflow", "POST", "/api/workflows", {
		user_id: userId,
		name,
		description,
	});
}

export async function getWorkflows(userId: string): Promise<Workflow[]> {
	return apiCall<Workflow[]>(
		"get_workflows",
		"GET",
		`/api/workflows?user_id=${userId}`,
		{ user_id: userId },
	);
}

export async function getWorkflow(id: string): Promise<Workflow> {
	return apiCall<Workflow>("get_workflow", "GET", `/api/workflows/${id}`, {
		id,
	});
}

export async function createAgent(params: {
	workflow_id: string;
	llm_provider_id: string;
	name: string;
	description?: string;
	system_prompt?: string;
	model?: string;
	temperature?: number;
	max_tokens?: number;
}): Promise<Agent> {
	return apiCall<Agent>("create_agent", "POST", "/api/agents", params);
}

export async function getAgents(workflowId: string): Promise<Agent[]> {
	return apiCall<Agent[]>(
		"get_agents",
		"GET",
		`/api/agents?workflow_id=${workflowId}`,
		{ workflow_id: workflowId },
	);
}

export async function executeAgent(
	agentId: string,
	input: string,
): Promise<AgentExecution> {
	return apiCall<AgentExecution>("execute_agent", "POST", "/api/execute", {
		agent_id: agentId,
		input,
	});
}

export async function getExecution(id: string): Promise<AgentExecution> {
	return apiCall<AgentExecution>(
		"get_execution",
		"GET",
		`/api/executions/${id}`,
		{ id },
	);
}

export async function getExecutionMessages(
	executionId: string,
): Promise<AgentMessage[]> {
	return apiCall<AgentMessage[]>(
		"get_execution_messages",
		"GET",
		`/api/executions/${executionId}/messages`,
		{ execution_id: executionId },
	);
}

// --- Orchestration API Functions ---

export async function orchestrateAgent(
	agentId: string,
	input: string,
	mode: string,
): Promise<OrchestrationRun> {
	return apiCall<OrchestrationRun>(
		"orchestrate_agent",
		"POST",
		"/api/orchestrate",
		{ agent_id: agentId, input, mode },
	);
}

export async function getOrchestration(id: string): Promise<OrchestrationRun> {
	return apiCall<OrchestrationRun>(
		"get_orchestration",
		"GET",
		`/api/orchestrate/${id}`,
		{ id },
	);
}

export async function approveOrchestration(
	id: string,
): Promise<OrchestrationRun> {
	return apiCall<OrchestrationRun>(
		"approve_orchestration",
		"POST",
		`/api/orchestrate/${id}/approve`,
		{ id },
	);
}

export async function rejectOrchestration(
	id: string,
): Promise<OrchestrationRun> {
	return apiCall<OrchestrationRun>(
		"reject_orchestration",
		"POST",
		`/api/orchestrate/${id}/reject`,
		{ id },
	);
}
