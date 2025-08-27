-- Création des tables principales pour l'assistant IA

-- Table des sessions utilisateur pour la mémoire conversationnelle
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_name TEXT,
    context JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Table des tâches de recherche
CREATE TABLE IF NOT EXISTS research_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    query_embedding VECTOR(1536), -- OpenAI text-embedding-3-small
    status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
    results JSONB DEFAULT '[]',
    total_cost DECIMAL(10,6) DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Table des résultats de recherche structurés
CREATE TABLE IF NOT EXISTS research_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES research_tasks(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('text', 'table', 'chart', 'file', 'command_output')) NOT NULL,
    content JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des exécutions sandbox E2B
CREATE TABLE IF NOT EXISTS sandbox_executions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES research_tasks(id) ON DELETE CASCADE,
    sandbox_id TEXT NOT NULL,
    commands JSONB DEFAULT '[]',
    output TEXT,
    duration DECIMAL(10,3) NOT NULL, -- en secondes
    cost DECIMAL(10,6) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE NOT NULL,
    success BOOLEAN DEFAULT true
);

-- Table des messages de chat
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES research_tasks(id) ON DELETE SET NULL,
    role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- Pour la recherche sémantique
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour la mémoire utilisateur personnalisée
CREATE TABLE IF NOT EXISTS user_memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT CHECK (category IN ('personal', 'preferences', 'goals', 'history', 'facts')) NOT NULL,
    importance INTEGER CHECK (importance >= 1 AND importance <= 5) DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les recherches vectorielles
CREATE INDEX IF NOT EXISTS research_tasks_embedding_idx ON research_tasks USING ivfflat (query_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS research_results_embedding_idx ON research_results USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS messages_embedding_idx ON messages USING ivfflat (embedding vector_cosine_ops);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS research_tasks_user_id_idx ON research_tasks(user_id);
CREATE INDEX IF NOT EXISTS research_tasks_status_idx ON research_tasks(status);
CREATE INDEX IF NOT EXISTS messages_session_id_idx ON messages(session_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS sandbox_executions_task_id_idx ON sandbox_executions(task_id);
CREATE INDEX IF NOT EXISTS user_memories_user_id_idx ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS user_memories_category_idx ON user_memories(category);

-- Fonction pour la recherche de similarité
CREATE OR REPLACE FUNCTION search_similar_tasks(
    query_embedding VECTOR(1536),
    user_id_param UUID,
    similarity_threshold FLOAT DEFAULT 0.8,
    max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
    task_id UUID,
    query TEXT,
    similarity FLOAT,
    results JSONB,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rt.id,
        rt.query,
        1 - (rt.query_embedding <=> query_embedding) as similarity,
        rt.results,
        rt.created_at
    FROM research_tasks rt
    WHERE rt.user_id = user_id_param
        AND rt.status = 'completed'
        AND rt.query_embedding IS NOT NULL
        AND 1 - (rt.query_embedding <=> query_embedding) > similarity_threshold
    ORDER BY rt.query_embedding <=> query_embedding
    LIMIT max_results;
END;
$$;

-- Fonction pour la recherche sémantique dans les messages
CREATE OR REPLACE FUNCTION similarity_search(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INTEGER DEFAULT 10,
    user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    role TEXT,
    session_id UUID,
    user_id UUID,
    msg_timestamp TIMESTAMP WITH TIME ZONE,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.content,
        m.role,
        m.session_id,
        m.user_id,
        m.timestamp as msg_timestamp,
        1 - (m.embedding <=> query_embedding) as similarity
    FROM messages m
    WHERE m.embedding IS NOT NULL
        AND (user_id_filter IS NULL OR m.user_id = user_id_filter)
        AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Fonction pour mettre à jour les timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger pour user_sessions
CREATE TRIGGER update_user_sessions_updated_at
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour user_memories
CREATE TRIGGER update_user_memories_updated_at
    BEFORE UPDATE ON user_memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Activation de l'extension vector si pas déjà fait
CREATE EXTENSION IF NOT EXISTS vector;

-- RLS (Row Level Security)
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sandbox_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour user_sessions
CREATE POLICY "Users can view own sessions" ON user_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON user_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON user_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Politiques RLS pour research_tasks
CREATE POLICY "Users can view own tasks" ON research_tasks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks" ON research_tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON research_tasks
    FOR UPDATE USING (auth.uid() = user_id);

-- Politiques RLS pour research_results
CREATE POLICY "Users can view own results" ON research_results
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM research_tasks rt 
            WHERE rt.id = research_results.task_id 
            AND rt.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own results" ON research_results
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM research_tasks rt 
            WHERE rt.id = research_results.task_id 
            AND rt.user_id = auth.uid()
        )
    );

-- Politiques RLS pour sandbox_executions
CREATE POLICY "Users can view own executions" ON sandbox_executions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM research_tasks rt 
            WHERE rt.id = sandbox_executions.task_id 
            AND rt.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own executions" ON sandbox_executions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM research_tasks rt 
            WHERE rt.id = sandbox_executions.task_id 
            AND rt.user_id = auth.uid()
        )
    );

-- Politiques RLS pour messages
CREATE POLICY "Users can view own messages" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_sessions us 
            WHERE us.id = messages.session_id 
            AND us.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own messages" ON messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_sessions us 
            WHERE us.id = messages.session_id 
            AND us.user_id = auth.uid()
        )
    );

-- Politiques RLS pour user_memories
CREATE POLICY "Users can view own memories" ON user_memories
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories" ON user_memories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories" ON user_memories
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories" ON user_memories
    FOR DELETE USING (auth.uid() = user_id);