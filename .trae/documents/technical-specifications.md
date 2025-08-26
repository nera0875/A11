# Spécifications Techniques Détaillées

## 1. Configuration Environnement

### 1.1 Variables d'Environnement

```bash
# .env.local
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...

# E2B
E2B_API_KEY=e2b_...
E2B_TEMPLATE_ID=base

# Application
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000
APP_ENV=development

# Monitoring
SENTRY_DSN=https://...
VERCEL_ANALYTICS_ID=...

# Limites
MAX_CONCURRENT_SANDBOXES=10
MAX_SANDBOX_DURATION=300000
MAX_MONTHLY_COST_PER_USER=50.00
DEFAULT_TIMEOUT_MS=60000
```

### 1.2 Configuration Next.js

```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
    serverComponentsExternalPackages: ['@e2b/sdk']
  },
  
  // Optimisations bundle
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },
  
  // Headers sécurité
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ]
  },
  
  // Redirections
  async redirects() {
    return [
      {
        source: '/',
        destination: '/chat',
        permanent: false,
      },
    ]
  }
}

module.exports = nextConfig
```

## 2. Services Core

### 2.1 Service E2B Optimisé

```typescript
// lib/e2b/optimized-service.ts
import { Sandbox } from '@e2b/sdk'
import { createClient } from '@supabase/supabase-js'

interface SandboxConfig {
  template: string
  timeoutMs: number
  metadata?: Record<string, any>
}

interface ExecutionResult {
  success: boolean
  output: string
  error?: string
  duration: number
  cost: number
}

class OptimizedE2BService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  private activeSandboxes = new Map<string, {
    sandbox: Sandbox
    startTime: number
    taskId: string
    estimatedCost: number
  }>()
  
  // Coûts E2B (approximatifs)
  private readonly COST_PER_SECOND = 0.000028 // $0.000028/seconde
  private readonly CREATION_COST = 0.0001 // Coût fixe création
  
  async createSandbox(taskId: string, config: SandboxConfig): Promise<string> {
    const startTime = Date.now()
    
    try {
      console.log(`[E2B] Creating sandbox for task ${taskId}`)
      
      const sandbox = await Sandbox.create({
        template: config.template || 'base',
        metadata: {
          taskId,
          createdAt: new Date().toISOString(),
          ...config.metadata
        }
      })
      
      // Enregistrement pour tracking
      this.activeSandboxes.set(taskId, {
        sandbox,
        startTime,
        taskId,
        estimatedCost: this.CREATION_COST
      })
      
      // Timeout de sécurité
      setTimeout(() => {
        this.forceDestroy(taskId, 'timeout')
      }, config.timeoutMs)
      
      console.log(`[E2B] Sandbox created: ${sandbox.id} (${Date.now() - startTime}ms)`)
      return sandbox.id
      
    } catch (error) {
      console.error(`[E2B] Sandbox creation failed:`, error)
      await this.recordFailure(taskId, 'creation_failed', Date.now() - startTime)
      throw new Error(`Sandbox creation failed: ${error.message}`)
    }
  }
  
  async executeCommand(
    taskId: string, 
    command: string, 
    timeoutMs = 30000
  ): Promise<ExecutionResult> {
    const sandboxInfo = this.activeSandboxes.get(taskId)
    if (!sandboxInfo) {
      throw new Error(`Sandbox not found for task ${taskId}`)
    }
    
    const startTime = Date.now()
    
    try {
      console.log(`[E2B] Executing: ${command}`)
      
      const result = await Promise.race([
        sandboxInfo.sandbox.terminal.exec(command),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Command timeout')), timeoutMs)
        )
      ]) as any
      
      const duration = Date.now() - startTime
      const commandCost = (duration / 1000) * this.COST_PER_SECOND
      
      // Mise à jour coût estimé
      sandboxInfo.estimatedCost += commandCost
      
      const executionResult: ExecutionResult = {
        success: result.exitCode === 0,
        output: result.stdout || result.stderr || '',
        error: result.exitCode !== 0 ? result.stderr : undefined,
        duration,
        cost: commandCost
      }
      
      // Log pour debugging
      console.log(`[E2B] Command completed: ${command} (${duration}ms, $${commandCost.toFixed(6)})`)
      
      return executionResult
      
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`[E2B] Command failed: ${command}`, error)
      
      return {
        success: false,
        output: '',
        error: error.message,
        duration,
        cost: (duration / 1000) * this.COST_PER_SECOND
      }
    }
  }
  
  async destroySandbox(taskId: string, reason = 'completed'): Promise<{
    totalCost: number
    totalDuration: number
    commandsExecuted: number
  }> {
    const sandboxInfo = this.activeSandboxes.get(taskId)
    if (!sandboxInfo) {
      console.warn(`[E2B] Sandbox ${taskId} not found for destruction`)
      return { totalCost: 0, totalDuration: 0, commandsExecuted: 0 }
    }
    
    try {
      const totalDuration = Date.now() - sandboxInfo.startTime
      const totalCost = sandboxInfo.estimatedCost
      
      // Destruction immédiate
      await sandboxInfo.sandbox.close()
      
      // Enregistrement en base
      await this.recordExecution(taskId, {
        sandboxId: sandboxInfo.sandbox.id,
        totalDuration,
        totalCost,
        reason,
        success: reason === 'completed'
      })
      
      // Nettoyage mémoire
      this.activeSandboxes.delete(taskId)
      
      console.log(`[E2B] Sandbox destroyed: ${sandboxInfo.sandbox.id} (${reason}, ${totalDuration}ms, $${totalCost.toFixed(6)})`)
      
      return {
        totalCost,
        totalDuration,
        commandsExecuted: 0 // À implémenter si nécessaire
      }
      
    } catch (error) {
      console.error(`[E2B] Sandbox destruction failed:`, error)
      // Force cleanup même en cas d'erreur
      this.activeSandboxes.delete(taskId)
      throw error
    }
  }
  
  async forceDestroy(taskId: string, reason: string) {
    console.warn(`[E2B] Force destroying sandbox ${taskId}: ${reason}`)
    try {
      await this.destroySandbox(taskId, reason)
    } catch (error) {
      console.error(`[E2B] Force destruction failed:`, error)
    }
  }
  
  private async recordExecution(taskId: string, data: any) {
    try {
      await this.supabase.from('sandbox_executions').insert({
        task_id: taskId,
        sandbox_id: data.sandboxId,
        duration: data.totalDuration / 1000, // en secondes
        cost: data.totalCost,
        started_at: new Date(Date.now() - data.totalDuration).toISOString(),
        ended_at: new Date().toISOString(),
        commands: [], // À implémenter
        output: data.reason
      })
    } catch (error) {
      console.error('[E2B] Failed to record execution:', error)
    }
  }
  
  private async recordFailure(taskId: string, reason: string, duration: number) {
    try {
      await this.supabase.from('sandbox_executions').insert({
        task_id: taskId,
        sandbox_id: 'failed',
        duration: duration / 1000,
        cost: 0,
        started_at: new Date(Date.now() - duration).toISOString(),
        ended_at: new Date().toISOString(),
        commands: [],
        output: `FAILED: ${reason}`
      })
    } catch (error) {
      console.error('[E2B] Failed to record failure:', error)
    }
  }
  
  // Méthodes utilitaires
  getActiveSandboxes(): string[] {
    return Array.from(this.activeSandboxes.keys())
  }
  
  getTotalEstimatedCost(): number {
    return Array.from(this.activeSandboxes.values())
      .reduce((sum, info) => sum + info.estimatedCost, 0)
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      // Test création/destruction rapide
      const testSandbox = await Sandbox.create({ template: 'base' })
      await testSandbox.close()
      return true
    } catch (error) {
      console.error('[E2B] Health check failed:', error)
      return false
    }
  }
}

export const e2bService = new OptimizedE2BService()
```

