import OpenAI from 'openai'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Message } from '../../src/types/app'

interface SearchResult {
  content: string
  metadata: {
    messageId: string
    sessionId: string
    userId: string
    timestamp: string
    role: 'user' | 'assistant' | 'system'
    similarity: number
  }
}

interface EmbeddingCache {
  [key: string]: number[]
}

export class RAGService {
  private static instance: RAGService
  private supabase: SupabaseClient | null = null
  private openai: OpenAI | null = null
  private embeddingCache: EmbeddingCache = {}
  private readonly embeddingModel = process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small'
  private readonly embeddingDimensions = 1536
  private readonly similarityThreshold = 0.7
  private readonly maxResults = 10

  private constructor() {
    // OpenAI sera initialisé de manière paresseuse
  }

  public static getInstance(): RAGService {
    if (!RAGService.instance) {
      RAGService.instance = new RAGService()
    }
    return RAGService.instance
  }

  /**
   * Initialise le client OpenRouter de manière paresseuse
   */
  private getOpenAIClient(): OpenAI {
    if (!this.openai) {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('Variable d\'environnement OPENROUTER_API_KEY manquante')
      }
      this.openai = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
      })
    }
    return this.openai
  }

  /**
   * Initialise le client Supabase de manière paresseuse
   */
  private getSupabaseClient(): SupabaseClient {
    if (!this.supabase) {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Variables d\'environnement Supabase manquantes')
      }
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    }
    return this.supabase
  }

  /**
   * Génère un embedding pour un texte donné
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Vérifier le cache d'abord
      const cacheKey = this.getCacheKey(text)
      if (this.embeddingCache[cacheKey]) {
        return this.embeddingCache[cacheKey]
      }

      // Nettoyer et préparer le texte
      const cleanText = this.cleanText(text)
      if (cleanText.length === 0) {
        throw new Error('Texte vide après nettoyage')
      }

      // Générer l'embedding avec OpenAI
      const response = await this.getOpenAIClient().embeddings.create({
        model: this.embeddingModel,
        input: cleanText,
        dimensions: this.embeddingDimensions
      })

      const embedding = response.data[0].embedding

      // Mettre en cache
      this.embeddingCache[cacheKey] = embedding

      return embedding
    } catch (error) {
      console.error('Erreur lors de la génération de l\'embedding:', error)
      throw new Error(`Impossible de générer l'embedding: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Stocke un message avec son embedding dans Supabase
   */
  public async storeMessage(
    message: Message,
    embedding?: number[]
  ): Promise<void> {
    try {
      // Générer l'embedding si non fourni
      const messageEmbedding = embedding || await this.generateEmbedding(message.content)

      // Stocker le message avec son embedding
      const { error } = await this.getSupabaseClient()
        .from('messages')
        .update({
          embedding: messageEmbedding
        })
        .eq('id', message.id)

      if (error) {
        throw new Error(`Erreur lors du stockage du message: ${error.message}`)
      }

      console.log(`Message ${message.id} stocké avec embedding`)
    } catch (error) {
      console.error('Erreur lors du stockage du message:', error)
      throw error
    }
  }

  /**
   * Recherche sémantique dans les messages
   */
  public async semanticSearch(
    query: string,
    userId: string,
    sessionId?: string,
    limit: number = this.maxResults
  ): Promise<SearchResult[]> {
    try {
      // Générer l'embedding de la requête
      const queryEmbedding = await this.generateEmbedding(query)

      // Utiliser la fonction de recherche sémantique
      const { data: results, error } = await this.getSupabaseClient().rpc('similarity_search', {
        query_embedding: queryEmbedding,
        match_threshold: this.similarityThreshold,
        match_count: limit,
        user_id_filter: userId
      })

      if (error) {
        throw new Error(`Erreur lors de la recherche sémantique: ${error.message}`)
      }

      // Filtrer par session si spécifié et formater les résultats
      let searchResults: SearchResult[] = (results || []).map((result: any) => ({
        content: result.content,
        metadata: {
          messageId: result.id,
          sessionId: result.session_id,
          userId: result.user_id,
          timestamp: result.msg_timestamp,
          role: result.role,
          similarity: result.similarity
        }
      }))

      // Filtrer par session si nécessaire
      if (sessionId) {
        searchResults = searchResults.filter(result => result.metadata.sessionId === sessionId)
      }

      console.log(`Recherche sémantique: ${searchResults.length} résultats trouvés pour "${query}"`)
      return searchResults
    } catch (error) {
      console.error('Erreur lors de la recherche sémantique:', error)
      return []
    }
  }

  /**
   * Obtient le contexte pertinent pour une requête
   */
  public async getRelevantContext(
    query: string,
    userId: string,
    sessionId: string,
    maxTokens: number = 2000
  ): Promise<{
    context: string
    sources: SearchResult[]
  }> {
    try {
      // Rechercher les messages pertinents
      const searchResults = await this.semanticSearch(query, userId, sessionId)

      if (searchResults.length === 0) {
        return {
          context: '',
          sources: []
        }
      }

      // Construire le contexte en respectant la limite de tokens
      let context = ''
      const sources: SearchResult[] = []
      let currentTokens = 0

      for (const result of searchResults) {
        const resultText = `[${result.metadata.role}]: ${result.content}\n\n`
        const estimatedTokens = this.estimateTokens(resultText)

        if (currentTokens + estimatedTokens > maxTokens) {
          break
        }

        context += resultText
        sources.push(result)
        currentTokens += estimatedTokens
      }

      return {
        context: context.trim(),
        sources
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du contexte:', error)
      return {
        context: '',
        sources: []
      }
    }
  }

  /**
   * Met à jour l'embedding d'un message existant
   */
  public async updateMessageEmbedding(messageId: string, content: string): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(content)

      const { error } = await this.getSupabaseClient()
        .from('messages')
        .update({ embedding })
        .eq('id', messageId)

      if (error) {
        throw new Error(`Erreur lors de la mise à jour de l'embedding: ${error.message}`)
      }

      console.log(`Embedding mis à jour pour le message ${messageId}`)
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'embedding:', error)
      throw error
    }
  }

  /**
   * Supprime les embeddings anciens pour économiser l'espace
   */
  public async cleanupOldEmbeddings(daysOld: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      const { error } = await this.getSupabaseClient()
        .from('messages')
        .update({ embedding: null })
        .lt('timestamp', cutoffDate.toISOString())

      if (error) {
        throw new Error(`Erreur lors du nettoyage des embeddings: ${error.message}`)
      }

      console.log(`Embeddings anciens supprimés (plus de ${daysOld} jours)`)
    } catch (error) {
      console.error('Erreur lors du nettoyage des embeddings:', error)
    }
  }

  /**
   * Obtient les statistiques du système RAG
   */
  public async getRAGStats(userId: string): Promise<{
    totalMessages: number
    messagesWithEmbeddings: number
    averageSimilarity: number
    cacheHitRate: number
  }> {
    try {
      const { data: messages, error } = await this.getSupabaseClient()
        .from('messages')
        .select('id, embedding')
        .eq('user_id', userId)

      if (error) throw error

      const totalMessages = messages?.length || 0
      const messagesWithEmbeddings = messages?.filter(m => m.embedding).length || 0
      const cacheSize = Object.keys(this.embeddingCache).length
      const cacheHitRate = cacheSize > 0 ? (cacheSize / (cacheSize + totalMessages)) * 100 : 0

      return {
        totalMessages,
        messagesWithEmbeddings,
        averageSimilarity: 0, // À calculer selon les besoins
        cacheHitRate: Math.round(cacheHitRate * 100) / 100
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques RAG:', error)
      return {
        totalMessages: 0,
        messagesWithEmbeddings: 0,
        averageSimilarity: 0,
        cacheHitRate: 0
      }
    }
  }

  /**
   * Nettoie le texte pour l'embedding
   */
  private cleanText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normaliser les espaces
      .replace(/[\r\n]+/g, ' ') // Remplacer les retours à la ligne
      .substring(0, 8000) // Limiter la longueur
  }

  /**
   * Génère une clé de cache pour un texte
   */
  private getCacheKey(text: string): string {
    // Utiliser un hash simple du texte comme clé
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convertir en 32bit integer
    }
    return hash.toString()
  }

  /**
   * Estime le nombre de tokens dans un texte
   */
  private estimateTokens(text: string): number {
    // Estimation approximative : 1 token ≈ 4 caractères
    return Math.ceil(text.length / 4)
  }

  /**
   * Recherche des documents similaires (alias pour semanticSearch)
   */
  public async searchSimilar(
    query: string,
    limit: number = 5,
    userId?: string,
    sessionId?: string
  ): Promise<SearchResult[]> {
    if (!userId) {
      console.warn('searchSimilar appelé sans userId, retour de résultats vides')
      return []
    }
    return this.semanticSearch(query, userId, sessionId, limit)
  }

  /**
   * Ajoute un document au système RAG
   */
  public async addDocument(
    content: string,
    metadata: {
      sessionId: string
      userId: string
      timestamp: string
      type: string
    }
  ): Promise<void> {
    try {
      // Générer l'embedding pour le contenu
      const embedding = await this.generateEmbedding(content)

      // Créer un message fictif pour stocker le document
      const message = {
        session_id: metadata.sessionId,
        user_id: metadata.userId,
        role: 'system' as const,
        content: content,
        timestamp: metadata.timestamp,
        embedding: embedding,
        metadata: {
          type: metadata.type,
          indexed_at: new Date().toISOString()
        }
      }

      // Insérer dans la base de données
      const { error } = await this.getSupabaseClient()
        .from('messages')
        .insert(message)

      if (error) {
        throw new Error(`Erreur lors de l'ajout du document: ${error.message}`)
      }

      console.log(`Document ajouté au système RAG: ${content.substring(0, 100)}...`)
    } catch (error) {
      console.error('Erreur lors de l\'ajout du document:', error)
      throw error
    }
  }
}