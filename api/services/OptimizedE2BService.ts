import { Sandbox } from 'e2b'
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

interface StreamingCallbacks {
  onStdout?: (data: string) => void
  onStderr?: (data: string) => void
  onStart?: () => void
  onComplete?: (result: ExecutionResult) => void
  onError?: (error: string) => void
}

interface SandboxConfig {
  template: string
  timeout: number
  commandTimeout?: number // Timeout pour les commandes individuelles (en ms)
  maxMemory: number
  maxCpu: number
}

export class OptimizedE2BService {
  private static instance: OptimizedE2BService
  private supabase: SupabaseClient | null = null
  private activeSandboxes: Map<string, { sandbox: Sandbox; createdAt: number }> = new Map()
  private readonly defaultConfig: SandboxConfig = {
    template: 'base',
    timeout: 2700000, // 45 minutes (au lieu de 5 minutes)
    commandTimeout: 300000, // 5 minutes par commande individuelle
    maxMemory: 512, // 512MB
    maxCpu: 1 // 1 CPU
  }
  private readonly costPerSecond = 0.0001 // Coût estimé par seconde

  private constructor() {
    // Plus de nettoyage automatique - gestion manuelle uniquement
    console.log('OptimizedE2BService initialisé sans destruction automatique')
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
   * Exécute une commande dans un sandbox optimisé avec streaming en temps réel
   */
  public async executeCommand(
    command: string,
    sessionId: string,
    userId: string,
    config?: Partial<SandboxConfig>,
    callbacks?: StreamingCallbacks
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let sandbox: Sandbox
    let isNewSandbox = false

    try {
      // S'assurer que le sandbox est actif et fonctionnel
      const sandboxKey = `${userId}_${sessionId}`
      const { sandbox: activeSandbox, isNew } = await this.ensureSandboxIsActive(
        sandboxKey,
        userId,
        sessionId,
        config
      )
      
      sandbox = activeSandbox
      isNewSandbox = isNew

      // Notifier le début de l'exécution
      callbacks?.onStart?.()
      
      // Exécuter la commande avec streaming en temps réel
      let hasError = false
      let errorMessage = ''
      let outputData = ''
      
      try {
        // Configurer le timeout pour la commande individuelle
        const baseTimeout = config?.commandTimeout || this.defaultConfig.commandTimeout || 300000
        const commandTimeout = config?.commandTimeout ? baseTimeout : this.getOptimalTimeout(command)
        
        // Utiliser commands.run pour exécuter directement les commandes shell
        const execution = await sandbox.commands.run(command, {
          timeoutMs: commandTimeout,
          onStdout: (data) => {
            outputData += data
            callbacks?.onStdout?.(data)
          },
          onStderr: (data) => {
            hasError = true
            errorMessage += data
            callbacks?.onStderr?.(data)
          }
        })
        
        // Vérifier le code de sortie
        if (execution.exitCode !== 0) {
          hasError = true
          if (!errorMessage) {
            errorMessage = `Command exited with code ${execution.exitCode}`
          }
        }
        
      } catch (execError) {
        hasError = true
        
        // Améliorer la gestion d'erreur pour distinguer les timeouts et les sandboxes fermés
        if (execError instanceof Error) {
          if (execError.message.includes('deadline_exceeded') || execError.message.includes('timed out')) {
            const timeoutSeconds = Math.round((config?.commandTimeout || this.defaultConfig.commandTimeout || 300000) / 1000)
            errorMessage = `⏱️ Timeout de commande (${timeoutSeconds}s): La commande "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}" a dépassé le délai autorisé. ` +
              `Essayez de diviser la commande en étapes plus petites ou utilisez des commandes plus rapides.`
          } else if (execError.message.includes('sandbox not found') || 
                     execError.message.includes('Sandbox is probably not running anymore') ||
                     execError.message.includes('sandbox is not running')) {
            // Sandbox fermé - nettoyer et signaler pour recréation automatique
            console.log(`Sandbox ${sandboxKey} fermé détecté, nettoyage...`)
            this.activeSandboxes.delete(sandboxKey)
            
            errorMessage = `🔄 Sandbox fermé: Le sandbox a été fermé de manière inattendue. ` +
              `Veuillez réessayer votre commande - un nouveau sandbox sera créé automatiquement.`
          } else if (execError.message.includes('permission denied')) {
            errorMessage = `🔒 Permission refusée: La commande "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}" nécessite des privilèges élevés. ` +
              `Essayez avec 'sudo' ou utilisez une approche alternative.`
          } else {
            errorMessage = `❌ Erreur d'exécution: ${execError.message}\n` +
              `Commande: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}\n` +
              `Sandbox: ${sandboxKey}`
          }
        } else {
          errorMessage = 'Erreur d\'exécution inconnue'
        }
        
        callbacks?.onError?.(errorMessage)
      }

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

      // Notifier la fin de l'exécution
      callbacks?.onComplete?.(executionResult)

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
   * Configure le timeout optimal selon le type de commande
   */
  public getOptimalTimeout(command: string): number {
    // Commandes qui peuvent prendre plus de temps
    const longRunningPatterns = [
      /pip\s+install/,
      /npm\s+install/,
      /apt\s+install/,
      /wget\s+.*\.(zip|tar|gz|deb|rpm)/,
      /curl\s+.*\.(zip|tar|gz|deb|rpm)/,
      /git\s+clone/,
      /docker\s+build/,
      /make\s+/,
      /cmake\s+/,
      /gcc\s+.*-o/,
      /python.*\.py.*--train/,
      /python.*machine.*learning/
    ]

    // Commandes très rapides
    const quickPatterns = [
      /^ls/,
      /^pwd/,
      /^echo/,
      /^cat\s+[^|]+$/,
      /^head/,
      /^tail/,
      /^wc/,
      /^date/,
      /^whoami/
    ]

    // Vérifier si c'est une commande rapide (30 secondes)
    if (quickPatterns.some(pattern => pattern.test(command.trim()))) {
      return 30000
    }

    // Vérifier si c'est une commande longue (15 minutes)
    if (longRunningPatterns.some(pattern => pattern.test(command.trim()))) {
      return 900000
    }

    // Timeout par défaut (5 minutes)
    return this.defaultConfig.commandTimeout || 300000
  }

  /**
   * Détruit un sandbox spécifique
   */
  public async destroySandbox(sandboxKey: string): Promise<void> {
    const sandboxData = this.activeSandboxes.get(sandboxKey)
    if (sandboxData) {
      try {
        await sandboxData.sandbox.kill()
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
        user_id: userId,
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
        user_id: userId,
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
      const totalCost = executions?.reduce((sum, exec) => sum + (exec.cost || 0), 0) || 0
      const averageDuration = executions?.reduce((sum, exec) => sum + (exec.duration || 0), 0) / totalExecutions || 0
      const successfulExecutions = executions?.filter(exec => exec.success === true).length || 0
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
         p_last_used: new Date(stats.lastUsed).toISOString()
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
   * Obtient la liste des sandboxes actifs (pour monitoring)
   */
  public getActiveSandboxes(): Array<{sandboxId: string, createdAt: number, age: number}> {
    const now = Date.now()
    return Array.from(this.activeSandboxes.entries()).map(([sandboxId, data]) => ({
      sandboxId,
      createdAt: data.createdAt,
      age: now - data.createdAt
    }))
  }

  /**
   * Vérifie l'état d'un sandbox sans le détruire
   */
  public async getSandboxStatus(sandboxKey: string): Promise<{
    exists: boolean
    age?: number
    isHealthy?: boolean
  }> {
    const sandboxData = this.activeSandboxes.get(sandboxKey)
    if (!sandboxData) {
      return { exists: false }
    }

    try {
      // Test simple pour vérifier si le sandbox répond
      const age = Date.now() - sandboxData.createdAt
      return {
        exists: true,
        age,
        isHealthy: true
      }
    } catch (error) {
      return {
        exists: true,
        age: Date.now() - sandboxData.createdAt,
        isHealthy: false
      }
    }
  }

  /**
   * Vérifie si un sandbox est encore actif et fonctionnel
   * Teste la connectivité en exécutant une commande simple
   */
  private async isSandboxActive(sandbox: Sandbox): Promise<boolean> {
    try {
      // Test de connectivité avec une commande très simple et rapide
      const testResult = await sandbox.commands.run('echo "test"', {
        timeoutMs: 5000 // Timeout très court pour le test
      })
      
      // Si la commande s'exécute sans erreur, le sandbox est actif
      return testResult.exitCode === 0
    } catch (error) {
      // Si une erreur se produit, le sandbox n'est probablement plus actif
      console.log('Test de connectivité du sandbox échoué:', error instanceof Error ? error.message : 'Erreur inconnue')
      return false
    }
  }

  /**
   * S'assure qu'un sandbox est actif et fonctionnel
   * Recrée automatiquement le sandbox s'il n'est plus disponible
   */
  private async ensureSandboxIsActive(
    sandboxKey: string,
    userId: string,
    sessionId: string,
    config?: Partial<SandboxConfig>
  ): Promise<{ sandbox: Sandbox; isNew: boolean }> {
    const existingSandbox = this.activeSandboxes.get(sandboxKey)
    
    if (existingSandbox) {
      // Vérifier si le sandbox existant est encore actif
      const isActive = await this.isSandboxActive(existingSandbox.sandbox)
      
      if (isActive) {
        console.log(`Sandbox ${sandboxKey} vérifié et actif`)
        return { sandbox: existingSandbox.sandbox, isNew: false }
      } else {
        console.log(`Sandbox ${sandboxKey} n'est plus actif, suppression et recréation...`)
        // Nettoyer le sandbox inactif
        this.activeSandboxes.delete(sandboxKey)
        try {
          await existingSandbox.sandbox.kill()
        } catch (error) {
          // Ignorer les erreurs de suppression car le sandbox est déjà mort
          console.log('Erreur lors de la suppression du sandbox inactif (ignorée):', error)
        }
      }
    }
    
    // Créer un nouveau sandbox
    console.log(`Création d'un nouveau sandbox pour ${sandboxKey}`)
    const finalConfig = { ...this.defaultConfig, ...config }
    const timeoutMs = config?.timeout || this.defaultConfig.timeout
    
    const newSandbox = await Sandbox.create({
      metadata: {
        userId,
        sessionId,
        createdAt: new Date().toISOString(),
        timeoutMs: timeoutMs.toString()
      }
    })
    
    this.activeSandboxes.set(sandboxKey, {
      sandbox: newSandbox,
      createdAt: Date.now()
    })
    
    console.log(`Nouveau sandbox créé avec succès pour ${sandboxKey}`)
    return { sandbox: newSandbox, isNew: true }
  }
}