### 2.2 Service RAG avec Supabase

```typescript
// lib/supabase/rag-service.ts
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

interface SearchResult {
  taskId: string
  query: string
  similarity: number
  results: any[]
  createdAt: string
}

interface CacheResult {
  cached: boolean
  results?: any[]
  similarity?: number
  savedCost?: number
}

class RAGService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!
  })
  
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000), // Limite tokens
        encoding_format: 'float'
      })
      
      return response.data[0].embedding
    } catch (error) {
      console.error('[RAG] Embedding generation failed:', error)
      throw new Error(`Failed to generate embedding: ${error.message}`)
    }
  }
  
  async searchSimilarTasks(
    query: string, 
    userId: string, 
    threshold = 0.8
  ): Promise<SearchResult[]> {
    try {
      // Génération embedding requête
      const queryEmbedding = await this.generateEmbedding(query)
      
      // Recherche dans Supabase
      const { data, error } = await this.supabase.rpc('search_similar_tasks', {
        query_embedding: queryEmbedding,
        user_id_param: userId,
        similarity_threshold: threshold,
        max_results: 5
      })
      
      if (error) {
        console.error('[RAG] Search failed:', error)
        return []
      }
      
      // Récupération résultats détaillés
      const enrichedResults = await Promise.all(
        data.map(async (item: any) => {
          const results = await this.getTaskResults(item.task_id)
          return {
            taskId: item.task_id,
            query: item.query,
            similarity: item.similarity,
            results,
            createdAt: item.created_at
          }
        })
      )
      
      return enrichedResults
      
    } catch (error) {
      console.error('[RAG] Similar search failed:', error)
      return []
    }
  }
  
  async checkCache(query: string, userId: string): Promise<CacheResult> {
    try {
      const similarTasks = await this.searchSimilarTasks(query, userId, 0.85)
      
      if (similarTasks.length > 0) {
        const bestMatch = similarTasks[0]
        
        // Vérification fraîcheur
        const isRecent = this.isResultRecent(bestMatch.createdAt, query)
        
        if (isRecent && bestMatch.similarity > 0.9) {
          console.log(`[RAG] Cache hit: ${bestMatch.similarity.toFixed(3)} similarity`)
          
          return {
            cached: true,
            results: bestMatch.results,
            similarity: bestMatch.similarity,
            savedCost: 0.01 // Estimation coût évité
          }
        }
      }
      
      return { cached: false }
      
    } catch (error) {
      console.error('[RAG] Cache check failed:', error)
      return { cached: false }
    }
  }
  
  async saveTaskResults(
    taskId: string,
    query: string,
    results: any[],
    userId: string
  ): Promise<void> {
    try {
      // Génération embedding
      const queryEmbedding = await this.generateEmbedding(query)
      
      // Sauvegarde tâche
      const { error: taskError } = await this.supabase
        .from('research_tasks')
        .update({
          query_embedding: queryEmbedding,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId)
      
      if (taskError) {
        console.error('[RAG] Task update failed:', taskError)
      }
      
      // Sauvegarde résultats avec embeddings
      for (const result of results) {
        const contentText = this.extractTextFromResult(result)
        const contentEmbedding = await this.generateEmbedding(contentText)
        
        const { error: resultError } = await this.supabase
          .from('task_results')
          .insert({
            task_id: taskId,
            result_type: result.type || 'text',
            content: result,
            content_embedding: contentEmbedding,
            metadata: {
              extractedText: contentText.substring(0, 500),
              savedAt: new Date().toISOString()
            }
          })
        
        if (resultError) {
          console.error('[RAG] Result save failed:', resultError)
        }
      }
      
      console.log(`[RAG] Saved ${results.length} results for task ${taskId}`)
      
    } catch (error) {
      console.error('[RAG] Save failed:', error)
    }
  }
  
  private async getTaskResults(taskId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('task_results')
      .select('content')
      .eq('task_id', taskId)
    
    if (error) {
      console.error('[RAG] Get results failed:', error)
      return []
    }
    
    return data.map(item => item.content)
  }
  
  private isResultRecent(createdAt: string, query: string): boolean {
    const age = Date.now() - new Date(createdAt).getTime()
    const maxAge = this.getMaxCacheAge(query)
    return age < maxAge
  }
  
  private getMaxCacheAge(query: string): number {
    // Durée cache basée sur type de requête
    const lowerQuery = query.toLowerCase()
    
    if (lowerQuery.includes('temps réel') || lowerQuery.includes('actualité')) {
      return 30 * 60 * 1000 // 30 minutes
    }
    
    if (lowerQuery.includes('prix') || lowerQuery.includes('cours')) {
      return 2 * 60 * 60 * 1000 // 2 heures
    }
    
    return 24 * 60 * 60 * 1000 // 24 heures par défaut
  }
  
  private extractTextFromResult(result: any): string {
    if (typeof result === 'string') return result
    if (result.content) return String(result.content)
    if (result.text) return String(result.text)
    return JSON.stringify(result).substring(0, 1000)
  }
}

export const ragService = new RAGService()
```

