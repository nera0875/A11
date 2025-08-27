import { Router, Request, Response } from 'express'
import { OptimizedE2BService } from './services/OptimizedE2BService'
import { authenticateUser } from './middleware/auth'
import type { User } from '../src/types/app'

const router = Router()
const e2bService = OptimizedE2BService.getInstance()

// Map pour stocker les connexions SSE actives
const activeConnections = new Map<string, Response>()

/**
 * Route pour établir une connexion Server-Sent Events
 * GET /api/streaming/connect
 */
router.get('/connect', (req: Request, res: Response) => {
  // Pour les tests, utiliser un userId par défaut ou depuis les query params
  const userId = req.query.userId as string || 'test-user'

  // Configuration des headers pour SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  })

  // Stocker la connexion
  const connectionId = `${userId}_${Date.now()}`
  activeConnections.set(connectionId, res)

  // Envoyer un message de connexion
  res.write(`data: ${JSON.stringify({ type: 'connected', connectionId })}\n\n`)

  // Gérer la déconnexion
  req.on('close', () => {
    activeConnections.delete(connectionId)
    console.log(`Connexion SSE fermée pour ${connectionId}`)
  })

  // Garder la connexion vivante
  const keepAlive = setInterval(() => {
    if (activeConnections.has(connectionId)) {
      res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
    } else {
      clearInterval(keepAlive)
    }
  }, 30000) // Ping toutes les 30 secondes
})

/**
 * Route pour exécuter une commande avec streaming en temps réel
 * POST /api/streaming/execute
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { command, sessionId, userId } = req.body
    const finalUserId = userId || 'test-user'

    if (!command || !finalUserId) {
      return res.status(400).json({ 
        error: 'Command et userId sont requis'
      })
    }

    // Trouver la connexion SSE active pour cet utilisateur
    const userConnection = Array.from(activeConnections.entries())
      .find(([id, _]) => id.startsWith(finalUserId))

    if (!userConnection) {
      return res.status(400).json({
        error: 'Aucune connexion SSE active trouvée. Connectez-vous d\'abord via /api/streaming/connect'
      })
    }

    const [connectionId, sseRes] = userConnection

    // Callbacks pour le streaming
    const callbacks = {
      onStart: () => {
        sseRes.write(`data: ${JSON.stringify({
          type: 'execution_start',
          command,
          timestamp: new Date().toISOString()
        })}\n\n`)
      },
      onStdout: (data: string) => {
        sseRes.write(`data: ${JSON.stringify({
          type: 'stdout',
          data,
          timestamp: new Date().toISOString()
        })}\n\n`)
      },
      onStderr: (data: string) => {
        sseRes.write(`data: ${JSON.stringify({
          type: 'stderr',
          data,
          timestamp: new Date().toISOString()
        })}\n\n`)
      },
      onComplete: (result: any) => {
        sseRes.write(`data: ${JSON.stringify({
          type: 'execution_complete',
          result,
          timestamp: new Date().toISOString()
        })}\n\n`)
      },
      onError: (error: string) => {
        sseRes.write(`data: ${JSON.stringify({
          type: 'execution_error',
          error,
          timestamp: new Date().toISOString()
        })}\n\n`)
      }
    }

    // Exécuter la commande avec streaming
    const result = await e2bService.executeCommand(
      command,
      sessionId || 'default',
      finalUserId,
      undefined,
      callbacks
    )

    // Répondre avec le résultat final
    res.json({
      success: true,
      executionId: result.id,
      message: 'Exécution terminée, vérifiez le stream SSE pour les détails'
    })

  } catch (error) {
    console.error('Erreur lors de l\'exécution streaming:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne du serveur'
    })
  }
})

/**
 * Fonction utilitaire pour envoyer des messages à tous les clients connectés
 */
export function broadcastToAll(message: any) {
  const data = `data: ${JSON.stringify(message)}\n\n`
  activeConnections.forEach((res, connectionId) => {
    try {
      res.write(data)
    } catch (error) {
      console.error(`Erreur lors de l'envoi à ${connectionId}:`, error)
      activeConnections.delete(connectionId)
    }
  })
}

/**
 * Fonction utilitaire pour envoyer des messages à un utilisateur spécifique
 */
export function sendToUser(userId: string, message: any) {
  const data = `data: ${JSON.stringify(message)}\n\n`
  const userConnections = Array.from(activeConnections.entries())
    .filter(([id, _]) => id.startsWith(userId))
  
  userConnections.forEach(([connectionId, res]) => {
    try {
      res.write(data)
    } catch (error) {
      console.error(`Erreur lors de l'envoi à ${connectionId}:`, error)
      activeConnections.delete(connectionId)
    }
  })
}

export default router