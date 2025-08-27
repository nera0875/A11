import React, { useState, useRef, useEffect } from 'react'
import { Send, Terminal, Loader2, History, User, LogOut, Bot, Search, BarChart3, Play, Zap, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { MessageBubble } from './MessageBubble'
import { Sidebar as SessionSidebar } from './Sidebar'
import { TerminalViewer } from './TerminalViewer'
import { SearchModal } from './SearchModal'
import { StatsModal } from './StatsModal'
import { TypingIndicator } from './TypingIndicator'
import { toast } from 'sonner'
import type { Message, SandboxExecution } from '../../types/app'

export const ChatInterface: React.FC = () => {
  const [input, setInput] = useState('')
  const [showSidebar, setShowSidebar] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionStatus, setExecutionStatus] = useState('')
  const [streamingOutput, setStreamingOutput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [executionStartTime, setExecutionStartTime] = useState<Date | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  
  const {
    user,
    currentSession,
    sessions,
    addMessage,
    createSession,
    setCurrentSession,
    signOut,
    isLoading,
    currentExecution,
    setCurrentExecution,
    clearExecution
  } = useAppStore()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [currentSession?.messages])

  // Fonction pour se connecter au streaming SSE
  const connectToStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource('/api/streaming/connect')
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('✅ Connexion SSE établie')
    }

    eventSource.addEventListener('execution-start', (event) => {
      const data = JSON.parse(event.data)
      setIsExecuting(true)
      setExecutionStartTime(new Date())
      setExecutionStatus(`Création du sandbox... ${data.command || ''}`)
      setStreamingOutput('')
      setShowTerminal(true)
      setIsTyping(true)
      
      // Toast de notification de début
      toast.info('🚀 Exécution démarrée', {
        description: `Commande: ${data.command || 'Script personnalisé'}`,
        duration: 3000
      })
    })

    eventSource.addEventListener('stdout', (event) => {
      const data = JSON.parse(event.data)
      setStreamingOutput(prev => prev + data.output)
    })

    eventSource.addEventListener('stderr', (event) => {
      const data = JSON.parse(event.data)
      setStreamingOutput(prev => prev + `\n[ERROR] ${data.output}`)
    })

    eventSource.addEventListener('execution-complete', (event) => {
      const data = JSON.parse(event.data)
      setIsExecuting(false)
      setIsTyping(false)
      const duration = executionStartTime ? (new Date().getTime() - executionStartTime.getTime()) / 1000 : 0
      setExecutionStatus(`Exécution terminée (${data.exit_code === 0 ? 'succès' : 'erreur'})`)
      
      // Créer l'objet d'exécution pour le TerminalViewer
      const execution: SandboxExecution = {
        id: crypto.randomUUID(),
        sandboxId: 'default',
        command: data.command || '',
        commands: [data.command || ''],
        output: streamingOutput,
        exit_code: data.exit_code,
        duration: duration,
        cost: 0,
        success: data.exit_code === 0,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        created_at: new Date().toISOString()
      }
      
      setCurrentExecution(execution)
      
      // Toast de notification de fin
      if (data.exit_code === 0) {
        toast.success('✅ Exécution réussie', {
          description: `Terminée en ${duration.toFixed(1)}s`,
          duration: 4000
        })
      } else {
        toast.error('❌ Exécution échouée', {
          description: `Code de sortie: ${data.exit_code}`,
          duration: 5000
        })
      }
    })

    eventSource.addEventListener('execution-error', (event) => {
      const data = JSON.parse(event.data)
      setIsExecuting(false)
      setIsTyping(false)
      setExecutionStatus(`Erreur: ${data.error}`)
      
      toast.error('💥 Erreur d\'exécution', {
        description: data.error,
        duration: 6000
      })
    })

    eventSource.onerror = (error) => {
      console.error('❌ Erreur SSE:', error)
      setIsExecuting(false)
      setExecutionStatus('Connexion perdue')
    }
  }

  // Se connecter au streaming au montage du composant
  useEffect(() => {
    connectToStreaming()
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const handleSendMessage = async () => {
    if (!input.trim() || !currentSession) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    }

    addMessage(userMessage)
    setInput('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId: currentSession.id,
          userId: user?.id
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      // Create assistant message
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
        metadata: {
          taskId: data.taskId,
          cost: data.cost,
          duration: data.duration
        }
      }

      addMessage(assistantMessage)

      // Update terminal viewer if there's execution data
      if (data.terminalExecution) {
        setCurrentExecution(data.terminalExecution)
        setShowTerminal(true)
      }

    } catch (error) {
      console.error('Error sending message:', error)
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Désolé, une erreur s\'est produite lors du traitement de votre demande. Veuillez réessayer.',
        timestamp: new Date().toISOString(),
        metadata: { isError: true }
      }
      
      addMessage(errorMessage)
    } finally {
      // isLoading est géré automatiquement par le store
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleNewSession = async () => {
    try {
      const session = await createSession(`Session ${sessions.length + 1}`)
      setCurrentSession(session)
      setShowSidebar(false)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  if (!user || !currentSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }



  return (
    <div className="h-screen flex flex-col bg-gray-50 relative">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSidebar(true)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors lg:hidden"
          >
            <History className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Terminal className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 text-sm">
                {currentSession.session_name}
              </h1>
              <p className="text-xs text-gray-500">
                {currentSession.messages.length} messages
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSearchModal(true)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            title="Recherche sémantique"
          >
            <Search className="w-5 h-5 text-gray-600" />
          </button>
          
          <button
            onClick={() => setShowStatsModal(true)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            title="Statistiques d'utilisation"
          >
            <BarChart3 className="w-5 h-5 text-gray-600" />
          </button>
          
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className={`p-2 rounded-xl transition-colors ${
              showTerminal 
                ? 'bg-blue-100 text-blue-600' 
                : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <Terminal className="w-5 h-5" />
          </button>
          
          <div className="relative group">
            <button className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <User className="w-5 h-5 text-gray-600" />
            </button>
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">{user.name || 'Utilisateur'}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <button
                onClick={signOut}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <SessionSidebar 
          isVisible={showSidebar} 
          onClose={() => setShowSidebar(false)}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            <AnimatePresence>
              {currentSession.messages.map((message, index) => (
                <MessageBubble 
                  key={message.id} 
                  message={message} 
                  isLast={index === currentSession.messages.length - 1}
                />
              ))}
            </AnimatePresence>

            {/* Loading indicator */}
            {isLoading && (
              <TypingIndicator 
                message="L'assistant analyse votre demande..."
                type="thinking"
              />
            )}

            {/* Execution indicator */}
            {isExecuting && (
              <TypingIndicator 
                message={executionStatus || 'Exécution en cours...'}
                type="executing"
                showOutput={!!streamingOutput}
                output={streamingOutput}
              />
            )}
            
            {/* Typing indicator when assistant is processing */}
            {isTyping && !isExecuting && (
              <TypingIndicator 
                message="L'assistant génère la réponse..."
                type="processing"
              />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Terminal Viewer */}
          <TerminalViewer
            isVisible={showTerminal}
            onClose={() => {
              setShowTerminal(false)
              clearExecution()
              setStreamingOutput('')
              setExecutionStatus('')
            }}
            execution={currentExecution}
            isStreaming={isExecuting}
            streamingOutput={streamingOutput}
            executionStatus={executionStatus}
          />

          {/* Input Area */}
          <div className="bg-white border-t border-gray-200 p-4">
            <div className="flex items-end space-x-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Tapez votre commande ou question..."
                  className="w-full resize-none border border-gray-300 rounded-2xl px-4 py-3 pr-12 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white max-h-32"
                  rows={1}
                  style={{
                    height: 'auto',
                    minHeight: '48px'
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 128) + 'px'
                  }}
                />
              </div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 rounded-2xl hover:from-blue-600 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </div>
            
            <div className="mt-2 text-xs text-gray-500 text-center">
              Appuyez sur Entrée pour envoyer, Shift+Entrée pour une nouvelle ligne
            </div>
          </div>
        </div>
      </div>
      
      {/* Modales */}
      <SearchModal 
        isOpen={showSearchModal} 
        onClose={() => setShowSearchModal(false)} 
      />
      
      <StatsModal 
        isOpen={showStatsModal} 
        onClose={() => setShowStatsModal(false)} 
      />
    </div>
  )
}