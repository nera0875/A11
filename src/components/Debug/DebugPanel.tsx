import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bug, ChevronDown, ChevronUp, User, Database, Clock, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export const DebugPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { user, isLoading, error, sessions, currentSession } = useAppStore()

  // Debug panel désactivé pour éviter l'encombrement
  return null

  const debugInfo = {
    timestamp: new Date().toLocaleTimeString(),
    auth: {
      isLoading,
      hasUser: !!user,
      userEmail: user?.email || 'N/A',
      userId: user?.id || 'N/A',
      hasError: !!error,
      errorMessage: error || 'N/A'
    },
    sessions: {
      count: sessions.length,
      hasCurrentSession: !!currentSession,
      currentSessionId: currentSession?.id || 'N/A',
      currentSessionName: currentSession?.session_name || 'N/A'
    },
    environment: {
      hasSupabaseUrl: !!import.meta.env.VITE_SUPABASE_URL,
      hasSupabaseKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
      isDev: import.meta.env.DEV
    }
  }

  const getStatusColor = (status: boolean) => {
    return status ? 'text-green-600' : 'text-red-600'
  }

  const getStatusIcon = (status: boolean) => {
    return status ? '✅' : '❌'
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-900 text-white rounded-lg shadow-2xl border border-gray-700 overflow-hidden"
      >
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <Bug className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium">Debug Panel</span>
            {isLoading && (
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            )}
            {error && (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {/* Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-gray-700"
            >
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {/* Timestamp */}
                <div className="flex items-center space-x-2 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>Dernière mise à jour: {debugInfo.timestamp}</span>
                </div>

                {/* Auth Status */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium">Authentification</span>
                  </div>
                  <div className="ml-6 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Chargement:</span>
                      <span className={getStatusColor(!debugInfo.auth.isLoading)}>
                        {getStatusIcon(!debugInfo.auth.isLoading)} {debugInfo.auth.isLoading ? 'En cours' : 'Terminé'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Utilisateur:</span>
                      <span className={getStatusColor(debugInfo.auth.hasUser)}>
                        {getStatusIcon(debugInfo.auth.hasUser)} {debugInfo.auth.hasUser ? 'Connecté' : 'Déconnecté'}
                      </span>
                    </div>
                    {debugInfo.auth.hasUser && (
                      <div className="flex justify-between">
                        <span>Email:</span>
                        <span className="text-green-400 truncate max-w-32">{debugInfo.auth.userEmail}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Erreur:</span>
                      <span className={getStatusColor(!debugInfo.auth.hasError)}>
                        {getStatusIcon(!debugInfo.auth.hasError)} {debugInfo.auth.hasError ? 'Présente' : 'Aucune'}
                      </span>
                    </div>
                    {debugInfo.auth.hasError && (
                      <div className="text-red-400 text-xs mt-1 p-2 bg-red-900/20 rounded">
                        {debugInfo.auth.errorMessage}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sessions Status */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Database className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium">Sessions</span>
                  </div>
                  <div className="ml-6 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Nombre:</span>
                      <span className="text-blue-400">{debugInfo.sessions.count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Session active:</span>
                      <span className={getStatusColor(debugInfo.sessions.hasCurrentSession)}>
                        {getStatusIcon(debugInfo.sessions.hasCurrentSession)} {debugInfo.sessions.hasCurrentSession ? 'Oui' : 'Non'}
                      </span>
                    </div>
                    {debugInfo.sessions.hasCurrentSession && (
                      <div className="flex justify-between">
                        <span>Nom:</span>
                        <span className="text-green-400 truncate max-w-32">{debugInfo.sessions.currentSessionName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Environment Status */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-medium">Environnement</span>
                  </div>
                  <div className="ml-6 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Supabase URL:</span>
                      <span className={getStatusColor(debugInfo.environment.hasSupabaseUrl)}>
                        {getStatusIcon(debugInfo.environment.hasSupabaseUrl)} {debugInfo.environment.hasSupabaseUrl ? 'Configurée' : 'Manquante'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Supabase Key:</span>
                      <span className={getStatusColor(debugInfo.environment.hasSupabaseKey)}>
                        {getStatusIcon(debugInfo.environment.hasSupabaseKey)} {debugInfo.environment.hasSupabaseKey ? 'Configurée' : 'Manquante'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mode:</span>
                      <span className="text-blue-400">{debugInfo.environment.isDev ? 'Développement' : 'Production'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-gray-700">
                  <button
                    onClick={() => {
                      // Debug info available in panel
                    }}
                    className="w-full text-xs bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded transition-colors"
                  >
                    Debug Info
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}