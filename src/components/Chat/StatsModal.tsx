import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, BarChart3, Loader2, Activity, Clock, DollarSign, Database, Terminal, Brain } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { E2BStats, RAGStats } from '../../types/app'

interface StatsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose }) => {
  const [e2bStats, setE2bStats] = useState<E2BStats | null>(null)
  const [ragStats, setRAGStats] = useState<RAGStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAppStore()

  const fetchStats = async () => {
    if (!user) return

    setIsLoading(true)
    setError(null)

    try {
      // Fetch E2B stats
      const e2bResponse = await fetch('/api/terminal/stats', {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      // Fetch RAG stats
      const ragResponse = await fetch('/api/search/stats', {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (e2bResponse.ok) {
        const e2bData = await e2bResponse.json()
        setE2bStats(e2bData.stats)
      }

      if (ragResponse.ok) {
        const ragData = await ragResponse.json()
        setRAGStats(ragData.stats)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des statistiques')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchStats()
    }
  }, [isOpen, user])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(amount)
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Jamais'
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const StatCard: React.FC<{
    title: string
    value: string | number
    subtitle?: string
    icon: React.ReactNode
    color: string
  }> = ({ title, value, subtitle, icon, color }) => (
    <div className={`bg-gradient-to-br ${color} rounded-xl p-6 text-white`}>
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-white/20 rounded-lg">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-white/80 text-sm font-medium">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {subtitle && (
          <p className="text-white/70 text-xs mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-6 h-6 text-purple-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Statistiques d'utilisation
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
                  <p className="text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Chargement des statistiques...</span>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* E2B Stats */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Terminal className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Statistiques E2B Terminal
                      </h3>
                    </div>
                    
                    {e2bStats ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                          title="Exécutions totales"
                          value={e2bStats.totalExecutions.toLocaleString()}
                          icon={<Activity className="w-5 h-5" />}
                          color="from-blue-500 to-blue-600"
                        />
                        <StatCard
                          title="Coût total"
                          value={formatCurrency(e2bStats.totalCost)}
                          icon={<DollarSign className="w-5 h-5" />}
                          color="from-green-500 to-green-600"
                        />
                        <StatCard
                          title="Durée moyenne"
                          value={formatDuration(e2bStats.averageDuration)}
                          icon={<Clock className="w-5 h-5" />}
                          color="from-yellow-500 to-yellow-600"
                        />
                        <StatCard
                          title="Dernière utilisation"
                          value={formatTimestamp(e2bStats.lastUsed)}
                          icon={<Terminal className="w-5 h-5" />}
                          color="from-purple-500 to-purple-600"
                        />
                      </div>
                    ) : (
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 text-center">
                        <Terminal className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500 dark:text-gray-400">Aucune donnée E2B disponible</p>
                      </div>
                    )}
                  </div>

                  {/* RAG Stats */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Brain className="w-5 h-5 text-purple-600" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Statistiques RAG (Mémoire)
                      </h3>
                    </div>
                    
                    {ragStats ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                          title="Messages totaux"
                          value={ragStats.totalMessages.toLocaleString()}
                          icon={<Database className="w-5 h-5" />}
                          color="from-indigo-500 to-indigo-600"
                        />
                        <StatCard
                          title="Embeddings"
                          value={ragStats.totalEmbeddings.toLocaleString()}
                          icon={<Brain className="w-5 h-5" />}
                          color="from-pink-500 to-pink-600"
                        />
                        <StatCard
                          title="Similarité moyenne"
                          value={`${Math.round(ragStats.averageSimilarity * 100)}%`}
                          icon={<BarChart3 className="w-5 h-5" />}
                          color="from-teal-500 to-teal-600"
                        />
                        <StatCard
                          title="Dernière mise à jour"
                          value={formatTimestamp(ragStats.lastUpdated)}
                          icon={<Clock className="w-5 h-5" />}
                          color="from-orange-500 to-orange-600"
                        />
                      </div>
                    ) : (
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 text-center">
                        <Brain className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500 dark:text-gray-400">Aucune donnée RAG disponible</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={fetchStats}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      <Activity className="w-4 h-4" />
                      Actualiser
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}