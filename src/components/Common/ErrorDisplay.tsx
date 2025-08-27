import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, X, RefreshCw } from 'lucide-react'

interface ErrorDisplayProps {
  error: string | null
  title?: string
  onRetry?: () => void
  onDismiss?: () => void
  variant?: 'inline' | 'modal' | 'toast'
  className?: string
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  title = 'Une erreur s\'est produite',
  onRetry,
  onDismiss,
  variant = 'inline',
  className = ''
}) => {
  if (!error) return null

  const baseClasses = {
    inline: 'bg-red-50 border-l-4 border-red-400 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm',
    modal: 'bg-white border border-red-200 text-red-700 px-6 py-4 rounded-2xl shadow-lg max-w-md mx-auto',
    toast: 'bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg'
  }

  const iconClasses = {
    inline: 'w-5 h-5 text-red-400 mt-0.5',
    modal: 'w-6 h-6 text-red-500',
    toast: 'w-5 h-5 text-white'
  }

  const textClasses = {
    inline: 'text-sm',
    modal: 'text-base',
    toast: 'text-sm'
  }



  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: variant === 'toast' ? -20 : 0, x: variant === 'inline' ? -20 : 0 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: variant === 'toast' ? -20 : 0, x: variant === 'inline' ? -20 : 0 }}
        className={`${baseClasses[variant]} ${className}`}
      >
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <AlertCircle className={iconClasses[variant]} />
          </div>
          
          <div className="flex-1 min-w-0">
            {variant !== 'toast' && (
              <h3 className={`font-medium mb-1 ${variant === 'inline' ? 'text-red-800' : 'text-red-900'}`}>
                {title}
              </h3>
            )}
            
            <p className={`${textClasses[variant]} ${variant === 'inline' ? 'text-red-700' : variant === 'modal' ? 'text-red-800' : 'text-white'}`}>
              {error}
            </p>
            
            {variant === 'inline' && (
              <div className="mt-2 text-xs text-red-600">
                💡 Conseil : Ouvrez la console (F12) pour plus de détails techniques
              </div>
            )}
            
            {(onRetry || onDismiss) && (
              <div className="mt-3 flex space-x-2">
                {onRetry && (
                  <button
                    onClick={() => {
                      onRetry()
                    }}
                    className={`inline-flex items-center space-x-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      variant === 'toast' 
                        ? 'bg-white/20 text-white hover:bg-white/30' 
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Réessayer</span>
                  </button>
                )}
                
                {onDismiss && (
                  <button
                    onClick={() => {
                      onDismiss()
                    }}
                    className={`inline-flex items-center space-x-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      variant === 'toast'
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    <X className="w-3 h-3" />
                    <span>Fermer</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}