### 2.3 Service de Planification LLM

```typescript
// lib/openai/planning-service.ts
import OpenAI from 'openai'

interface ExecutionPlan {
  estimatedDuration: number
  estimatedCost: number
  commands: Command[]
  fallbackStrategy: string
  riskLevel: 'low' | 'medium' | 'high'
}

interface Command {
  step: number
  command: string
  description: string
  timeout: number
  retryable: boolean
  expectedOutput?: string
}

class PlanningService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!
  })
  
  async generateExecutionPlan(
    query: string, 
    context: string[] = [],
    userPreferences: any = {}
  ): Promise<ExecutionPlan> {
    const prompt = this.buildPlanningPrompt(query, context, userPreferences)
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert en optimisation de commandes Linux pour des tâches de recherche et d\'analyse. Génère des plans d\'exécution efficaces et sécurisés.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })
      
      const planText = response.choices[0].message.content
      const plan = this.parsePlanFromResponse(planText)
      
      // Validation et optimisation
      const validatedPlan = this.validateAndOptimizePlan(plan)
      
      console.log(`[Planning] Generated plan: ${validatedPlan.commands.length} commands, ~${validatedPlan.estimatedDuration}s, ~$${validatedPlan.estimatedCost.toFixed(4)}`)
      
      return validatedPlan
      
    } catch (error) {
      console.error('[Planning] Plan generation failed:', error)
      throw new Error(`Failed to generate execution plan: ${error.message}`)
    }
  }
  
  private buildPlanningPrompt(query: string, context: string[], preferences: any): string {
    return `
