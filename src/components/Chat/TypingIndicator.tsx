import React from 'react'
import { motion } from 'framer-motion'
import { Bot, Zap, Terminal, Code, Play } from 'lucide-react'

interface TypingIndicatorProps {
  message?: string
  type?: 'thinking' | 'executing' | 'coding' | 'processing'
  showOutput?: boolean
  output?: string
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ 
  message = 'L\'assistant travaille...', 
  type = 'thinking',
  showOutput = false,
  output = ''
}) => {
  const getIcon = () => {
    switch (type) {
      case 'executing':
        return <Zap className="w-4 h-4 text-white animate-pulse" />
      case 'coding':
        return <Code className="w-4 h-4 text-white" />
      case 'processing':
        return <Terminal className="w-4 h-4 text-white" />
      default:
        return <Bot className="w-4 h-4 text-white" />
    }
  }

  const getGradient = () => {
    switch (type) {
      case 'executing':
        return 'from-green-500 to-emerald-600'
      case 'coding':
        return 'from-purple-500 to-indigo-600'
      case 'processing':
        return 'from-orange-500 to-red-600'
      default:
        return 'from-blue-500 to-purple-600'
    }
  }

  const getAccentColor = () => {
    switch (type) {
      case 'executing':
        return 'text-green-500'
      case 'coding':
        return 'text-purple-500'
      case 'processing':
        return 'text-orange-500'
      default:
        return 'text-blue-500'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-start space-x-3"
    >
      <div className={`w-8 h-8 rounded-2xl bg-gradient-to-r ${getGradient()} flex items-center justify-center flex-shrink-0`}>
        {getIcon()}
      </div>
      
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-200 min-w-0 flex-1 max-w-2xl">
        <div className="flex items-center space-x-2 mb-2">
          {type === 'executing' && <Play className={`w-4 h-4 animate-pulse ${getAccentColor()}`} />}
          <span className="text-gray-700 font-medium">{message}</span>
        </div>
        
        {showOutput && output && (
          <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs max-h-32 overflow-y-auto mb-2">
            <pre className="whitespace-pre-wrap">{output}</pre>
          </div>
        )}
        
        {/* Animated dots */}
        <div className="flex items-center space-x-1">
          <motion.div 
            className={`w-2 h-2 rounded-full ${getAccentColor().replace('text-', 'bg-')}`}
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div 
            className={`w-2 h-2 rounded-full ${getAccentColor().replace('text-', 'bg-')}`}
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.2
            }}
          />
          <motion.div 
            className={`w-2 h-2 rounded-full ${getAccentColor().replace('text-', 'bg-')}`}
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.4
            }}
          />
        </div>
        
        {/* Progress bar for execution */}
        {type === 'executing' && (
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <motion.div 
                className="bg-gradient-to-r from-green-500 to-emerald-600 h-1.5 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ 
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}