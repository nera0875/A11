import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Obtenir __dirname pour les modules ES
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Charger les variables d'environnement EN PREMIER
dotenv.config({ path: path.join(__dirname, '../.env') })

import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'

// Importer les routes API
import { chatRouter } from './chat'
import { sessionsRouter } from './sessions'
import { messagesRouter } from './messages'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'https://your-domain.com'
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next()
})

// Routes de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// Routes API
app.use('/api/chat', chatRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/messages', messagesRouter)

// Importer les routes manquantes
import searchRouter from './search'
import terminalRouter from './terminal'
import streamingRouter from './streaming'

app.use('/api/search', searchRouter)
app.use('/api/terminal', terminalRouter)
app.use('/api/streaming', streamingRouter)

// Route de configuration pour le frontend
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    features: {
      rag: true,
      terminal: true,
      search: true
    },
    models: {
      chat: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      embedding: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
    }
  })
})

// Route pour servir les fichiers statiques en production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')))
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
}

// Middleware de gestion d'erreurs
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Erreur serveur:', err)
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Erreur interne du serveur'
      : err.message,
    timestamp: new Date().toISOString()
  })
})

// Middleware pour les routes non trouvées
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  })
})

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`)
  console.log(`📱 Mode: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🔗 URL: http://localhost:${PORT}`)
  
  // Vérifier les variables d'environnement critiques
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'OPENAI_API_KEY'
  ]
  
  const optionalEnvVars = [
    'E2B_API_KEY'
  ]
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  const missingOptional = optionalEnvVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    console.warn('⚠️  Variables d\'environnement manquantes (critiques):', missingVars.join(', '))
  }
  
  if (missingOptional.length > 0) {
    console.info('ℹ️  Variables d\'environnement optionnelles manquantes:', missingOptional.join(', '))
  }
  
  if (missingVars.length === 0) {
    console.log('✅ Toutes les variables d\'environnement critiques sont configurées')
  }
})

// Gestion propre de l'arrêt du serveur
process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur (SIGTERM)')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('🛑 Arrêt du serveur (SIGINT)')
  process.exit(0)
})

export default app