Analyse cette requête et génère un plan d'exécution Linux optimisé :

**Requête**: ${query}

**Contexte précédent**: ${context.join(', ') || 'Aucun'}

**Contraintes d'optimisation** :
1. Temps d'exécution < 3 minutes (idéalement < 1 minute)
2. Coût E2B < $0.01 par requête
3. Commandes efficaces (curl, jq, python one-liners, awk, sed)
4. Éviter installations lourdes (apt install, pip install)
5. Parallélisation quand possible (& pour background)
6. Gestion erreurs gracieuse (|| pour fallbacks)
7. Sécurité (pas de sudo, rm -rf, chmod 777)

**Outils disponibles** :
- curl, wget (requêtes HTTP)
- jq (parsing JSON)
- python3 (scripts courts)
- node (JavaScript)
- git (clonage repos)
- sqlite3 (base données)
- awk, sed, grep (text processing)

**Format de réponse JSON strict** :
\`\`\`json
{
  "estimatedDuration": 60,
  "estimatedCost": 0.002,
  "riskLevel": "low",
  "commands": [
    {
      "step": 1,
      "command": "curl -s 'https://api.example.com/data' | jq '.results'",
      "description": "Récupération données API",
      "timeout": 30,
      "retryable": true,
      "expectedOutput": "JSON array with results"
    }
  ],
  "fallbackStrategy": "Si échec API, utiliser scraping web avec curl + grep"
}
\`\`\`

**Exemples de bonnes commandes** :
- \`curl -s "https://api.github.com/repos/owner/repo" | jq '.stargazers_count'\`
- \`python3 -c "import requests; print(requests.get('url').json())"\`
- \`wget -qO- "https://example.com" | grep -oP 'pattern'\`
- \`echo "data" | awk '{print $2}' | sort | uniq -c\`

Génère maintenant le plan optimal :
`
  }
  
  private parsePlanFromResponse(response: string): ExecutionPlan {
    try {
      // Extraction du JSON de la réponse
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }
      
      const plan = JSON.parse(jsonMatch[1])
      
      // Validation structure
      if (!plan.commands || !Array.isArray(plan.commands)) {
        throw new Error('Invalid plan structure')
      }
      
      return {
        estimatedDuration: plan.estimatedDuration || 60,
        estimatedCost: plan.estimatedCost || 0.002,
        riskLevel: plan.riskLevel || 'medium',
        commands: plan.commands,
        fallbackStrategy: plan.fallbackStrategy || 'Manual fallback'
      }
      
    } catch (error) {
      console.error('[Planning] Parse failed:', error)
      
      // Plan de fallback basique
      return {
        estimatedDuration: 30,
        estimatedCost: 0.001,
        riskLevel: 'low',
        commands: [
          {
            step: 1,
            command: 'echo "Fallback: manual research required"',
            description: 'Fallback command',
            timeout: 5,
            retryable: false
          }
        ],
        fallbackStrategy: 'Manual research'
      }
    }
  }
  
  private validateAndOptimizePlan(plan: ExecutionPlan): ExecutionPlan {
    const issues: string[] = []
    
    // Validation durée
    if (plan.estimatedDuration > 180) {
      issues.push('Duration too long')
      plan.estimatedDuration = 180
    }
    
    // Validation coût
    if (plan.estimatedCost > 0.02) {
      issues.push('Cost too high')
      plan.estimatedCost = 0.02
    }
    
    // Validation commandes dangereuses
    const dangerousPatterns = ['rm -rf', 'sudo', 'chmod 777', '> /dev/', 'dd if=']
    
    plan.commands = plan.commands.filter(cmd => {
      const isDangerous = dangerousPatterns.some(pattern => 
        cmd.command.includes(pattern)
      )
      
      if (isDangerous) {
        issues.push(`Removed dangerous command: ${cmd.command}`)
        return false
      }
      
      return true
    })
    
    // Optimisation timeouts
    plan.commands.forEach(cmd => {
      if (!cmd.timeout || cmd.timeout > 60) {
        cmd.timeout = 30 // Timeout par défaut
      }
    })
    
    if (issues.length > 0) {
      console.warn('[Planning] Plan issues fixed:', issues)
    }
    
    return plan
  }
}

