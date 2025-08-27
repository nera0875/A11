import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { RAGService } from './RAGService'

interface UserMemoryEntry {
  id?: string
  user_id: string
  key: string
  value: string
  category: 'personal' | 'preferences' | 'goals' | 'history' | 'facts'
  importance: 1 | 2 | 3 | 4 | 5 // 5 = très important
  created_at?: string
  updated_at?: string
}

export class UserMemoryService {
  private static instance: UserMemoryService
  private supabase: SupabaseClient | null = null
  private ragService: RAGService

  private constructor() {
    this.ragService = RAGService.getInstance()
  }

  public static getInstance(): UserMemoryService {
    if (!UserMemoryService.instance) {
      UserMemoryService.instance = new UserMemoryService()
    }
    return UserMemoryService.instance
  }

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
   * Extrait automatiquement les informations importantes d'une conversation
   */
  public async extractMemoriesFromConversation(
    userMessage: string,
    assistantResponse: string,
    userId: string,
    sessionId: string
  ): Promise<void> {
    try {
      // Utiliser l'IA pour extraire les informations importantes
      const openai = this.ragService['getOpenAIClient']() // Accès privé via bracket notation
      
      const extractionPrompt = `Analyse cette conversation et extrait les informations importantes sur l'utilisateur.
      
Message utilisateur: "${userMessage}"
Réponse assistant: "${assistantResponse}"

Extrais UNIQUEMENT les informations factuelles importantes sur l'utilisateur sous forme de JSON:
{
  "personal": ["age: 26 ans", "nom: Georges"], 
  "preferences": ["préfère le développement", "aime les technologies"],
  "goals": ["devenir millionnaire", "apprendre l'IA"],
  "facts": ["travaille dans le tech", "habite en France"]
}

Si aucune information importante n'est trouvée, retourne un objet JSON vide: {}
Évite les informations temporaires ou peu importantes.`

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: extractionPrompt }],
        temperature: 0.1,
        max_tokens: 500
      })

      const extractedInfo = response.choices[0]?.message?.content?.trim()
      if (!extractedInfo) return

      try {
        const memories = JSON.parse(extractedInfo)
        
        // Sauvegarder chaque catégorie d'informations
        for (const [category, items] of Object.entries(memories)) {
          if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
              await this.addMemory({
                user_id: userId,
                key: category + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                value: item,
                category: category as any,
                importance: this.getImportanceForCategory(category as any)
              })
            }
          }
        }

        console.log(`Mémoires extraites et sauvegardées pour l'utilisateur ${userId}`)
      } catch (parseError) {
        console.error('Erreur lors du parsing des mémoires extraites:', parseError)
      }
    } catch (error) {
      console.error('Erreur lors de l\'extraction des mémoires:', error)
    }
  }

  /**
   * Ajoute une mémoire pour un utilisateur
   */
  public async addMemory(memory: Omit<UserMemoryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    try {
      // Vérifier si cette information existe déjà
      const existing = await this.getMemoriesByKey(memory.user_id, memory.key)
      if (existing.length > 0) {
        // Mettre à jour au lieu d'ajouter
        await this.updateMemory(existing[0].id!, { value: memory.value })
        return
      }

      const { error } = await this.getSupabaseClient()
        .from('user_memories')
        .insert({
          ...memory,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (error) {
        throw new Error(`Erreur lors de l'ajout de la mémoire: ${error.message}`)
      }

      // Ajouter aussi au système RAG pour la recherche sémantique
      await this.ragService.addDocument(
        `Information utilisateur: ${memory.key} = ${memory.value}`,
        {
          sessionId: 'memory',
          userId: memory.user_id,
          timestamp: new Date().toISOString(),
          type: 'user_memory'
        }
      )

      console.log(`Mémoire ajoutée: ${memory.key} = ${memory.value}`)
    } catch (error) {
      console.error('Erreur lors de l\'ajout de la mémoire:', error)
      throw error
    }
  }

  /**
   * Récupère toutes les mémoires d'un utilisateur
   */
  public async getUserMemories(userId: string, category?: string): Promise<UserMemoryEntry[]> {
    try {
      let query = this.getSupabaseClient()
        .from('user_memories')
        .select('*')
        .eq('user_id', userId)
        .order('importance', { ascending: false })
        .order('updated_at', { ascending: false })

      if (category) {
        query = query.eq('category', category)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(`Erreur lors de la récupération des mémoires: ${error.message}`)
      }

      return data || []
    } catch (error) {
      console.error('Erreur lors de la récupération des mémoires:', error)
      return []
    }
  }

  /**
   * Met à jour une mémoire
   */
  public async updateMemory(memoryId: string, updates: Partial<UserMemoryEntry>): Promise<void> {
    try {
      const { error } = await this.getSupabaseClient()
        .from('user_memories')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', memoryId)

      if (error) {
        throw new Error(`Erreur lors de la mise à jour de la mémoire: ${error.message}`)
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la mémoire:', error)
      throw error
    }
  }

  /**
   * Supprime une mémoire
   */
  public async deleteMemory(memoryId: string): Promise<void> {
    try {
      const { error } = await this.getSupabaseClient()
        .from('user_memories')
        .delete()
        .eq('id', memoryId)

      if (error) {
        throw new Error(`Erreur lors de la suppression de la mémoire: ${error.message}`)
      }
    } catch (error) {
      console.error('Erreur lors de la suppression de la mémoire:', error)
      throw error
    }
  }

  /**
   * Génère un contexte personnalisé basé sur les mémoires de l'utilisateur
   */
  public async generateUserContext(userId: string): Promise<string> {
    try {
      const memories = await this.getUserMemories(userId)
      
      if (memories.length === 0) {
        return ''
      }

      // Grouper par catégorie
      const grouped = memories.reduce((acc, memory) => {
        if (!acc[memory.category]) acc[memory.category] = []
        acc[memory.category].push(memory.value)
        return acc
      }, {} as Record<string, string[]>)

      let context = 'Informations sur l\'utilisateur:\n'
      
      for (const [category, items] of Object.entries(grouped)) {
        if (items.length > 0) {
          context += `\n${this.getCategoryLabel(category)}:\n`
          items.slice(0, 5).forEach(item => { // Limiter à 5 items par catégorie
            context += `- ${item}\n`
          })
        }
      }

      return context
    } catch (error) {
      console.error('Erreur lors de la génération du contexte utilisateur:', error)
      return ''
    }
  }

  /**
   * Recherche des mémoires par clé
   */
  private async getMemoriesByKey(userId: string, key: string): Promise<UserMemoryEntry[]> {
    try {
      const { data, error } = await this.getSupabaseClient()
        .from('user_memories')
        .select('*')
        .eq('user_id', userId)
        .eq('key', key)

      if (error) {
        throw new Error(`Erreur lors de la recherche par clé: ${error.message}`)
      }

      return data || []
    } catch (error) {
      console.error('Erreur lors de la recherche par clé:', error)
      return []
    }
  }

  private getImportanceForCategory(category: string): 1 | 2 | 3 | 4 | 5 {
    switch (category) {
      case 'personal': return 5
      case 'goals': return 4
      case 'preferences': return 3
      case 'facts': return 3
      case 'history': return 2
      default: return 2
    }
  }

  private getCategoryLabel(category: string): string {
    switch (category) {
      case 'personal': return 'Informations personnelles'
      case 'goals': return 'Objectifs et aspirations'
      case 'preferences': return 'Préférences'
      case 'facts': return 'Faits et détails'
      case 'history': return 'Historique'
      default: return 'Autres'
    }
  }
}
