import { Request, Response, Router } from 'express'
import { createClient } from '@supabase/supabase-js'

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
import type { Message } from '../src/types/app'

export const messagesRouter = Router()

// GET /api/messages - Récupérer les messages d'une session
messagesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { sessionId, userId, limit = '50', offset = '0' } = req.query

    if (!sessionId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId et userId sont requis'
      })
    }

    // Vérifier que la session appartient à l'utilisateur
    const { data: session, error: sessionError } = await getSupabaseClient()
      .from('user_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single()

    if (sessionError || !session) {
      return res.status(404).json({
        success: false,
        error: 'Session non trouvée ou non autorisée'
      })
    }

    // Récupérer les messages
    const { data: messages, error: messagesError } = await getSupabaseClient()
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })
      .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1)

    if (messagesError) {
      throw new Error(`Erreur lors de la récupération des messages: ${messagesError.message}`)
    }

    res.json({
      success: true,
      messages: messages || [],
      total: messages?.length || 0
    })

  } catch (error) {
    console.error('Erreur dans GET /api/messages:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne du serveur'
    })
  }
})

// DELETE /api/messages/:id - Supprimer un message
export async function DELETE(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { userId } = req.query

    if (!id || !userId) {
      return res.status(400).json({
        success: false,
        error: 'ID de message et userId sont requis'
      })
    }

    // Vérifier que le message appartient à une session de l'utilisateur
    const { data: message, error: messageError } = await getSupabaseClient()
      .from('messages')
      .select(`
        *,
        user_sessions!inner(
          user_id
        )
      `)
      .eq('id', id)
      .eq('user_sessions.user_id', userId)
      .single()

    if (messageError || !message) {
      return res.status(404).json({
        success: false,
        error: 'Message non trouvé ou non autorisé'
      })
    }

    // Supprimer le message
    const { error: deleteError } = await getSupabaseClient()
      .from('messages')
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw new Error(`Erreur lors de la suppression du message: ${deleteError.message}`)
    }

    // Mettre à jour le compteur de messages de la session
    const { data: sessionMessages } = await getSupabaseClient()
      .from('messages')
      .select('id')
      .eq('session_id', message.session_id)

    await getSupabaseClient()
      .from('user_sessions')
      .update({ 
        message_count: sessionMessages?.length || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', message.session_id)

    res.json({
      success: true,
      message: 'Message supprimé avec succès'
    })

  } catch (error) {
    console.error('Erreur dans DELETE /api/messages:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne du serveur'
    })
  }
}