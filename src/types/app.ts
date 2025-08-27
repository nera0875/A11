export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: {
    taskId?: string
    cost?: number
    duration?: number
    isStreaming?: boolean
    isError?: boolean
  }
}

export interface ChatSession {
  id: string
  session_name: string
  title?: string
  user_id?: string
  messages?: Message[]
  context?: Record<string, any>
  is_active?: boolean
  created_at: string
  updated_at: string
  message_count: number
}

export interface ResearchTask {
  id: string
  query: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  results: ResearchResult[]
  totalCost: number
  durationSeconds: number
  createdAt: string
  completedAt?: string
}

export interface ResearchResult {
  id: string
  type: 'text' | 'table' | 'chart' | 'file' | 'command_output'
  content: any
  metadata?: {
    source?: string
    command?: string
    filename?: string
    size?: number
  }
  createdAt: string
}

export interface SandboxExecution {
  id: string
  sandboxId: string
  command: string
  commands: string[]
  output: string
  duration: number
  cost: number
  success: boolean
  startedAt: string
  endedAt: string
  created_at: string
  error?: string
  exit_code?: number | null
}

export interface User {
  id: string
  email: string
  name?: string
  avatar?: string
}

export interface SearchResult {
  id: string
  content: string
  role: string
  sessionId: string
  timestamp: string
  similarity: number
}

export interface E2BStats {
  totalExecutions: number
  totalCost: number
  averageDuration: number
  lastUsed: string | null
}

export interface RAGStats {
  totalMessages: number
  totalEmbeddings: number
  averageSimilarity: number
  lastUpdated: string | null
}

export interface AppState {
  user: User | null
  currentSession: ChatSession | null
  sessions: ChatSession[]
  isLoading: boolean
  isInitializing: boolean
  loading: boolean
  error: string | null
}