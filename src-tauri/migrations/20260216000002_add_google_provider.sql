-- Add Google AI Studio provider
INSERT INTO llm_providers (name, display_name, api_base_url)
VALUES ('google', 'Google AI Studio', 'https://generativelanguage.googleapis.com')
ON CONFLICT (name) DO NOTHING;
