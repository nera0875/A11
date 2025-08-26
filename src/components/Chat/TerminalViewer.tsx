import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, X, Maximize2, Minimize2, Copy, Download, Clock, DollarSign, Hash, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { SandboxExecution } from '../../types/app'

interface TerminalViewerProps {
  isVisible: boolean
  onClose: () => void
  execution?: SandboxExecution | null
  isStreaming?: boolean
}

export const TerminalViewer: React.FC<TerminalViewerProps> = ({
  isVisible,
  onClose,
  execution,
  isStreaming = false
}) => {
  const [isMaximized, setIsMaximized] = React.useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [execution?.output, execution?.error])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Erreur lors de la copie:', err)
    }
  }

  const downloadOutput = () => {
    if (!execution) return
    
    const content = `Commande: ${execution.command}\n\nSortie:\n${execution.output || ''}\n\nErreurs:\n${execution.error || ''}`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `terminal-${execution.id}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          initial={{ y: '100%', scale: 0.95 }}
          animate={{ 
            y: 0, 
            scale: 1,
            height: isMaximized ? '90vh' : 'auto',
            width: isMaximized ? '95vw' : 'auto'
          }}
          exit={{ y: '100%', scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`bg-gray-900 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden ${
            isMaximized 
              ? 'w-full h-full max-w-none max-h-none' 
              : 'w-full max-w-4xl max-h-[80vh]'
          }`}
        >
          {/* Header */}
          <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-green-400" />
                <span className="text-white font-medium">Terminal E2B</span>
              </div>
              {execution && (
                <div className="flex items-center space-x-4 text-sm text-gray-400">
                  <span>ID: {execution.id.slice(0, 8)}</span>
                  {execution.duration && (
                    <span>Durée: {formatDuration(execution.duration)}</span>
                  )}
                  {execution.cost && (
                    <span>Coût: ${execution.cost.toFixed(4)}</span>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {execution && (
                <>
                  <button
                    onClick={() => copyToClipboard(execution.output || '')}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    title="Copier la sortie"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={downloadOutput}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    title="Télécharger"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </>              )}
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                {isMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Terminal Content */}
          <div className="flex-1 overflow-hidden">
            {execution ? (
              <div className="h-full flex flex-col">
                {/* Command */}
                <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-green-400">$</span>
                    <span className="text-white font-mono">{execution.command}</span>
                    <span className="text-gray-500 text-xs">
                      {formatTime(execution.created_at)}
                    </span>
                  </div>
                </div>

                {/* Output */}
                <div 
                  ref={terminalRef}
                  className="flex-1 p-4 overflow-y-auto bg-gray-900 font-mono text-sm"
                >
                  {/* Standard Output */}
                  {execution.output && (
                    <div className="text-gray-100 whitespace-pre-wrap break-words mb-4">
                      {execution.output}
                    </div>
                  )}

                  {/* Error Output */}
                  {execution.error && (
                    <div className="text-red-400 whitespace-pre-wrap break-words mb-4">
                      <div className="text-red-300 mb-2">Erreurs:</div>
                      {execution.error}
                    </div>
                  )}

                  {/* Streaming Indicator */}
                  {isStreaming && (
                    <div className="flex items-center space-x-2 text-green-400">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span>Exécution en cours...</span>
                    </div>
                  )}

                  {/* Exit Code */}
                  {execution.exit_code !== null && !isStreaming && (
                    <div className={`mt-4 text-sm ${
                      execution.exit_code === 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      Code de sortie: {execution.exit_code}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Aucune exécution de terminal disponible</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}