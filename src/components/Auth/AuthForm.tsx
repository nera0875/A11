import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Mail, Lock, User, Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { SupabaseDiagnostic } from '../SupabaseDiagnostic'

interface AuthFormProps {
  onSuccess?: () => void
}

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false)
  const [showDiagnostic, setShowDiagnostic] = useState(false)
  const { signIn, signUp, signInTest, isLoading, error, user } = useAppStore()

  // Surveiller les changements d'utilisateur pour gérer la confirmation d'email
  useEffect(() => {
    if (user && emailConfirmationSent) {
      setEmailConfirmationSent(false)
      onSuccess?.()
    }
  }, [user, emailConfirmationSent, onSuccess, isLoading])

  const handleTestLogin = async () => {
    try {
      await signInTest()
      
      // Attendre un peu pour que le store se mette à jour
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const finalUser = useAppStore.getState().user
      
      onSuccess?.()
    } catch (error) {
      // Error handled by store
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    

    
    try {
      if (isSignUp) {
        await signUp(email, password)
        
        // Attendre un peu pour que le store se mette à jour
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Récupérer l'état le plus récent du store
        const currentUser = useAppStore.getState().user
        
        if (!currentUser) {
          setEmailConfirmationSent(true)
          // Le toast est déjà géré dans le store
        } else {
          onSuccess?.()
        }
      } else {
        await signIn(email, password)
        onSuccess?.()
      }
    } catch (err) {
      // Error is handled by the store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            >
              <User className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {isSignUp ? 'Créer un compte' : 'Connexion'}
            </h1>
            <p className="text-gray-600">
              {isSignUp 
                ? 'Rejoignez votre équipe pour commencer' 
                : 'Connectez-vous à votre assistant IA'
              }
            </p>
          </div>

          {/* Debug Info */}
          {import.meta.env.DEV && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-xs"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-700">🐛 Debug Info:</div>
                <button
                  type="button"
                  onClick={() => setShowDiagnostic(!showDiagnostic)}
                  className="text-blue-600 hover:text-blue-800 text-xs underline"
                >
                  {showDiagnostic ? 'Masquer diagnostic' : 'Diagnostic Supabase'}
                </button>
              </div>
              <div className="space-y-1 text-gray-600">
                <div>État: {isLoading ? '⏳ Chargement...' : '✅ Prêt'}</div>
                <div>Utilisateur: {user ? `✅ ${user.email}` : '❌ Aucun'}</div>
                <div>Confirmation: {emailConfirmationSent ? '📧 En attente' : '❌ Non'}</div>
                <div>Erreur: {error ? `❌ ${error}` : '✅ Aucune'}</div>
              </div>
            </motion.div>
          )}

          {/* Supabase Diagnostic */}
          {showDiagnostic && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <SupabaseDiagnostic />
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-red-50 border-l-4 border-red-400 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 shadow-sm"
            >
              <div className="flex items-start space-x-2">
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-800 mb-1">
                    {isSignUp ? 'Erreur d\'inscription' : 'Erreur de connexion'}
                  </h3>
                  <p className="text-sm text-red-700">{error}</p>
                  <div className="mt-2 text-xs text-red-600">
                    💡 Conseil : Vérifiez la console du navigateur (F12) pour plus de détails
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Email Confirmation Message */}
          {emailConfirmationSent && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-6"
            >
              <div className="flex items-center space-x-2">
                <Mail className="w-5 h-5" />
                <div>
                  <p className="font-medium">Email de confirmation envoyé !</p>
                  <p className="text-sm">Vérifiez votre boîte mail et cliquez sur le lien pour activer votre compte.</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                  placeholder="votre@email.com"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading || (isSignUp && emailConfirmationSent)}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-4 rounded-xl font-medium hover:from-blue-600 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{isSignUp ? 'Inscription...' : 'Connexion...'}</span>
                </>
              ) : emailConfirmationSent && isSignUp ? (
                <span>Email envoyé - Vérifiez votre boîte mail</span>
              ) : (
                <span>{isSignUp ? 'Créer le compte' : 'Se connecter'}</span>
              )}
            </motion.button>
          </form>

          {/* Test Login Button */}
          <div className="mt-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={handleTestLogin}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3 px-4 rounded-xl font-medium hover:from-orange-600 hover:to-red-600 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <Zap className="w-5 h-5" />
              <span>Connexion Test Rapide</span>
            </motion.button>
            <p className="text-xs text-gray-500 text-center mt-2">
              Utilise test@example.com / password123
            </p>
          </div>

          {/* Toggle Sign Up/Sign In */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setEmailConfirmationSent(false)
                setEmail('')
                setPassword('')
              }}
              className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              {isSignUp 
                ? 'Déjà un compte ? Se connecter' 
                : 'Pas de compte ? Créer un compte'
              }
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          Assistant IA Terminal - Équipe interne
        </div>
      </motion.div>
    </div>
  )
}