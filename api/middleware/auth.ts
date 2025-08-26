import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import type { User } from '../../src/types/app'

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

// Interface pour étendre Request avec user
declare global {
  namespace Express {
    interface Request {
      user?: User
    }
  }
}

export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token d\'authentification manquant' })
    }

    const token = authHeader.substring(7)
    const supabase = getSupabaseClient()
    
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return res.status(401).json({ error: 'Token invalide' })
    }

    // Ajouter l'utilisateur à la requête
    req.user = {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name,
      avatar: user.user_metadata?.avatar_url
    }

    next()
  } catch (error) {
    console.error('Erreur d\'authentification:', error)
    return res.status(500).json({ error: 'Erreur interne du serveur' })
  }
}