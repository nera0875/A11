import { create } from 'zustand'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import type { AppState, ChatSession, Message, User } from '../types/app'

interface AppStore extends AppState {
  // Actions
  setUser: (user: User | null) => void
  createSession: (name: string) => Promise<ChatSession>
  loadSessions: () => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  switchSession: (sessionId: string) => void
  addMessage: (message: Message) => void
  updateMessage: (messageId: string, updates: Partial<Message>) => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name?: string) => Promise<void>
  signInTest: () => Promise<void>
  signOut: () => Promise<void>
  setCurrentSession: (session: ChatSession | null) => void
  setLoading: (loading: boolean) => void
  loading: boolean
  setError: (error: string | null) => void
  initialize: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  user: null,
  currentSession: null,
  sessions: [],
  isLoading: true, // Commencer en mode chargement
  loading: false,
  error: null,

  // Actions
  setUser: (user) => set({ user }),
  
  setCurrentSession: (session) => set({ currentSession: session }),
  
  addMessage: (message) => {
    const { currentSession } = get()
    if (!currentSession) return
    
    const updatedSession = {
      ...currentSession,
      messages: [...currentSession.messages, message],
      updatedAt: new Date().toISOString()
    }
    
    set({ currentSession: updatedSession })
    
    // Update sessions list
    const sessions = get().sessions.map(s => 
      s.id === updatedSession.id ? updatedSession : s
    )
    set({ sessions })
  },
  
  updateMessage: (messageId, updates) => {
    const { currentSession } = get()
    if (!currentSession) return
    
    const updatedMessages = currentSession.messages.map(msg =>
      msg.id === messageId ? { ...msg, ...updates } : msg
    )
    
    const updatedSession = {
      ...currentSession,
      messages: updatedMessages,
      updatedAt: new Date().toISOString()
    }
    
    set({ currentSession: updatedSession })
  },
  
  // Créer une nouvelle session
  createSession: async (name?: string) => {
    if (!get().user) return null

    try {
      set({ loading: true, error: null })
      
      const newSessionData = {
        user_id: get().user!.id,
        session_name: name || `Session ${new Date().toLocaleDateString()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_count: 0
      }

      const { data, error } = await supabase
        .from('user_sessions')
        .insert(newSessionData as any)
        .select()
        .single()

      if (error || !data) throw error || new Error('No data returned')

      const sessionResult = data as any
      const newSession: ChatSession = {
        id: sessionResult.id,
        name: sessionResult.session_name,
        title: sessionResult.session_name,
        userId: sessionResult.user_id,
        messages: [],
        message_count: 0,
        context: {},
        isActive: true,
        createdAt: sessionResult.created_at,
        updatedAt: sessionResult.updated_at || new Date().toISOString()
      }

      set(state => ({
        sessions: [newSession, ...state.sessions],
        currentSession: newSession
      }))

      return newSession
    } catch (error) {
      console.error('Erreur lors de la création de la session:', error)
      set({ error: error instanceof Error ? error.message : 'Erreur inconnue' })
      return null
    } finally {
      set({ loading: false })
    }
  },
  
  loadSessions: async () => {
    const { user } = get()
    console.log('📊 [SESSIONS] Début du chargement des sessions pour utilisateur:', user?.email || 'aucun')
    
    if (!user) {
      console.warn('⚠️ [SESSIONS] Aucun utilisateur connecté - arrêt du chargement')
      return
    }
    
    set({ error: null })
    
    try {
      console.log('📊 [SESSIONS] Requête Supabase pour les sessions de l\'utilisateur:', user.id)
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
      
      console.log('📊 [SESSIONS] Réponse Supabase:', { 
        sessionsCount: data?.length || 0, 
        error: error ? error.message : 'aucune' 
      })
      
      if (error) {
        console.error('❌ [SESSIONS] Erreur lors du chargement des sessions:', error)
        throw error
      }
      
      const sessions: ChatSession[] = data.map((session: any) => ({
        id: session.id,
        name: session.session_name || 'Unnamed Session',
        title: session.session_name || 'Unnamed Session',
        userId: session.user_id,
        messages: [], // Messages will be loaded separately when needed
        message_count: session.message_count || 0,
        context: session.context as Record<string, any> || {},
        isActive: true,
        createdAt: session.created_at || new Date().toISOString(),
        updatedAt: session.updated_at || new Date().toISOString()
      }))
      
      console.log('✅ [SESSIONS] Sessions chargées avec succès:', sessions.length)
      set({ sessions })
    } catch (error) {
      console.error('❌ [SESSIONS] Erreur lors du chargement des sessions:', error)
      const errorMessage = (error as Error).message
      set({ error: errorMessage })
      
      // Toast d'erreur pour les problèmes de chargement de sessions
      if (errorMessage.includes('permission denied')) {
        toast.error('Permissions insuffisantes pour charger vos sessions.')
      } else {
        toast.error('Erreur lors du chargement de vos sessions.')
      }
    }
  },
  
  deleteSession: async (sessionId) => {
    set({ isLoading: true, error: null })
    
    try {
      const { error } = await supabase
        .from('user_sessions')
        .delete()
        .eq('id', sessionId)
      
      if (error) throw error
      
      const sessions = get().sessions.filter(s => s.id !== sessionId)
      const currentSession = get().currentSession?.id === sessionId ? null : get().currentSession
      
      set({ sessions, currentSession, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },
  
  switchSession: (sessionId: string) => {
    set((state) => {
      const session = state.sessions.find(s => s.id === sessionId)
      return {
        currentSession: session || null
      }
    })
  },
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),
  
  signInTest: async () => {
    console.log('🧪 [TEST-AUTH] Début de la connexion test')
    set({ isLoading: true, error: null })
    
    const testEmail = 'test@example.com'
    const testPassword = 'password123'
    
    try {
      // D'abord essayer de se connecter
      console.log('🧪 [TEST-AUTH] Tentative de connexion avec le compte test...')
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword
      })
      
      if (!signInError && signInData.user) {
        console.log('✅ [TEST-AUTH] Connexion test réussie avec compte existant')
        const user: User = {
          id: signInData.user.id,
          email: signInData.user.email!,
          name: signInData.user.user_metadata?.name || 'Utilisateur Test',
          avatar: signInData.user.user_metadata?.avatar_url
        }
        set({ user })
        await get().loadSessions()
        toast.success('Connexion test réussie ! Bienvenue dans l\'interface.')
        return
      }
      
      // Si la connexion échoue, créer le compte test
      console.log('🧪 [TEST-AUTH] Compte test inexistant - création...')
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          data: {
            name: 'Utilisateur Test'
          }
        }
      })
      
      if (signUpError) {
        console.error('❌ [TEST-AUTH] Erreur lors de la création du compte test:', signUpError)
        throw signUpError
      }
      
      if (signUpData.user) {
        console.log('✅ [TEST-AUTH] Compte test créé avec succès')
        
        // Si le compte nécessite une confirmation email, on force la connexion
        if (!signUpData.session) {
          console.log('🧪 [TEST-AUTH] Bypass de la validation email pour le compte test')
          // Attendre un peu puis réessayer la connexion
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
            email: testEmail,
            password: testPassword
          })
          
          if (!retryError && retryData.user) {
            const user: User = {
              id: retryData.user.id,
              email: retryData.user.email!,
              name: 'Utilisateur Test',
              avatar: retryData.user.user_metadata?.avatar_url
            }
            set({ user })
            await get().loadSessions()
            toast.success('Compte test créé et connexion réussie !')
            return
          }
        } else {
          // Connexion directe réussie
          const user: User = {
            id: signUpData.user.id,
            email: signUpData.user.email!,
            name: 'Utilisateur Test',
            avatar: signUpData.user.user_metadata?.avatar_url
          }
          set({ user })
          await get().loadSessions()
          toast.success('Compte test créé et connexion réussie !')
          return
        }
      }
      
      throw new Error('Impossible de créer ou de se connecter au compte test')
      
    } catch (error) {
      console.error('❌ [TEST-AUTH] Erreur lors de la connexion test:', error)
      const errorMessage = (error as Error).message
      set({ error: errorMessage })
      toast.error(`Erreur de connexion test: ${errorMessage}`)
      throw error
    } finally {
      console.log('🧪 [TEST-AUTH] Fin du processus de connexion test')
      set({ isLoading: false })
    }
  },

  signIn: async (email, password) => {
    console.log('🔐 [AUTH] Début de la connexion pour:', email)
    set({ isLoading: true, error: null })
    
    try {
      console.log('🔐 [AUTH] Appel à supabase.auth.signInWithPassword...')
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      console.log('🔐 [AUTH] Réponse Supabase:', { data: data ? 'présent' : 'absent', error: error ? error.message : 'aucune' })
      
      if (error) {
        console.error('❌ [AUTH] Erreur Supabase lors de la connexion:', error)
        throw error
      }
      
      if (data.user) {
        console.log('✅ [AUTH] Utilisateur connecté:', data.user.email)
        const user: User = {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.name,
          avatar: data.user.user_metadata?.avatar_url
        }
        console.log('🔐 [AUTH] Définition de l\'utilisateur dans le store...')
        set({ user })
        console.log('📊 [AUTH] Chargement des sessions...')
        await get().loadSessions()
        console.log('✅ [AUTH] Connexion terminée avec succès')
        toast.success(`Connexion réussie ! Bienvenue ${data.user.email}`)
      } else {
        console.warn('⚠️ [AUTH] Aucun utilisateur dans la réponse')
      }
    } catch (error) {
      console.error('❌ [AUTH] Erreur lors de la connexion:', error)
      const errorMessage = (error as Error).message
      set({ error: errorMessage })
      
      // Toast d'erreur avec message personnalisé
      if (errorMessage.includes('Invalid login credentials')) {
        toast.error('Email ou mot de passe incorrect. Vérifiez vos identifiants.')
      } else if (errorMessage.includes('Email not confirmed')) {
        toast.error('Veuillez confirmer votre email avant de vous connecter.')
      } else {
        toast.error(`Erreur de connexion: ${errorMessage}`)
      }
      
      throw error
    } finally {
      console.log('🔐 [AUTH] Fin du processus de connexion')
      set({ isLoading: false })
    }
  },
  
  signUp: async (email, password) => {
    console.log('📝 [SIGNUP] Début de l\'inscription pour:', email)
    set({ isLoading: true, error: null })
    
    try {
      console.log('📝 [SIGNUP] Appel à supabase.auth.signUp...')
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      })
      
      console.log('📝 [SIGNUP] Réponse Supabase:', { 
        user: data.user ? 'présent' : 'absent', 
        session: data.session ? 'présent' : 'absent',
        error: error ? error.message : 'aucune' 
      })
      
      if (error) {
        console.error('❌ [SIGNUP] Erreur Supabase lors de l\'inscription:', error)
        throw error
      }
      
      // Vérifier si l'utilisateur nécessite une confirmation email
      if (data.user && !data.session) {
        console.log('📧 [SIGNUP] Confirmation email requise pour:', data.user.email)
        // L'utilisateur a été créé mais doit confirmer son email
        set({ 
          error: null,
          user: null // Ne pas définir l'utilisateur tant qu'il n'est pas confirmé
        })
        console.log('✅ [SIGNUP] Inscription réussie - confirmation email envoyée')
        toast.success('Inscription réussie ! Vérifiez votre email pour confirmer votre compte.')
        // Retourner un indicateur de succès pour l'interface
        return { requiresEmailConfirmation: true }
      } else if (data.user && data.session) {
        console.log('✅ [SIGNUP] Utilisateur directement connecté:', data.user.email)
        // L'utilisateur est directement connecté (confirmation email désactivée)
        const user: User = {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.name,
          avatar: data.user.user_metadata?.avatar_url
        }
        console.log('📝 [SIGNUP] Définition de l\'utilisateur dans le store...')
        set({ user })
        console.log('📊 [SIGNUP] Chargement des sessions...')
        await get().loadSessions()
        console.log('✅ [SIGNUP] Inscription et connexion terminées avec succès')
        toast.success(`Inscription et connexion réussies ! Bienvenue ${data.user.email}`)
        return { requiresEmailConfirmation: false }
      } else {
        console.warn('⚠️ [SIGNUP] Réponse inattendue - ni utilisateur ni session')
      }
    } catch (error) {
      console.error('❌ [SIGNUP] Erreur lors de l\'inscription:', error)
      const errorMessage = (error as Error).message
      set({ error: errorMessage })
      
      // Toast d'erreur avec message personnalisé
      if (errorMessage.includes('User already registered')) {
        toast.error('Un compte existe déjà avec cet email. Essayez de vous connecter.')
      } else if (errorMessage.includes('Password should be at least')) {
        toast.error('Le mot de passe doit contenir au moins 6 caractères.')
      } else if (errorMessage.includes('Invalid email')) {
        toast.error('Format d\'email invalide. Vérifiez votre adresse email.')
      } else {
        toast.error(`Erreur d\'inscription: ${errorMessage}`)
      }
      
      throw error
    } finally {
      console.log('📝 [SIGNUP] Fin du processus d\'inscription')
      set({ isLoading: false })
    }
  },
  
  signOut: async () => {
    set({ isLoading: true, error: null })
    
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      
      set({ 
        user: null, 
        currentSession: null, 
        sessions: [], 
        isLoading: false 
      })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },
  
  initialize: async () => {
    console.log('🚀 [INIT] Début de l\'initialisation de l\'application')
    set({ isLoading: true, error: null })
    
    try {
      // Vérifier d'abord s'il y a des paramètres de confirmation dans l'URL
      const urlParams = new URLSearchParams(window.location.search)
      const accessToken = urlParams.get('access_token')
      const refreshToken = urlParams.get('refresh_token')
      
      console.log('🚀 [INIT] Paramètres URL:', { 
        hasAccessToken: !!accessToken, 
        hasRefreshToken: !!refreshToken 
      })
      
      // Si nous avons des tokens dans l'URL (confirmation email), les traiter
      if (accessToken && refreshToken) {
        console.log('📧 [INIT] Tokens de confirmation détectés - traitement...')
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          
          console.log('📧 [INIT] Réponse setSession:', { 
            session: data.session ? 'présent' : 'absent',
            error: error ? error.message : 'aucune' 
          })
          
          if (error) {
            // Si erreur de time skew, essayer de récupérer la session existante
            if (error.message.includes('issued in the future') || error.message.includes('time skew')) {
              console.warn('⏰ [INIT] Time skew détecté - tentative de récupération')
              // Nettoyer l'URL et essayer de récupérer la session
              window.history.replaceState({}, document.title, window.location.pathname)
              
              // Attendre un peu pour que le storage custom gère le time skew
              await new Promise(resolve => setTimeout(resolve, 1000))
              
              const { data: sessionData } = await supabase.auth.getSession()
              if (sessionData.session?.user) {
                console.log('✅ [INIT] Session récupérée après time skew')
                const user: User = {
                  id: sessionData.session.user.id,
                  email: sessionData.session.user.email!,
                  name: sessionData.session.user.user_metadata?.name,
                  avatar: sessionData.session.user.user_metadata?.avatar_url
                }
                set({ user })
                await get().loadSessions()
                return
              }
            } else {
              console.error('❌ [INIT] Erreur lors de setSession:', error)
              throw error
            }
          } else if (data.session?.user) {
            console.log('✅ [INIT] Confirmation email réussie pour:', data.session.user.email)
            // Confirmation réussie
            const user: User = {
              id: data.session.user.id,
              email: data.session.user.email!,
              name: data.session.user.user_metadata?.name,
              avatar: data.session.user.user_metadata?.avatar_url
            }
            set({ user })
            await get().loadSessions()
            
            // Nettoyer l'URL après confirmation réussie
            window.history.replaceState({}, document.title, window.location.pathname)
            console.log('✅ [INIT] Initialisation terminée après confirmation')
            return
          }
        } catch (confirmError) {
          console.error('❌ [INIT] Erreur lors de la confirmation:', confirmError)
          // Continuer avec la récupération de session normale
        }
      }
      
      // Récupération de session normale
      console.log('🔍 [INIT] Récupération de session normale...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      console.log('🔍 [INIT] Session récupérée:', { 
        session: session ? 'présent' : 'absent',
        user: session?.user?.email || 'aucun',
        error: sessionError ? sessionError.message : 'aucune' 
      })
      
      if (sessionError) {
        // Gérer les erreurs de time skew
        if (sessionError.message.includes('issued in the future') || sessionError.message.includes('time skew')) {
          console.warn('⏰ [INIT] Time skew de session détecté - nettoyage')
          await supabase.auth.signOut()
          set({ user: null, sessions: [], currentSession: null, error: null })
          return
        }
        console.error('❌ [INIT] Erreur de session:', sessionError)
        throw sessionError
      }
      
      if (session?.user) {
        console.log('✅ [INIT] Session active trouvée pour:', session.user.email)
        const user: User = {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.name,
          avatar: session.user.user_metadata?.avatar_url
        }
        set({ user })
        await get().loadSessions()
        console.log('✅ [INIT] Initialisation terminée avec utilisateur connecté')
      } else {
        console.log('ℹ️ [INIT] Aucune session active - état propre')
        // Pas de session active, s'assurer que l'état est propre
        set({ user: null, sessions: [], currentSession: null })
      }
    } catch (error) {
      console.error('❌ [INIT] Erreur lors de l\'initialisation:', error)
      const errorMessage = (error as Error).message
      
      // Ne pas afficher les erreurs de time skew à l'utilisateur
      if (!errorMessage.includes('issued in the future') && !errorMessage.includes('time skew')) {
        console.log('❌ [INIT] Affichage de l\'erreur à l\'utilisateur:', errorMessage)
        set({ error: errorMessage })
      } else {
        console.log('⏰ [INIT] Erreur de time skew masquée à l\'utilisateur')
        set({ error: null })
      }
      
      // S'assurer que l'état est propre en cas d'erreur
      set({ user: null, sessions: [], currentSession: null })
    } finally {
      console.log('🚀 [INIT] Fin de l\'initialisation')
      console.log('🔄 [INIT] Mise à jour isLoading: false')
      set({ isLoading: false })
      
      // Vérifier l'état après mise à jour
      setTimeout(() => {
        const currentState = get()
        console.log('📊 [INIT] État final:', {
          isLoading: currentState.isLoading,
          hasUser: !!currentState.user,
          userEmail: currentState.user?.email,
          sessionsCount: currentState.sessions.length
        })
      }, 100)
    }
  },

  initializeSession: async () => {
    try {
      set({ isLoading: true, error: null })
      
      // Gérer les paramètres URL pour la confirmation email
      const urlParams = new URLSearchParams(window.location.search)
      const accessToken = urlParams.get('access_token')
      const refreshToken = urlParams.get('refresh_token')
      
      if (accessToken && refreshToken) {
        // Nettoyer l'URL
        window.history.replaceState({}, document.title, window.location.pathname)
        
        // Définir la session avec les tokens de l'URL
        const { data: { session }, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        
        if (error) {
          console.error('Error setting session from URL:', error)
          set({ error: error.message, isLoading: false })
          return
        }
        
        if (session?.user) {
          set({ 
            user: session.user, 
            isAuthenticated: true,
            isLoading: false 
          })
          return
        }
      }
      
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Session initialization error:', error)
        set({ error: error.message, isLoading: false })
        return
      }

      if (session?.user) {
        set({ 
          user: session.user, 
          isAuthenticated: true,
          isLoading: false 
        })
      } else {
        set({ 
          user: null, 
          isAuthenticated: false,
          isLoading: false 
        })
      }
    } catch (error) {
      console.error('Session initialization failed:', error)
      set({ 
        error: error instanceof Error ? error.message : 'Session initialization failed',
        isLoading: false 
      })
    }
  }
}))