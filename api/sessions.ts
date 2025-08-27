import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { authenticateUser } from './middleware/auth'
import type { User, ChatSession } from '../src/types/app'

// Fonction pour initialiser Supabase de manière paresseuse
function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Variables d\'environnement Supabase manquantes')
  }
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export const sessionsRouter = Router()

interface CreateSessionRequest {
  userId: string
  title?: string
}

interface UpdateSessionRequest {
  title?: string
}

// GET /api/sessions - Récupérer toutes les sessions d'un utilisateur
sessionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId est requis'
      })
    }

    const { data: sessions, error } = await getSupabaseClient()
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(`Erreur lors de la récupération des sessions: ${error.message}`)
    }

    res.json({
      success: true,
      sessions: sessions || []
    })

  } catch (error) {
    console.error('Erreur dans GET /api/sessions:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne du serveur'
    })
  }
})

// POST /api/sessions - Créer une nouvelle session
sessionsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, title }: CreateSessionRequest = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId est requis'
      })
    }

    const sessionData: Partial<ChatSession> = {
      user_id: userId,
      session_name: title || `Session ${new Date().toLocaleDateString('fr-FR')}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0
    }

    const { data: session, error } = await getSupabaseClient()
      .from('user_sessions')
      .insert(sessionData)
      .select()
      .single()

    if (error) {
      throw new Error(`Erreur lors de la création de la session: ${error.message}`)
    }

    res.json({
      success: true,
      session
    })

  } catch (error) {
    console.error('Erreur dans POST /api/sessions:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne du serveur'
    })
  }
})

// PUT /api/sessions/:id - Mettre à jour une session
export async function PUT(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { title }: UpdateSessionRequest = req.body

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'ID de session requis'
      })
    }

    const updateData: Partial<ChatSession> = {
      updated_at: new Date().toISOString()
    }

    if (title) {
      updateData.session_name = title
    }

    const { data: session, error } = await getSupabaseClient()
      .from('user_sessions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Erreur lors de la mise à jour de la session: ${error.message}`)
    }

    res.json({
      success: true,
      session
    })

  } catch (error) {
    console.error('Erreur dans PUT /api/sessions:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne du serveur'
    })
  }
}

// DELETE /api/sessions/:id - Supprimer une session
sessionsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { userId } = req.query

    if (!id || !userId) {
      return res.status(400).json({
        success: false,
        error: 'ID de session et userId sont requis'
      })
    }

    // Vérifier que la session appartient à l'utilisateur
    const { data: session, error: sessionError } = await getSupabaseClient()
      .from('user_sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (sessionError || !session) {
      return res.status(404).json({
        success: false,
        error: 'Session non trouvée ou non autorisée'
      })
    }

    // Supprimer tous les messages de la session
    const { error: messagesError } = await getSupabaseClient()
      .from('messages')
      .delete()
      .eq('session_id', id)

    if (messagesError) {
      console.error('Erreur lors de la suppression des messages:', messagesError)
    }

    // Supprimer la session
    const { error: deleteError } = await getSupabaseClient()
      .from('user_sessions')
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw new Error(`Erreur lors de la suppression de la session: ${deleteError.message}`)
    }

    res.json({
      success: true,
      message: 'Session supprimée avec succès'
    })

  } catch (error) {
    console.error('Erreur dans DELETE /api/sessions:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne du serveur'
    })
  }
})