import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, 
  Plus, 
  MessageSquare, 
  Search, 
  Trash2, 
  User, 
  LogOut,
  Settings,
  History,
  Clock
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { toast } from 'sonner'
import type { ChatSession, User as UserType } from '../../types/app'

interface SidebarProps {
  isVisible: boolean
  onClose: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ isVisible, onClose }) => {
  const { 
    user, 
    sessions, 
    currentSession, 
    createSession, 
    switchSession, 
    deleteSession,
    signOut 
  } = useAppStore()

  const [searchTerm, setSearchTerm] = React.useState('')

  const filteredSessions = sessions.filter(session => 
    session.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      })
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString('fr-FR', {
        weekday: 'short'
      })
    } else {
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit'
      })
    }
  }

  const handleCreateSession = () => {
    createSession('Nouvelle conversation')
    onClose()
  }

  const handleSwitchSession = (session: ChatSession) => {
    switchSession(session.id)
    onClose()
  }

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (confirm('Êtes-vous sûr de vouloir supprimer cette session ?')) {
      deleteSession(sessionId)
    }
  }

  const handleSignOut = () => {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      signOut()
      onClose()
    }
  }

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed left-0 top-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Assistant IA</h2>
            <button
              onClick={onClose}
              className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* User Info */}
          {user && (
            <div className="flex items-center space-x-3 text-white">
              <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.email}</p>
                <p className="text-xs opacity-75">Connecté</p>
              </div>
            </div>
          )}
        </div>

        {/* New Session Button */}
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={handleCreateSession}
            className="w-full flex items-center space-x-3 p-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Nouvelle session</span>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher une session..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center space-x-2 mb-3">
              <History className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-700">Historique</h3>
              <span className="text-xs text-gray-500">({filteredSessions.length})</span>
            </div>
            
            {filteredSessions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {searchTerm ? 'Aucune session trouvée' : 'Aucune session'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSessions.map((session) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`group relative p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                      currentSession?.id === session.id
                        ? 'bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200'
                        : 'hover:bg-gray-50 border-2 border-transparent'
                    }`}
                    onClick={() => handleSwitchSession(session)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 truncate mb-1">
                          {session.title}
                        </h4>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(session.updatedAt)}</span>
                          {session.message_count > 0 && (
                            <>
                              <span>•</span>
                              <span>{session.message_count} messages</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                        title="Supprimer la session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 space-y-2">
          <button className="w-full flex items-center space-x-3 p-3 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <Settings className="w-5 h-5" />
            <span>Paramètres</span>
          </button>
          
          <button
            onClick={handleSignOut}
            className="w-full flex items-center space-x-3 p-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Se déconnecter</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}