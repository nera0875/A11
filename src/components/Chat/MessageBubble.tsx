import React from 'react'
import { motion } from 'framer-motion'
import { User, Bot, Terminal, Clock, DollarSign, Loader2 } from 'lucide-react'
import type { Message } from '../../types/app'

interface MessageBubbleProps {
  message: Message
  isLast?: boolean
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast }) => {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isStreaming = message.metadata?.isStreaming

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className={`flex items-start space-x-3 ${
        isUser ? 'flex-row-reverse space-x-reverse' : ''
      }`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-2xl flex items-center justify-center ${
        isUser 
          ? 'bg-gradient-to-r from-green-500 to-emerald-600' 
          : isSystem
          ? 'bg-gradient-to-r from-orange-500 to-red-600'
          : 'bg-gradient-to-r from-blue-500 to-purple-600'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : isSystem ? (
          <Terminal className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[80%] ${
        isUser ? 'flex flex-col items-end' : ''
      }`}>
        {/* Message Bubble */}
        <div className={`rounded-2xl px-4 py-3 shadow-sm ${
          isUser 
            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white' 
            : isSystem
            ? 'bg-gradient-to-r from-orange-100 to-red-100 text-orange-900 border border-orange-200'
            : 'bg-white text-gray-900 border border-gray-200'
        }`}>
          {/* Streaming Indicator */}
          {isStreaming && (
            <div className="flex items-center space-x-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm opacity-75">Traitement en cours...</span>
            </div>
          )}

          {/* Message Text */}
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>

          {/* Metadata */}
          {message.metadata && !isStreaming && (
            <div className="mt-3 pt-3 border-t border-opacity-20 border-current">
              <div className="flex flex-wrap items-center gap-3 text-xs opacity-75">
                {message.metadata.cost !== undefined && (
                  <div className="flex items-center space-x-1">
                    <DollarSign className="w-3 h-3" />
                    <span>{formatCost(message.metadata.cost)}</span>
                  </div>
                )}
                {message.metadata.duration !== undefined && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDuration(message.metadata.duration)}</span>
                  </div>
                )}
                {message.metadata.taskId && (
                  <div className="flex items-center space-x-1">
                    <Terminal className="w-3 h-3" />
                    <span>Tâche: {message.metadata.taskId.slice(0, 8)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div className={`mt-1 text-xs text-gray-500 ${
          isUser ? 'text-right' : 'text-left'
        }`}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </motion.div>
  )
}