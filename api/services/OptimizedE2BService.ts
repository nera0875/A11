import { CodeInterpreter } from '@e2b/code-interpreter'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { E2BStats, SandboxExecution } from '../../src/types/app'

interface E2BExecutionResult {
  logs: { line: string }[]
  error?: { name: string; value: string }
  results: any[]
}

interface ExecutionResult {
  id: string
  command: string
  output: string
  success: boolean
  error?: string
  duration: number
  cost: number
  timestamp: string
}

interface SandboxConfig {
  template: string
  timeout: number
  maxMemory: number
  maxCpu: number
}

export class OptimizedE2BService {
  private static instance: OptimizedE2BService
  private supabase: SupabaseClient | null = null
  private activeSandboxes: Map<string, { sandbox: CodeInterpreter; createdAt: number }> = new Map()
  private readonly defaultConfig: SandboxConfig = {
    template: 'base',
    timeout: 300000, // 5 minutes
    maxMemory: 512, // 512MB
    maxCpu: 1 // 1 CPU
  }
  private readonly costPerSecond = 0.0001 // Coût estimé par seconde
  private readonly maxIdleTime = 180000 // 3 minutes d'inactivité max

  private constructor() {
    // Nettoyage automatique des sandboxes inactives
    setInterval(() => {
      this.cleanupIdleSandboxes()
    }, 60000) // Vérification chaque minute
  }