export const planningService = new PlanningService()
```

## 3. API Routes

### 3.1 Endpoint Principal de Recherche

```typescript
// app/api/research/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { e2bService } from '@/lib/e2b/optimized-service'
import { ragService } from '@/lib/supabase/rag-service'
import { planningService } from '@/lib/openai/planning-service'
import { v4 as uuidv4 } from 'uuid'

interface ResearchRequest {
  query: string
  context?: string[]
  options?: {
    maxDuration?: number
    budget?: number
    useCache?: boolean
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ResearchRequest = await request.json()
    const { query, context = [], options = {} } = body
    
    // Validation input
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }
    
    // Récupération utilisateur (à implémenter avec auth)
    const userId = 'user-123' // TODO: Récupérer depuis session
    
    // Génération ID tâche
    const taskId = uuidv4()
    
    console.log(`[API] Starting research task ${taskId}: ${query}`)
    
    // Vérification cache si activé
    if (options.useCache !== false) {
      const cacheResult = await ragService.checkCache(query, userId)
      if (cacheResult.cached) {
        console.log(`[API] Cache hit for task ${taskId}`)
        return NextResponse.json({
          taskId,
          status: 'completed',
          fromCache: true,
          results: cacheResult.results,
          similarity: cacheResult.similarity,
          cost: 0,
          duration: 0
        })
      }
    }
    
    // Création tâche en base
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    await supabase.from('research_tasks').insert({
      id: taskId,
      user_id: userId,
      query,
      status: 'planning',
      cost: 0
    })
    
    // Génération plan d'exécution
    const plan = await planningService.generateExecutionPlan(query, context)
    
    // Validation budget
    if (options.budget && plan.estimatedCost > options.budget) {
      return NextResponse.json(
        { 
          error: 'Estimated cost exceeds budget',
          estimatedCost: plan.estimatedCost,
          budget: options.budget
        },
        { status: 400 }
      )
    }
    
    // Mise à jour statut
    await supabase.from('research_tasks')
      .update({ 
        status: 'executing',
        execution_plan: plan
      })
      .eq('id', taskId)
    
    // Exécution asynchrone
    executeResearchTask(taskId, plan, userId, query)
      .catch(error => {
        console.error(`[API] Task ${taskId} failed:`, error)
      })
    
