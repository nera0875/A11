import { Router, Request, Response } from 'express'
import { authenticateUser } from './middleware/auth'
import { RAGService } from './services/RAGService'
import type { User, SearchResult } from '../src/types/app'

const router = Router()
const ragService = RAGService.getInstance()

/**
 * Route pour la recherche sémantique dans l'historique
 * POST /api/search
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { query, sessionId, limit = 10 } = req.body
    const userId = req.user?.id

    if (!query) {
      return res.status(400).json({ 
        error: 'Query is required',
        message: 'Veuillez fournir une requête de recherche' 
      })
    }

    if (!userId) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Utilisateur non authentifié' 
      })
    }

    console.log(`Recherche sémantique: "${query}" pour l'utilisateur ${userId}`)

    // Effectuer la recherche sémantique
    const results = await ragService.semanticSearch(
      query,
      userId,
      sessionId,
      Math.min(limit, 50) // Limiter à 50 résultats max
    )

    // Formater les résultats pour l'API
    const formattedResults = results.map(result => ({
      id: result.metadata.messageId,
      content: result.content,
      role: result.metadata.role,
      sessionId: result.metadata.sessionId,
      timestamp: result.metadata.timestamp,
      similarity: result.metadata.similarity
    }))

    res.json({
      success: true,
      query,
      results: formattedResults,
      count: formattedResults.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Erreur lors de la recherche sémantique:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erreur lors de la recherche sémantique',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

/**
 * Route pour obtenir les statistiques RAG de l'utilisateur
 * GET /api/search/stats
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

    // Obtenir les statistiques RAG
    const stats = await ragService.getRAGStats(userId)

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Erreur lors de la récupération des stats RAG:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erreur lors de la récupération des statistiques',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

/**
 * Route pour nettoyer les anciens embeddings
 * DELETE /api/search/cleanup
 */
router.delete('/cleanup', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id
    const { daysOld = 30 } = req.body

    if (!userId) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Utilisateur non authentifié' 
      })
    }

    console.log(`Nettoyage des embeddings de plus de ${daysOld} jours pour l'utilisateur ${userId}`)

    // Nettoyer les anciens embeddings
    await ragService.cleanupOldEmbeddings(daysOld)

    res.json({
      success: true,
      message: `Embeddings de plus de ${daysOld} jours supprimés`,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Erreur lors du nettoyage des embeddings:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erreur lors du nettoyage des embeddings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

export default router