  public static getInstance(): OptimizedE2BService {
    if (!OptimizedE2BService.instance) {
      OptimizedE2BService.instance = new OptimizedE2BService()
    }
    return OptimizedE2BService.instance
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
   * Exécute une commande dans un sandbox optimisé
   */
  public async executeCommand(
    command: string,
    sessionId: string,
    userId: string,
    config?: Partial<SandboxConfig>
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let sandbox: CodeInterpreter
    let isNewSandbox = false

    try {
      // Réutiliser un sandbox existant ou en créer un nouveau
      const sandboxKey = `${userId}_${sessionId}`
      const existingSandbox = this.activeSandboxes.get(sandboxKey)

      if (existingSandbox && this.isSandboxValid(existingSandbox)) {
        sandbox = existingSandbox.sandbox
        console.log(`Réutilisation du sandbox pour ${sandboxKey}`)
      } else {
        // Nettoyer l'ancien sandbox s'il existe
        if (existingSandbox) {
          await this.destroySandbox(sandboxKey)
        }

        // Créer un nouveau sandbox
         const finalConfig = { ...this.defaultConfig, ...config }
         sandbox = await CodeInterpreter.create({
          timeout: config?.timeout || 300000,
          metadata: {
            userId,
            sessionId,
            createdAt: new Date().toISOString()
          }
        })

        this.activeSandboxes.set(sandboxKey, {
          sandbox,
          createdAt: Date.now()
        })
        isNewSandbox = true
        console.log(`Nouveau sandbox créé pour ${sandboxKey}`)
      }

      // Exécuter la commande
      let hasError = false
      let errorMessage = ''
      let outputData = ''
      
      const result = await sandbox.process.start({
        cmd: command,
        onStdout: (data) => {
          console.log('STDOUT:', data)
          outputData += data
        },
        onStderr: (data) => {
          console.error('STDERR:', data)
          hasError = true
          errorMessage += data
        }
      })

      await result.finished

      const endTime = Date.now()
      const duration = endTime - startTime
      const cost = this.calculateCost(duration, isNewSandbox)

      const executionResult: ExecutionResult = {
        id: executionId,
        command,
        output: outputData,
        error: hasError ? errorMessage : undefined,
        success: !hasError,
        duration,
        cost,
        timestamp: new Date().toISOString()
      }

      // Enregistrer l'exécution dans Supabase
      await this.recordExecution(userId, command, executionResult.output, cost, duration)

      return executionResult

    } catch (error) {
      const endTime = Date.now()
      const duration = endTime - startTime
      const cost = this.calculateCost(duration, isNewSandbox)

      const executionResult: ExecutionResult = {
        id: executionId,
        command,
        output: '',
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        success: false,
        duration,
        cost,
        timestamp: new Date().toISOString()
      }

      // Enregistrer l'échec dans Supabase
      await this.recordFailure(userId, command, error)

      throw error
    }
  }

  /**
   * Détruit un sandbox spécifique
   */
  public async destroySandbox(sandboxKey: string): Promise<void> {
    const sandboxData = this.activeSandboxes.get(sandboxKey)
    if (sandboxData) {
      try {
        await sandboxData.sandbox.close()
        console.log(`Sandbox ${sandboxKey} détruit avec succès`)
      } catch (error) {
        console.error(`Erreur lors de la destruction du sandbox ${sandboxKey}:`, error)
      } finally {
        this.activeSandboxes.delete(sandboxKey)
      }
    }
  }

  /**
   * Détruit tous les sandboxes d'un utilisateur
   */
  public async destroyUserSandboxes(userId: string): Promise<void> {
    const userSandboxes = Array.from(this.activeSandboxes.keys())
      .filter(key => key.startsWith(`${userId}_`))

    await Promise.all(
      userSandboxes.map(key => this.destroySandbox(key))
    )
  }



  /**
   * Vérifie si un sandbox est encore valide
   */
  private isSandboxValid(sandboxData: { sandbox: CodeInterpreter; createdAt: number }): boolean {
    const now = Date.now()
    return (now - sandboxData.createdAt) < this.maxIdleTime
  }

  /**
   * Calcule le coût d'une exécution
   */
  public calculateCost(duration: number, isNewSandbox: boolean): number {
    const baseCost = (duration / 1000) * this.costPerSecond
    const creationCost = isNewSandbox ? 0.001 : 0 // Coût de création
    return Math.round((baseCost + creationCost) * 10000) / 10000 // Arrondi à 4 décimales
  }

  /**
   * Enregistre une exécution réussie dans Supabase
   */
  public async recordExecution(
    userId: string,
    command: string,
    output: string,
    cost: number,
    duration: number
  ): Promise<void> {
    try {
      const executionData = {
        id: crypto.randomUUID(),
        sandbox_id: 'default',
        commands: [command],
        output: output,
        duration: duration,
        cost: cost,
        success: true,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString()
      }

      await this.getSupabaseClient()
        .from('sandbox_executions')
        .insert(executionData)

    } catch (error) {
      console.error('Erreur lors de l\'enregistrement de l\'exécution:', error)
    }
  }

  /**
   * Enregistre un échec d'exécution dans Supabase
   */
  public async recordFailure(
    userId: string,
    command: string,
    error: unknown
  ): Promise<void> {
    try {
      const executionData = {
        id: crypto.randomUUID(),
        sandbox_id: 'default',
        commands: [command],
        output: error instanceof Error ? error.message : 'Erreur inconnue',
        duration: 0,
        cost: 0,
        success: false,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString()
      }

      await this.getSupabaseClient()
        .from('sandbox_executions')
        .insert(executionData)

    } catch (dbError) {
      console.error('Erreur lors de l\'enregistrement de l\'échec:', dbError)
    }
  }

  /**
   * Obtient les statistiques d'utilisation
   */
  public async getUsageStats(userId: string, sessionId?: string): Promise<{
    totalExecutions: number
    totalCost: number
    averageDuration: number
    successRate: number
  }> {
    try {
      let query = this.getSupabaseClient()
        .from('sandbox_executions')
        .select('*')
        .eq('user_id', userId)

      if (sessionId) {
        query = query.eq('session_id', sessionId)
      }

      const { data: executions, error } = await query

      if (error) throw error

      const totalExecutions = executions?.length || 0
      const totalCost = executions?.reduce((sum, exec) => sum + (exec.cost_usd || 0), 0) || 0
      const averageDuration = executions?.reduce((sum, exec) => sum + (exec.duration_ms || 0), 0) / totalExecutions || 0
      const successfulExecutions = executions?.filter(exec => exec.status === 'success').length || 0
      const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0

      return {
        totalExecutions,
        totalCost: Math.round(totalCost * 10000) / 10000,
        averageDuration: Math.round(averageDuration),
        successRate: Math.round(successRate * 100) / 100
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error)
      return {
        totalExecutions: 0,
        totalCost: 0,
        averageDuration: 0,
        successRate: 0
      }
    }
  }

  /**
   * Met à jour les statistiques E2B dans la base de données
   */
  public async updateE2BStats(userId: string, stats: {
     totalExecutions: number
     totalCost: number
     avgDuration: number
     lastUsed: string
   }): Promise<void> {
     try {
       const { error } = await this.getSupabaseClient().rpc('update_e2b_stats', {
         p_user_id: userId,
         p_total_executions: stats.totalExecutions,
         p_total_cost: stats.totalCost,
         p_avg_duration: stats.avgDuration,
         p_last_used: stats.lastUsed
       })

      if (error) {
        console.error('Erreur lors de la mise à jour des stats E2B:', error)
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour des stats E2B:', error)
    }
  }

  /**
   * Enregistre un sandbox actif
   */
  public async registerActiveSandbox(userId: string, sandboxId: string): Promise<void> {
     try {
       const { error } = await this.getSupabaseClient()
         .from('active_sandboxes')
         .upsert({
           user_id: userId,
           sandbox_id: sandboxId,
           created_at: new Date().toISOString(),
           last_used: new Date().toISOString()
         })

      if (error) {
        console.error('Erreur lors de l\'enregistrement du sandbox:', error)
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du sandbox:', error)
    }
  }

  /**
   * Supprime un sandbox actif
   */
  public async unregisterActiveSandbox(sandboxId: string): Promise<void> {
     try {
       const { error } = await this.getSupabaseClient()
         .from('active_sandboxes')
         .delete()
         .eq('sandbox_id', sandboxId)

      if (error) {
        console.error('Erreur lors de la suppression du sandbox:', error)
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du sandbox:', error)
    }
  }

  /**
   * Nettoie automatiquement les sandboxes inactifs
   */
  public async cleanupIdleSandboxes(): Promise<void> {
    // Nettoie les sandboxes en mémoire
    const now = Date.now()
    for (const [sandboxId, sandboxData] of this.activeSandboxes.entries()) {
      if (now - sandboxData.createdAt > this.maxIdleTime) {
        try {
          await sandboxData.sandbox.close()
          this.activeSandboxes.delete(sandboxId)
          await this.unregisterActiveSandbox(sandboxId)
        } catch (error) {
          console.error(`Erreur lors de la fermeture du sandbox ${sandboxId}:`, error)
        }
      }
    }
    
    // Nettoie aussi la base de données
    await this.cleanupIdleSandboxesFromDB()
  }

  /**
   * Nettoie automatiquement les sandboxes inactifs dans la DB
   */
  public async cleanupIdleSandboxesFromDB(): Promise<void> {
     try {
       const { error } = await this.getSupabaseClient().rpc('cleanup_idle_sandboxes', {
         idle_threshold_minutes: this.maxIdleTime / (1000 * 60)
       })

      if (error) {
        console.error('Erreur lors du nettoyage des sandboxes:', error)
      } else {
        console.log('Nettoyage automatique des sandboxes effectué')
      }
    } catch (error) {
      console.error('Erreur lors du nettoyage des sandboxes:', error)
    }
  }
}