    return NextResponse.json({
      taskId,
      status: 'executing',
      estimatedDuration: plan.estimatedDuration,
      estimatedCost: plan.estimatedCost,
      commandsCount: plan.commands.length
    })
    
  } catch (error) {
    console.error('[API] Research request failed:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Fonction d'exécution asynchrone
async function executeResearchTask(
  taskId: string,
  plan: any,
  userId: string,
  query: string
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  let sandboxId: string | null = null
  const results: any[] = []
  let totalCost = 0
  
  try {
    // Création sandbox
    sandboxId = await e2bService.createSandbox(taskId, {
      template: 'base',
      timeoutMs: plan.estimatedDuration * 1000 + 30000 // +30s marge
    })
    
    // Exécution commandes
    for (const command of plan.commands) {
      console.log(`[Execution] Step ${command.step}: ${command.command}`)
      
      const result = await e2bService.executeCommand(
        taskId,
        command.command,
        command.timeout * 1000
      )
      
      totalCost += result.cost
      
      if (result.success && result.output) {
        results.push({
          step: command.step,
          command: command.command,
          output: result.output,
          duration: result.duration,
          type: 'command_result'
        })
      } else if (!result.success) {
        console.warn(`[Execution] Command failed: ${command.command} - ${result.error}`)
        
        if (!command.retryable) {
          break // Arrêt si commande critique échoue
        }
      }
    }
    
    // Destruction sandbox
    const executionStats = await e2bService.destroySandbox(taskId, 'completed')
    totalCost = executionStats.totalCost
    
    // Sauvegarde résultats avec RAG
    await ragService.saveTaskResults(taskId, query, results, userId)
    
    // Mise à jour finale
    await supabase.from('research_tasks')
      .update({
        status: 'completed',
        cost: totalCost,
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId)
    
    console.log(`[Execution] Task ${taskId} completed: ${results.length} results, $${totalCost.toFixed(6)}`)
    
  } catch (error) {
    console.error(`[Execution] Task ${taskId} failed:`, error)
    
    // Nettoyage en cas d'erreur
    if (sandboxId) {
      await e2bService.destroySandbox(taskId, 'error')
    }
    
    // Mise à jour statut erreur
    await supabase.from('research_tasks')
      .update({
        status: 'failed',
        cost: totalCost,
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId)
  }
}
```

### 3.2 Endpoint de Streaming

```typescript
// app/api/research/[taskId]/stream/route.ts
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const { taskId } = params
  
  // Configuration SSE
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    start(controller) {
      // Fonction pour envoyer des événements
      const sendEvent = (type: string, data: any) => {
        const event = `data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`
        controller.enqueue(encoder.encode(event))
      }
      
      // Polling de la base de données
      const pollInterval = setInterval(async () => {
        try {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          )
          
          // Récupération statut tâche
          const { data: task } = await supabase
            .from('research_tasks')
            .select('status, cost')
            .eq('id', taskId)
            .single()
          
          if (task) {
            sendEvent('status', {
              status: task.status,
              cost: task.cost
            })
            
            // Si terminé, envoyer résultats et fermer
            if (task.status === 'completed' || task.status === 'failed') {
              const { data: results } = await supabase
                .from('task_results')
                .select('content')
                .eq('task_id', taskId)
              
              sendEvent('results', results?.map(r => r.content) || [])
              sendEvent('complete', { status: task.status })
              
              clearInterval(pollInterval)
              controller.close()
            }
          }
          
        } catch (error) {
          console.error('[Stream] Polling error:', error)
          sendEvent('error', { message: error.message })
        }
      }, 1000) // Poll chaque seconde
      
      // Nettoyage après timeout
      setTimeout(() => {
        clearInterval(pollInterval)
        controller.close()
      }, 300000) // 5 minutes max
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

## 4. Composants Frontend

### 4.1 Interface Chat Mobile

```typescript
// components/chat/mobile-chat-interface.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Mic, Send, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  results?: any[]
  cost?: number
}

interface ChatInterfaceProps {
  userId: string
  onNewMessage?: (message: Message) => void
}

export function MobileChatInterface({ userId, onNewMessage }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Auto-scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    
    try {
      // Envoi requête API
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage.content,
          context: messages.slice(-3).map(m => m.content) // 3 derniers messages
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        // Message de confirmation
        const assistantMessage: Message = {
          id: data.taskId,
          role: 'assistant',
          content: `🔍 Recherche en cours... (${data.commandsCount} étapes, ~${data.estimatedDuration}s)`,
          timestamp: new Date()
        }
        
        setMessages(prev => [...prev, assistantMessage])
        
        // Écoute du streaming
        await streamResults(data.taskId, assistantMessage.id)
        
      } else {
        throw new Error(data.error || 'Erreur inconnue')
      }
      
    } catch (error) {
      console.error('Chat error:', error)
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ Erreur: ${error.message}`,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }
  
  const streamResults = async (taskId: string, messageId: string) => {
    const eventSource = new EventSource(`/api/research/${taskId}/stream`)
    
    eventSource.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data)
      
      switch (type) {
        case 'status':
          updateMessageContent(messageId, `🔄 ${data.status}... (coût: $${data.cost.toFixed(4)})`)
          break
          
        case 'results':
          updateMessageWithResults(messageId, data)
          break
          
        case 'complete':
          eventSource.close()
          break
          
        case 'error':
          updateMessageContent(messageId, `❌ Erreur: ${data.message}`)
          eventSource.close()
          break
      }
    }
    
    eventSource.onerror = () => {
      updateMessageContent(messageId, '❌ Connexion perdue')
      eventSource.close()
    }
  }
  
  const updateMessageContent = (messageId: string, content: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, content } : msg
    ))
  }
  
  const updateMessageWithResults = (messageId: string, results: any[]) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? {
        ...msg,
        content: `✅ Recherche terminée (${results.length} résultats)`,
        results
      } : msg
    ))
  }
  
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Reconnaissance vocale non supportée')
      return
    }
    
    const recognition = new (window as any).webkitSpeechRecognition()
    recognition.lang = 'fr-FR'
    recognition.continuous = false
    recognition.interimResults = false
    
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput(transcript)
    }
    
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
    }
    
    recognition.start()
  }
  
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <h1 className="text-xl font-semibold text-gray-900">
          Assistant IA Terminal
        </h1>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Card className={`max-w-[80%] p-3 ${
                message.role === 'user' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white text-gray-900'
              }`}>
                <div className="text-sm">
                  {message.content}
                </div>
                
                {message.results && (
                  <div className="mt-3 space-y-2">
                    {message.results.map((result, index) => (
                      <div key={index} className="bg-gray-100 p-2 rounded text-xs">
                        <div className="font-mono">{result.command}</div>
                        <div className="mt-1 text-gray-600">{result.output}</div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                  {message.cost && ` • $${message.cost.toFixed(4)}`}
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Posez votre question..."
            disabled={isLoading}
            className="flex-1"
          />
          
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleVoiceInput}
            disabled={isLoading || isListening}
            className={isListening ? 'bg-red-100 border-red-300' : ''}
          >
            <Mic className={`h-4 w-4 ${isListening ? 'text-red-500' : ''}`} />
          </Button>
          
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
```

## 5. Configuration de Déploiement

### 5.1 Vercel Configuration

```json
// vercel.json
{
  "functions": {
    "app/api/research/route.ts": {
      "maxDuration": 300
    },
    "app/api/research/[taskId]/stream/route.ts": {
      "maxDuration": 300
    }
  },
  "env": {
    "NODE_ENV": "production"
  },
  "build": {
    "env": {
      "NEXT_TELEMETRY_DISABLED": "1"
    }
  }
}
```

### 5.2 Package.json

```json
{
  "name": "ai-terminal-assistant",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "@e2b/sdk": "^0.16.0",
    "@supabase/supabase-js": "^2.38.0",
    "@radix-ui/react-slot": "^1.0.2",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "framer-motion": "^10.16.0",
    "lucide-react": "^0.294.0",
    "next": "14.0.0",
    "openai": "^4.20.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.8.0",
    "tailwind-merge": "^2.0.0",
    "tailwindcss-animate": "^1.0.7",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/node": "^20.8.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/uuid": "^9.0.7",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.51.0",
    "eslint-config-next": "14.0.0",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2"
  }
}
```

Cette documentation technique fournit tous les éléments nécessaires pour implémenter l'assistant IA mobile avec optimisations E2B et RAG Supabase. L'architecture est conçue pour minimiser les coûts tout en maximisant les performances et l'expérience utilisateur.