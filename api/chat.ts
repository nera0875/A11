import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { RAGService } from './services/RAGService'
import { OptimizedE2BService } from './services/OptimizedE2BService'
import OpenAI from 'openai'
import { authenticateUser } from './middleware/auth'
import type { Message, ResearchTask, SandboxExecution, User } from '../src/types/app'

// Initialisation paresseuse de Supabase
let supabase: any = null
function getSupabaseClient() {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Variables d\'environnement Supabase manquantes')
    }
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return supabase
}

// Initialisation paresseuse d'OpenRouter
let openaiClient: OpenAI | null = null
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY manquante dans les variables d\'environnement')
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    })
  }
  return openaiClient
}

export const chatRouter = Router()

const e2bService = OptimizedE2BService.getInstance()
const ragService = RAGService.getInstance()

interface ChatRequest {
  message: string
  sessionId: string
  userId: string
}

interface ChatResponse {
  success: boolean
  message?: Message
  error?: string
}

chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, sessionId, userId }: ChatRequest = req.body

    if (!message || !sessionId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Message, sessionId et userId sont requis'
      })
    }

    // Test simple avec OpenRouter - réponse directe sans base de données
    try {
      const response = await getOpenAIClient().chat.completions.create({
        model: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Tu es un assistant IA utile et bienveillant. Réponds de manière claire et concise.'
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })

      const assistantResponse = response.choices[0]?.message?.content || 'Erreur lors de la génération de la réponse'
      const duration = Math.round((Date.now() - Date.now()) / 1000) // Sera 0 pour ce test
      const cost = (response.usage?.total_tokens || 0) * 0.00003 // Estimation coût

      return res.json({
        success: true,
        message: {
          id: 'msg-' + Date.now(),
          role: 'assistant',
          content: assistantResponse,
          timestamp: new Date().toISOString(),
          metadata: {
            cost,
            duration,
            hasTerminalOutput: false,
            model: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini',
            tokens: response.usage?.total_tokens || 0
          }
        }
      })
    } catch (openaiError) {
      console.error('Erreur OpenRouter:', openaiError)
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de la communication avec OpenRouter: ' + (openaiError instanceof Error ? openaiError.message : 'Erreur inconnue')
      })
    }

    // Vérifier l'authentification (temporairement désactivé pour test)
    // const { data: session, error: sessionError } = await getSupabaseClient()
    //   .from('user_sessions')
    //   .select('*')
    //   .eq('id', sessionId)
    //   .eq('user_id', userId)
    //   .single()

    // if (sessionError || !session) {
    //   return res.status(401).json({
    //     success: false,
    //     error: 'Session non trouvée ou non autorisée'
    //   })
    // }

    // Sauvegarder le message utilisateur (temporairement désactivé pour test)
    // const userMessage = {
    //   session_id: sessionId,
    //   role: 'user',
    //   content: message,
    //   created_at: new Date().toISOString()
    // }

    // const { data: savedUserMessage, error: userMessageError } = await getSupabaseClient()
    //   .from('messages')
    //   .insert(userMessage)
    //   .select()
    //   .single()

    // if (userMessageError) {
    //   throw new Error(`Erreur lors de la sauvegarde du message: ${userMessageError.message}`)
    // }

    // Recherche RAG pour le contexte (temporairement désactivé pour test)
    // const ragResults = await ragService.searchSimilar(message, 5)
    const context = '' // ragResults.map(r => r.content).join('\n\n')
    
    // Rechercher des documents similaires pour enrichir le contexte
    // const similarDocs = await ragService.searchSimilar(message, 3, userId, sessionId)
    const additionalContext = '' // similarDocs.map(doc => doc.content).join('\n\n')
    // console.log('Documents similaires trouvés:', similarDocs.length)

    // Récupérer l'historique des messages récents
    // const { data: recentMessages } = await getSupabaseClient()
    //   .from('messages')
    //   .select('*')
    //   .eq('session_id', sessionId)
    //   .order('timestamp', { ascending: false })
    //   .limit(10)

    const messageHistory = [] // recentMessages?.reverse() || []

    // Construire le prompt avec contexte
    const systemPrompt = `Tu es un assistant IA avec accès à un terminal Linux connecté à internet. 
Tu peux exécuter des commandes pour rechercher des informations, analyser des données, ou effectuer des tâches.

Contexte pertinent des conversations précédentes:
${context}

Instructions:
- Utilise le terminal quand c'est nécessaire pour obtenir des informations actualisées
- Sois précis et utile dans tes réponses
- Explique tes actions quand tu utilises le terminal`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...messageHistory.slice(-8).map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ]

    // Analyser si une commande terminal est nécessaire
    const needsTerminal = await analyzeNeedsTerminal(message, getOpenAIClient())
    
    let assistantResponse = ''
    let executionData = null
    let cost = 0
    let duration = 0
    const startTime = Date.now()

    if (needsTerminal) {
      // Générer et exécuter la commande
      const command = await generateCommand(message, context, getOpenAIClient())
      
      if (command) {
        try {
          executionData = await e2bService.executeCommand(command, 'default', userId)
          cost += executionData.cost || 0
          
          // Mettre à jour les statistiques E2B
          const stats = await e2bService.getUsageStats(userId)
          if (stats) {
            await e2bService.updateE2BStats(userId, {
              totalExecutions: stats.totalExecutions + 1,
              totalCost: stats.totalCost + cost,
              avgDuration: (stats.averageDuration * stats.totalExecutions + duration) / (stats.totalExecutions + 1),
              lastUsed: new Date().toISOString()
            })
          }
          
          // Générer la réponse avec les résultats du terminal
          const responseWithResults = await getOpenAIClient().chat.completions.create({
            model: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini',
            messages: [
              ...messages,
              {
                role: 'system',
                content: `Résultats de la commande "${command}":

Sortie:
${executionData.output}

Erreurs:
${executionData.error || 'Aucune'}

Code de sortie: ${executionData.exit_code}

${additionalContext ? `Documents similaires pertinents:\n${additionalContext}\n\n` : ''}Analyse ces résultats et fournis une réponse utile à l'utilisateur. Utilise le contexte et les documents similaires pour fournir des réponses plus complètes et cohérentes.`
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          })

          assistantResponse = responseWithResults.choices[0]?.message?.content || 'Erreur lors de la génération de la réponse'
          cost += (responseWithResults.usage?.total_tokens || 0) * 0.00003 // Estimation coût GPT-4
        } catch (error) {
          console.error('Erreur lors de l\'exécution:', error)
          assistantResponse = `Erreur lors de l'exécution de la commande: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
        }
      }
    } else {
      // Réponse directe sans terminal
      const response = await getOpenAIClient().chat.completions.create({
        model: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 1000
      })

      assistantResponse = response.choices[0]?.message?.content || 'Erreur lors de la génération de la réponse'
      cost += (response.usage?.total_tokens || 0) * 0.00003
    }

    duration = Math.round((Date.now() - startTime) / 1000)

    // Sauvegarder la réponse de l'assistant (temporairement désactivé pour test)
    // const assistantMessage = {
    //   session_id: sessionId,
    //   role: 'assistant',
    //   content: assistantResponse,
    //   created_at: new Date().toISOString(),
    //   metadata: {
    //     cost,
    //     duration,
    //     taskId: executionData?.id,
    //     hasTerminalOutput: !!executionData
    //   }
    // }

    // const { data: savedAssistantMessage, error: assistantMessageError } = await getSupabaseClient()
    //   .from('messages')
    //   .insert(assistantMessage)
    //   .select()
    //   .single()

    // if (assistantMessageError) {
    //   throw new Error(`Erreur lors de la sauvegarde de la réponse: ${assistantMessageError.message}`)
    // }

    // Sauvegarder dans le système RAG
    // await ragService.addDocument(
    //   `Q: ${message}\nR: ${assistantResponse}`,
    //   {
    //     sessionId,
    //     userId,
    //     timestamp: new Date().toISOString(),
    //     type: 'conversation'
    //   }
    // )
    
    // Si des résultats de terminal sont disponibles, les ajouter comme document RAG
    // if (executionData && executionData.output) {
    //   await ragService.addDocument(
    //     `Commande exécutée: ${executionData.command || 'N/A'}\n\nRésultat:\n${executionData.output}`,
    //     {
    //       sessionId,
    //       userId,
    //       timestamp: new Date().toISOString(),
    //       type: 'terminal_execution'
    //     }
    //   )
    // }

    // Mettre à jour la session
    // await getSupabaseClient()
    //   .from('user_sessions')
    //   .update({ 
    //     updated_at: new Date().toISOString(),
    //     message_count: session.message_count + 2
    //   })
    //   .eq('id', sessionId)

    res.json({
      success: true,
      message: {
        id: 'test-' + Date.now(),
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date().toISOString(),
        metadata: {
          cost,
          duration,
          hasTerminalOutput: !!executionData
        }
      }
    })

  } catch (error) {
    console.error('Erreur dans l\'API chat:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne du serveur'
    })
  }
})

// Fonction pour analyser si le terminal est nécessaire
async function analyzeNeedsTerminal(message: string, openai: OpenAI): Promise<boolean> {
  const analysisPrompt = `Analyse ce message et détermine s'il nécessite l'utilisation d'un terminal Linux pour obtenir des informations actualisées, effectuer des calculs, ou exécuter des commandes.

Message: "${message}"

Réponds uniquement par "OUI" ou "NON".

Exemples qui nécessitent le terminal:
- Rechercher des informations actuelles sur internet
- Vérifier des sites web
- Effectuer des calculs complexes
- Analyser des données
- Télécharger ou traiter des fichiers

Exemples qui ne nécessitent pas le terminal:
- Questions générales
- Explications de concepts
- Conversations normales
- Demandes d'aide ou de conseils`

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0,
      max_tokens: 10
    })

    const answer = response.choices[0]?.message?.content?.trim().toUpperCase()
    return answer === 'OUI'
  } catch (error) {
    console.error('Erreur lors de l\'analyse:', error)
    return false
  }
}

// Fonction pour générer une commande appropriée
async function generateCommand(message: string, context: string, openai: OpenAI): Promise<string | null> {
  const commandPrompt = `Génère une commande Linux sécurisée pour répondre à cette demande.

Demande: "${message}"

Contexte: ${context}

Règles:
- Utilise uniquement des commandes sécurisées (curl, wget, python3, node, etc.)
- Évite les commandes système dangereuses
- Privilégie les outils de recherche et d'analyse
- Une seule commande par réponse
- Pas de commandes interactives

Exemples:
- Pour rechercher: curl -s "https://api.example.com/search?q=terme"
- Pour analyser: python3 -c "import requests; print(requests.get('url').text)"
- Pour calculer: python3 -c "print(2+2)"

Réponds uniquement avec la commande, sans explication.`

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: commandPrompt }],
      temperature: 0.3,
      max_tokens: 200
    })

    const command = response.choices[0]?.message?.content?.trim()
    return command || null
  } catch (error) {
    console.error('Erreur lors de la génération de commande:', error)
    return null
  }
}