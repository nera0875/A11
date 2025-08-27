import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AuthForm } from '../components/Auth/AuthForm'
import { ChatInterface } from '../components/Chat/ChatInterface'
import { useAppStore } from '../store/appStore'

export const Home: React.FC = () => {
  const user = useAppStore(state => state.user)
  const isLoading = useAppStore(state => state.isLoading)
  const isInitializing = useAppStore(state => state.isInitializing)
  const loading = useAppStore(state => state.loading)
  const error = useAppStore(state => state.error)



  if (isLoading || isInitializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthForm onSuccess={() => {}} />
  }


  return <ChatInterface />
}