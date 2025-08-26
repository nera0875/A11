-- Amélioration du système RAG et intégration E2B

-- Ajouter la colonne embedding à la table messages si elle n'existe pas
ALTER TABLE messages ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Ajouter des colonnes manquantes à user_sessions
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

-- Index pour les recherches vectorielles sur les messages
CREATE INDEX IF NOT EXISTS messages_embedding_idx ON messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS messages_timestamp_idx ON messages(timestamp DESC);

-- Fonction de recherche sémantique pour les messages
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
        m.timestamp,
        1 - (m.embedding <=> query_embedding) as similarity
    FROM messages m
    WHERE m.embedding IS NOT NULL
        AND 1 - (m.embedding <=> query_embedding) > match_threshold
        AND (user_id_filter IS NULL OR m.user_id = user_id_filter)
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Fonction pour calculer la similarité entre deux embeddings
CREATE OR REPLACE FUNCTION calculate_similarity(
    embedding1 VECTOR(1536),
    embedding2 VECTOR(1536)
)
RETURNS FLOAT
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN 1 - (embedding1 <=> embedding2);
END;
$$;

-- Table pour les statistiques d'utilisation E2B
CREATE TABLE IF NOT EXISTS e2b_usage_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE DEFAULT CURRENT_DATE,
    total_executions INTEGER DEFAULT 0,
    total_duration_seconds DECIMAL(10,3) DEFAULT 0,
    total_cost DECIMAL(10,6) DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Table pour les sandboxes actives (pour le nettoyage automatique)
CREATE TABLE IF NOT EXISTS active_sandboxes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sandbox_id TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_idle BOOLEAN DEFAULT false
);

-- Index pour les statistiques E2B
CREATE INDEX IF NOT EXISTS e2b_usage_stats_user_date_idx ON e2b_usage_stats(user_id, date);
CREATE INDEX IF NOT EXISTS active_sandboxes_user_id_idx ON active_sandboxes(user_id);
CREATE INDEX IF NOT EXISTS active_sandboxes_last_used_idx ON active_sandboxes(last_used_at);

-- Fonction pour mettre à jour les statistiques E2B
CREATE OR REPLACE FUNCTION update_e2b_stats(
    p_user_id UUID,
    p_duration DECIMAL(10,3),
    p_cost DECIMAL(10,6),
    p_success BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO e2b_usage_stats (
        user_id, 
        date, 
        total_executions, 
        total_duration_seconds, 
        total_cost,
        successful_executions,
        failed_executions
    )
    VALUES (
        p_user_id,
        CURRENT_DATE,
        1,
        p_duration,
        p_cost,
        CASE WHEN p_success THEN 1 ELSE 0 END,
        CASE WHEN p_success THEN 0 ELSE 1 END
    )
    ON CONFLICT (user_id, date)
    DO UPDATE SET
        total_executions = e2b_usage_stats.total_executions + 1,
        total_duration_seconds = e2b_usage_stats.total_duration_seconds + p_duration,
        total_cost = e2b_usage_stats.total_cost + p_cost,
        successful_executions = e2b_usage_stats.successful_executions + CASE WHEN p_success THEN 1 ELSE 0 END,
        failed_executions = e2b_usage_stats.failed_executions + CASE WHEN p_success THEN 0 ELSE 1 END,
        updated_at = NOW();
END;
$$;

-- Fonction pour nettoyer les sandboxes inactives
CREATE OR REPLACE FUNCTION cleanup_idle_sandboxes(
    idle_threshold_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
    sandbox_id TEXT,
    user_id UUID,
    idle_duration_minutes INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.sandbox_id,
        s.user_id,
        EXTRACT(EPOCH FROM (NOW() - s.last_used_at))::INTEGER / 60 as idle_duration_minutes
    FROM active_sandboxes s
    WHERE s.last_used_at < NOW() - INTERVAL '1 minute' * idle_threshold_minutes
        AND s.is_idle = false;
    
    -- Marquer comme inactives
    UPDATE active_sandboxes 
    SET is_idle = true
    WHERE last_used_at < NOW() - INTERVAL '1 minute' * idle_threshold_minutes
        AND is_idle = false;
END;
$$;

-- Trigger pour mettre à jour updated_at sur e2b_usage_stats
CREATE TRIGGER update_e2b_usage_stats_updated_at
    BEFORE UPDATE ON e2b_usage_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS pour les nouvelles tables
ALTER TABLE e2b_usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sandboxes ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour e2b_usage_stats
CREATE POLICY "Users can view own E2B stats" ON e2b_usage_stats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own E2B stats" ON e2b_usage_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own E2B stats" ON e2b_usage_stats
    FOR UPDATE USING (auth.uid() = user_id);

-- Politiques RLS pour active_sandboxes
CREATE POLICY "Users can view own sandboxes" ON active_sandboxes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sandboxes" ON active_sandboxes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sandboxes" ON active_sandboxes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sandboxes" ON active_sandboxes
    FOR DELETE USING (auth.uid() = user_id);

-- Mise à jour des politiques RLS pour messages avec user_id
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
CREATE POLICY "Users can insert own messages" ON messages
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM user_sessions us 
            WHERE us.id = messages.session_id 
            AND us.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can view own messages" ON messages;
CREATE POLICY "Users can view own messages" ON messages
    FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM user_sessions us 
            WHERE us.id = messages.session_id 
            AND us.user_id = auth.uid()
        )
    );

-- Fonction pour obtenir les statistiques RAG d'un utilisateur
CREATE OR REPLACE FUNCTION get_user_rag_stats(
    p_user_id UUID
)
RETURNS TABLE (
    total_messages BIGINT,
    messages_with_embeddings BIGINT,
    avg_message_length NUMERIC,
    oldest_message TIMESTAMP WITH TIME ZONE,
    newest_message TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_messages,
        COUNT(embedding) as messages_with_embeddings,
        AVG(LENGTH(content)) as avg_message_length,
        MIN(timestamp) as oldest_message,
        MAX(timestamp) as newest_message
    FROM messages
    WHERE user_id = p_user_id;
END;
$$;