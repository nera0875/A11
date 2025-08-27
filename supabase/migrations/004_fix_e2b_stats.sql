-- Migration pour corriger les erreurs E2B stats
-- Ajouter la colonne user_id manquante à sandbox_executions
ALTER TABLE sandbox_executions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Créer un index pour la nouvelle colonne
CREATE INDEX IF NOT EXISTS sandbox_executions_user_id_idx ON sandbox_executions(user_id);

-- Mettre à jour les politiques RLS pour sandbox_executions
ALTER TABLE sandbox_executions ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre aux utilisateurs de voir leurs propres exécutions
DROP POLICY IF EXISTS "Users can view own executions" ON sandbox_executions;
CREATE POLICY "Users can view own executions" ON sandbox_executions
    FOR SELECT USING (auth.uid() = user_id);

-- Politique pour permettre aux utilisateurs d'insérer leurs propres exécutions
DROP POLICY IF EXISTS "Users can insert own executions" ON sandbox_executions;
CREATE POLICY "Users can insert own executions" ON sandbox_executions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Politique pour permettre aux utilisateurs de mettre à jour leurs propres exécutions
DROP POLICY IF EXISTS "Users can update own executions" ON sandbox_executions;
CREate POLICY "Users can update own executions" ON sandbox_executions
    FOR UPDATE USING (auth.uid() = user_id);

-- Corriger la fonction update_e2b_stats pour correspondre aux paramètres utilisés dans le code
DROP FUNCTION IF EXISTS update_e2b_stats(UUID, DECIMAL, DECIMAL, BOOLEAN);

CREATE OR REPLACE FUNCTION update_e2b_stats(
    p_user_id UUID,
    p_total_executions INTEGER,
    p_total_cost DECIMAL(10,6),
    p_avg_duration DECIMAL(10,3),
    p_last_used TIMESTAMP WITH TIME ZONE
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
        failed_executions,
        updated_at
    )
    VALUES (
        p_user_id,
        CURRENT_DATE,
        p_total_executions,
        p_avg_duration * p_total_executions, -- Convertir durée moyenne en durée totale
        p_total_cost,
        p_total_executions, -- Assumer que toutes sont réussies pour l'instant
        0,
        p_last_used
    )
    ON CONFLICT (user_id, date)
    DO UPDATE SET
        total_executions = GREATEST(e2b_usage_stats.total_executions, p_total_executions),
        total_duration_seconds = p_avg_duration * p_total_executions,
        total_cost = GREATEST(e2b_usage_stats.total_cost, p_total_cost),
        successful_executions = GREATEST(e2b_usage_stats.successful_executions, p_total_executions),
        updated_at = p_last_used;
END;
$$;

-- Corriger la colonne last_used_at dans active_sandboxes (elle est référencée comme last_used dans le code)
ALTER TABLE active_sandboxes 
ADD COLUMN IF NOT EXISTS last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Créer un index pour la nouvelle colonne
CREATE INDEX IF NOT EXISTS active_sandboxes_last_used_idx ON active_sandboxes(last_used);

-- Accorder les permissions nécessaires aux rôles anon et authenticated
GRANT SELECT, INSERT, UPDATE ON sandbox_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON e2b_usage_stats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON active_sandboxes TO authenticated;

-- Permettre l'exécution des fonctions
GRANT EXECUTE ON FUNCTION update_e2b_stats(UUID, INTEGER, DECIMAL, DECIMAL, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_idle_sandboxes(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_rag_stats(UUID) TO authenticated;