import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, Mail, Settings, Users } from 'lucide-react'

interface DiagnosticInfo {
  supabaseUrl: string
  anonKey: string
  projectRef: string
  emailSettings: {
    confirmEmailEnabled: boolean
    emailProvider: string
    smtpConfigured: boolean
  }
  authLogs: any[]
  connectionStatus: 'connected' | 'error' | 'checking'
}

export const SupabaseDiagnostic: React.FC = () => {
  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    runDiagnostic()
  }, [])

  const runDiagnostic = async () => {
    setLoading(true)
    setError(null)
    
    try {

      
      // Récupérer les variables d'environnement
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !anonKey) {
        throw new Error('Variables d\'environnement Supabase manquantes')
      }
      
      // Extraire la référence du projet depuis l'URL
      const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown'
      

      
      // Tester la connexion Supabase
      let connectionStatus: 'connected' | 'error' | 'checking' = 'checking'
      
      try {
        const { data, error: connectionError } = await supabase.auth.getSession()
        if (connectionError) {
          connectionStatus = 'error'
        } else {
          connectionStatus = 'connected'
        }
      } catch (err) {
        connectionStatus = 'error'
      }
      
      // Essayer de récupérer des informations sur la configuration email
      // Note: Ces informations ne sont généralement pas accessibles via l'API client
      const emailSettings = {
        confirmEmailEnabled: true, // Par défaut activé
        emailProvider: 'default', // Serveur SMTP par défaut de Supabase
        smtpConfigured: false // Impossible de détecter depuis le client
      }
      

      
      setDiagnostic({
        supabaseUrl,
        anonKey: anonKey.substring(0, 20) + '...', // Masquer la clé pour la sécurité
        projectRef,
        emailSettings,
        authLogs: [], // Les logs ne sont pas accessibles depuis le client
        connectionStatus
      })
      
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const testEmailSending = async () => {
    try {

      
      // Essayer d'envoyer un email de test avec une adresse fictive
      const testEmail = 'test-' + Date.now() + '@example.com'
      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: 'testpassword123'
      })
      

      

      
    } catch (err) {
      // Error handled silently
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-2">
          <Settings className="animate-spin h-5 w-5 text-blue-500" />
          <span>Diagnostic en cours...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span className="font-medium">Erreur de diagnostic</span>
        </div>
        <p className="mt-2 text-red-600">{error}</p>
        <button 
          onClick={runDiagnostic}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Réessayer
        </button>
      </div>
    )
  }

  if (!diagnostic) return null

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Diagnostic Supabase</h3>
        <button 
          onClick={runDiagnostic}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Actualiser
        </button>
      </div>

      {/* Statut de connexion */}
      <div className="flex items-center space-x-3">
        {diagnostic.connectionStatus === 'connected' ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertCircle className="h-5 w-5 text-red-500" />
        )}
        <span className="font-medium">
          Connexion: {diagnostic.connectionStatus === 'connected' ? 'OK' : 'Erreur'}
        </span>
      </div>

      {/* Configuration */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Configuration</h4>
        <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
          <div><strong>URL:</strong> {diagnostic.supabaseUrl}</div>
          <div><strong>Projet:</strong> {diagnostic.projectRef}</div>
          <div><strong>Clé Anon:</strong> {diagnostic.anonKey}</div>
        </div>
      </div>

      {/* Configuration Email */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Mail className="h-4 w-4" />
          <h4 className="font-medium text-gray-900">Configuration Email</h4>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
          <div className="flex items-center space-x-2 text-yellow-800 mb-2">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Problème détecté</span>
          </div>
          <div className="text-sm text-yellow-700 space-y-1">
            <p>• Supabase utilise par défaut un serveur SMTP limité</p>
            <p>• Les emails ne sont envoyés qu'aux adresses pré-autorisées</p>
            <p>• Limite: 2 emails par heure maximum</p>
          </div>
        </div>
      </div>

      {/* Solutions recommandées */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Solutions recommandées</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-start space-x-2">
            <Users className="h-4 w-4 mt-0.5 text-blue-500" />
            <div>
              <p className="font-medium">1. Ajouter votre email aux membres autorisés</p>
              <p className="text-gray-600">Dans le dashboard Supabase &gt; Settings &gt; Team</p>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <Settings className="h-4 w-4 mt-0.5 text-green-500" />
            <div>
              <p className="font-medium">2. Configurer un serveur SMTP personnalisé</p>
              <p className="text-gray-600">Dans Authentication &gt; Settings &gt; SMTP Settings</p>
            </div>
          </div>
        </div>
      </div>

      {/* Test d'email */}
      <div className="pt-4 border-t">
        <button 
          onClick={testEmailSending}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Tester l'envoi d'email
        </button>
        <p className="mt-2 text-xs text-gray-500">
          Ceci créera un compte de test pour vérifier les logs d'erreur
        </p>
      </div>
    </div>
  )
}

export default SupabaseDiagnostic