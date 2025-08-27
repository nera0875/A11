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

// Initialisation paresseuse d'OpenAI
let openaiClient: OpenAI | null = null
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY manquante dans les variables d\'environnement')
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
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

    // Vérifier l'authentification
    const { data: session, error: sessionError } = await getSupabaseClient()
      .from('user_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single()

    if (sessionError || !session) {
      return res.status(401).json({
        success: false,
        error: 'Session non trouvée ou non autorisée'
      })
    }

    // Sauvegarder le message utilisateur
    const userMessage = {
      session_id: sessionId,
      user_id: userId,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }

    const { data: savedUserMessage, error: userMessageError } = await getSupabaseClient()
      .from('messages')
      .insert(userMessage)
      .select()
      .single()

    if (userMessageError) {
      throw new Error(`Erreur lors de la sauvegarde du message: ${userMessageError.message}`)
    }

    // Recherche RAG pour le contexte
    const ragResults = await ragService.searchSimilar(message, 5, userId, sessionId)
    const context = ragResults.map(r => r.content).join('\n\n')
    
    // Rechercher des documents similaires pour enrichir le contexte
    const similarDocs = await ragService.searchSimilar(message, 3, userId, sessionId)
    const additionalContext = similarDocs.map(doc => doc.content).join('\n\n')
    console.log('Documents similaires trouvés:', similarDocs.length)

    // Récupérer l'historique des messages récents
    const { data: recentMessages } = await getSupabaseClient()
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(10)

    const messageHistory = recentMessages?.reverse() || []

    // Construire le prompt avec contexte
    const systemPrompt = `Tu es un assistant IA avec accès à un terminal Linux connecté à internet. 
Tu peux exécuter des commandes pour rechercher des informations, analyser des données, ou effectuer des tâches.

Contexte pertinent des conversations précédentes:
${context}

Informations supplémentaires sur l'utilisateur:
${additionalContext}

Instructions:
- Utilise le terminal quand c'est nécessaire pour obtenir des informations actualisées
- Sois précis et utile dans tes réponses
- Explique tes actions quand tu utilises le terminal
- Utilise le contexte et les informations sur l'utilisateur pour personnaliser tes réponses`

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
          // Utiliser le streaming pour l'exécution si disponible
          executionData = await e2bService.executeCommand(command, 'default', userId, undefined, {
            onStart: () => {
              console.log(`Début d'exécution: ${command}`)
            },
            onStdout: (data) => {
              console.log('STDOUT streaming:', data)
            },
            onStderr: (data) => {
              console.log('STDERR streaming:', data)
            },
            onComplete: (result) => {
              console.log('Exécution terminée:', result.id)
            },
            onError: (error) => {
              console.error('Erreur d\'exécution:', error)
            }
          })
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
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
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
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 1000
      })

      assistantResponse = response.choices[0]?.message?.content || 'Erreur lors de la génération de la réponse'
      cost += (response.usage?.total_tokens || 0) * 0.00003
    }

    duration = Math.round((Date.now() - startTime) / 1000)

    // Sauvegarder la réponse de l'assistant
    const assistantMessage = {
      session_id: sessionId,
      user_id: userId,
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date().toISOString(),
      metadata: {
        cost,
        duration,
        taskId: executionData?.id,
        hasTerminalOutput: !!executionData,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        tokens: 0 // Will be calculated if needed
      }
    }

    const { data: savedAssistantMessage, error: assistantMessageError } = await getSupabaseClient()
      .from('messages')
      .insert(assistantMessage)
      .select()
      .single()

    if (assistantMessageError) {
      throw new Error(`Erreur lors de la sauvegarde de la réponse: ${assistantMessageError.message}`)
    }

    // Sauvegarder dans le système RAG
    try {
      await ragService.addDocument(
        `Q: ${message}\nR: ${assistantResponse}`,
        {
          sessionId,
          userId,
          timestamp: new Date().toISOString(),
          type: 'conversation'
        }
      )
      
      // Si des résultats de terminal sont disponibles, les ajouter comme document RAG
      if (executionData && executionData.output) {
        await ragService.addDocument(
          `Commande exécutée: ${executionData.command || 'N/A'}\n\nRésultat:\n${executionData.output}`,
          {
            sessionId,
            userId,
            timestamp: new Date().toISOString(),
            type: 'terminal_execution'
          }
        )
      }
    } catch (ragError) {
      console.error('Erreur lors de la sauvegarde RAG:', ragError)
      // Ne pas faire échouer la requête si RAG échoue
    }

    // Mettre à jour la session
    await getSupabaseClient()
      .from('user_sessions')
      .update({ 
        updated_at: new Date().toISOString(),
        message_count: (session.message_count || 0) + 2
      })
      .eq('id', sessionId)

    res.json({
      success: true,
      response: assistantResponse,
      cost,
      ragResults: ragResults.length > 0 ? ragResults : undefined,
      terminalExecution: executionData || undefined,
      message: {
        id: savedAssistantMessage?.id || 'msg-' + Date.now(),
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date().toISOString(),
        metadata: {
          cost,
          duration,
          hasTerminalOutput: !!executionData,
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
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
- MÉTÉO: "météo Paris", "quel temps fait-il", "température aujourd'hui"
- EXÉCUTION DE CODE: "exécute ce script", "lance ce code", "run this", "execute dans le terminal"
- CODE PYTHON/JS: "écris et exécute un script Python", "teste ce code JavaScript", "crée un programme qui..."
- SCRIPTS: "crée un fichier et exécute-le", "génère et lance un script"
- CALCULS EN TEMPS RÉEL: "calcule", "combien fait", "résous cette équation"
- Rechercher des informations actuelles sur internet
- Vérifier des sites web ou leur statut
- Effectuer des calculs mathématiques
- Analyser des données ou fichiers
- Télécharger ou traiter des fichiers
- Tester la connectivité réseau
- Obtenir des informations système (date, heure, etc.)
- Tests de code en temps réel

Exemples qui ne nécessitent pas le terminal:
- Questions générales sur des concepts
- Explications théoriques
- Conversations normales
- Demandes d'aide ou de conseils
- Questions sur la programmation (sans exécution)
- Discussions philosophiques ou opinions
- Demandes de code sans exécution ("montre-moi un exemple de code")`

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
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
- Évite les commandes système dangereuses et le code Python complexe
- Privilégie curl avec des APIs simples plutôt que du Python
- Une seule commande par réponse
- Pas de commandes interactives
- Pour les erreurs, utilise des fallbacks simples

Exemples spécifiques:

MÉTÉO (utilise toujours wttr.in):
- Météo Paris: curl -s 'https://wttr.in/Paris?format=3'
- Météo détaillée: curl -s 'https://wttr.in/Paris?0&T&q&lang=fr'
- Météo autre ville: curl -s 'https://wttr.in/Londres?format=3'

RECHERCHE WEB:
- curl -s "https://httpbin.org/get" | head -20

CALCULS SIMPLES:
- echo "2+2" | bc
- python3 -c "print(2+2)"

EXÉCUTION DE CODE PYTHON:
- python3 -c "print('Hello')"
- python3 -c "import math; print(math.sqrt(16))"
- python3 -c "for i in range(5): print(f'Nombre: {i}')"

EXÉCUTION DE CODE JAVASCRIPT:
- node -e "console.log('Hello')"
- node -e "console.log(Math.sqrt(16))"

CRÉATION ET EXÉCUTION DE SCRIPTS:
- echo "print('Hello World')" > script.py && python3 script.py
- echo "console.log('Hello')" > script.js && node script.js

INFORMATIONS SYSTÈME:
- date
- uptime
- whoami

TEST CONNECTIVITÉ:
- ping -c 3 google.com
- curl -s -o /dev/null -w "%{http_code}" https://google.com

Réponds uniquement avec la commande, sans explication.`

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
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