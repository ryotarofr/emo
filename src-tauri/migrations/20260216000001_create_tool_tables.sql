-- Tool system tables for agent tool permissions and execution logging

-- Agent tool permissions: controls which tools each agent can use
CREATE TABLE IF NOT EXISTS agent_tool_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_name VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, tool_name)
);

-- Tool execution log: records each tool invocation for audit/debugging
CREATE TABLE IF NOT EXISTS tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
    tool_name VARCHAR(255) NOT NULL,
    input JSONB NOT NULL DEFAULT '{}',
    output TEXT,
    is_error BOOLEAN NOT NULL DEFAULT false,
    duration_ms BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_agent_tool_permissions_agent_id
    ON agent_tool_permissions(agent_id);

CREATE INDEX IF NOT EXISTS idx_tool_executions_execution_id
    ON tool_executions(execution_id);

CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_name
    ON tool_executions(tool_name);

-- Trigger to auto-update updated_at on agent_tool_permissions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_agent_tool_permissions_updated_at'
    ) THEN
        CREATE TRIGGER trigger_agent_tool_permissions_updated_at
            BEFORE UPDATE ON agent_tool_permissions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;
