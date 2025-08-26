import React from 'react'
import { motion } from 'framer-motion'
import { AuthForm } from '../components/Auth/AuthForm'
import { ChatInterface } from '../components/Chat/ChatInterface'
import { useAppStore } from '../store/appStore'

export const Home: React.FC = () => {
  const { user, isLoading } = useAppStore()
  
  // Log pour déboguer l'état de chargement
  React.useEffect(() => {
    console.log('🏠 [HOME] État reçu:', { 
      isLoading, 
      hasUser: !!user, 
      userEmail: user?.email 
    })
  }, [isLoading, user])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600 font-medium">Chargement...</p>
        </motion.div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <AuthForm />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ChatInterface />
    </div>
  )
}