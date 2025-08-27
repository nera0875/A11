-- Grant permissions to anon and authenticated roles for all tables

-- Grant permissions for user_sessions table
GRANT SELECT, INSERT, UPDATE ON user_sessions TO authenticated;
GRANT SELECT ON user_sessions TO anon;

-- Grant permissions for research_tasks table
GRANT ALL PRIVILEGES ON research_tasks TO authenticated;
GRANT SELECT ON research_tasks TO anon;

-- Grant permissions for research_results table
GRANT ALL PRIVILEGES ON research_results TO authenticated;
GRANT SELECT ON research_results TO anon;

-- Grant permissions for sandbox_executions table
GRANT ALL PRIVILEGES ON sandbox_executions TO authenticated;
GRANT SELECT ON sandbox_executions TO anon;

-- Grant permissions for messages table
GRANT ALL PRIVILEGES ON messages TO authenticated;
GRANT SELECT ON messages TO anon;

-- Grant usage on sequences (for UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;