import { Router, Request, Response } from 'express'
import { OptimizedE2BService } from './services/OptimizedE2BService'
import { authenticateUser } from './middleware/auth'
import type { User, E2BStats } from '../src/types/app'

const router = Router()
const e2bService = OptimizedE2BService.getInstance()

/**
 * Route pour exécuter une commande dans le terminal E2B
 * POST /api/terminal/execute
 */
router.post('/execute', authenticateUser, async (req, res) => {
  try {
    const { command } = req.body
    const userId = req.user?.id

    if (!command) {
      return res.status(400).json({ 
        error: 'Command is required',
        message: 'Veuillez fournir une commande à exécuter' 
      })
    }

    if (!userId) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Utilisateur non authentifié' 
      })
    }

    console.log(`Exécution de commande E2B: "${command}" pour l'utilisateur ${userId}`)

    const startTime = Date.now()
    
    // Exécuter la commande
    const result = await e2bService.executeCommand(command, 'default', userId)
    
    const duration = Date.now() - startTime
    const cost = e2bService.calculateCost(duration, false)

    // Enregistrer l'exécution
    await e2bService.recordExecution(userId, command, result.output, cost, duration)

    // Mettre à jour les statistiques
    const stats = await e2bService.getUsageStats(userId)
    if (stats) {
      await e2bService.updateE2BStats(userId, {
        totalExecutions: stats.totalExecutions + 1,
        totalCost: stats.totalCost + cost,
        avgDuration: (stats.averageDuration * stats.totalExecutions + duration) / (stats.totalExecutions + 1),
        lastUsed: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      command,
      result: {
        output: result.output,
        exit_code: result.success ? 0 : 1,
        error: result.error
      },
      execution: {
        duration,
        cost,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Erreur lors de l\'exécution de la commande:', error)
    
    // Enregistrer l'échec
    if (req.user?.id && req.body.command) {
      await e2bService.recordFailure(
        req.user.id,
        req.body.command,
        error
      )
    }

    res.status(500).json({ 
      error: 'Execution failed',
      message: 'Erreur lors de l\'exécution de la commande',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

/**
 * Route pour obtenir les statistiques d'utilisation E2B
 * GET /api/terminal/stats
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Utilisateur non authentifié' 
      })
    }

    // Obtenir les statistiques d'utilisation
    const stats = await e2bService.getUsageStats(userId)

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Erreur lors de la récupération des stats E2B:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erreur lors de la récupération des statistiques',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

/**
 * Route pour nettoyer les sandboxes inactifs
 * POST /api/terminal/cleanup
 */
router.post('/cleanup', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Utilisateur non authentifié' 
      })
    }

    console.log(`Nettoyage des sandboxes pour l'utilisateur ${userId}`)

    // Nettoyer les sandboxes de l'utilisateur
    await e2bService.destroyUserSandboxes(userId)
    
    // Nettoyer les sandboxes inactifs globalement
    await e2bService.cleanupIdleSandboxes()
    
    // Nettoyer via la base de données
    await e2bService.cleanupIdleSandboxesFromDB()

    res.json({
      success: true,
      message: 'Sandboxes nettoyés avec succès',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Erreur lors du nettoyage des sandboxes:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erreur lors du nettoyage des sandboxes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

/**
 * Route pour détruire un sandbox spécifique
 * DELETE /api/terminal/sandbox/:sandboxId
 */
router.delete('/sandbox/:sandboxId', authenticateUser, async (req, res) => {
  try {
    const { sandboxId } = req.params
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Utilisateur non authentifié' 
      })
    }

    console.log(`Destruction du sandbox ${sandboxId} pour l'utilisateur ${userId}`)

    // Détruire le sandbox
    await e2bService.destroySandbox(sandboxId)
    
    // Supprimer de la base de données
    await e2bService.unregisterActiveSandbox(sandboxId)

    res.json({
      success: true,
      message: `Sandbox ${sandboxId} détruit avec succès`,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Erreur lors de la destruction du sandbox:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erreur lors de la destruction du sandbox',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

export default router