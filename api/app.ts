import express from 'express'
import cors from 'cors'
import { chatRouter } from './chat'
import { sessionsRouter } from './sessions'
import { messagesRouter } from './messages'
import searchRouter from './search'
import terminalRouter from './terminal'

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/chat', chatRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/search', searchRouter)
app.use('/api/terminal', terminalRouter)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default app