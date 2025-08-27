import { create } from 'zustand'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import type { AppState, ChatSession, Message, User, SandboxExecution } from '../types/app'

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
  // Sandbox execution actions
  currentExecution: SandboxExecution | null
  setCurrentExecution: (execution: SandboxExecution | null) => void
  addExecution: (execution: SandboxExecution) => void
  clearExecution: () => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  user: null,
  currentSession: null,
  sessions: [],
  isLoading: true, // Commencer en mode chargement
  isInitializing: false, // Flag pour éviter les initialisations multiples
  loading: false,
  error: null,
  // Sandbox execution state
  currentExecution: null,

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
        session_name: sessionResult.session_name,
        title: sessionResult.session_name,
        user_id: sessionResult.user_id,
        messages: [],
        message_count: 0,
        context: {},
        is_active: true,
        created_at: sessionResult.created_at,
        updated_at: sessionResult.updated_at || new Date().toISOString()
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
    
    if (!user) {
      return
    }
    
    set({ error: null })
    
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
      
      if (error) {
        console.error('❌ [SESSIONS] Erreur lors du chargement des sessions:', error)
        throw error
      }
      
      const sessions: ChatSession[] = data.map((session: any) => ({
        id: session.id,
        session_name: session.session_name || 'Unnamed Session',
        title: session.session_name || 'Unnamed Session',
        user_id: session.user_id,
        messages: [], // Messages will be loaded separately when needed
        message_count: session.message_count || 0,
        context: session.context as Record<string, any> || {},
        is_active: true,
        created_at: session.created_at || new Date().toISOString(),
        updated_at: session.updated_at || new Date().toISOString()
      }))
      
      set({ sessions })
      
      // Définir automatiquement la première session comme session courante si aucune n'est définie
      const currentState = get()
      if (!currentState.currentSession && sessions.length > 0) {

        set({ currentSession: sessions[0] })
      } else if (sessions.length === 0) {

         // Créer automatiquement une session par défaut
         try {
           const defaultSession = await get().createSession('Ma première session')

           set({ currentSession: defaultSession })
         } catch (error) {
           console.error('Erreur création session par défaut:', error)
         }
       } else {

      }
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
    const currentState = get()
    if (currentState.isLoading) {

      return
    }
    

    set({ isLoading: true, error: null })
    
    const testEmail = 'test@example.com'
    const testPassword = 'password123'
    
    try {
      // D'abord essayer de se connecter avec timeout

      
      const signInPromise = supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout de connexion test')), 10000)
      )
      
      const { data: signInData, error: signInError } = await Promise.race([
        signInPromise,
        timeoutPromise
      ]) as any
      
      if (!signInError && signInData.user) {

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

      
      const signUpPromise = supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          data: {
            name: 'Utilisateur Test'
          }
        }
      })
      
      const { data: signUpData, error: signUpError } = await Promise.race([
        signUpPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout création test')), 10000))
      ]) as any
      
      if (signUpError) {
        console.error('❌ [TEST-AUTH] Erreur lors de la création du compte test:', signUpError)
        if (signUpError.message.includes('Timeout')) {
          toast.error('Création du compte test trop lente')
        } else {
          toast.error('Erreur création compte test: ' + signUpError.message)
        }
        throw signUpError
      }
      
      if (signUpData.user) {

        
        // Si le compte nécessite une confirmation email, on force la connexion
        if (!signUpData.session) {

          // Attendre un peu puis réessayer la connexion
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const retryPromise = supabase.auth.signInWithPassword({
            email: testEmail,
            password: testPassword
          })
          
          const { data: retryData, error: retryError } = await Promise.race([
            retryPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout retry test')), 5000))
          ]) as any
          
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
          } else if (retryError?.message.includes('Timeout')) {
            toast.error('Connexion test trop lente après création')
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
      
      if (errorMessage.includes('Timeout')) {
        toast.error('Connexion test trop lente')
      } else {
        toast.error(`Erreur de connexion test: ${errorMessage}`)
      }
      throw error
    } finally {
      
      set({ isLoading: false })
    }
  },

  signIn: async (email, password) => {
    const currentState = get()
    if (currentState.isLoading) {

      return
    }
    

    set({ isLoading: true, error: null })
    
    try {
  
      
      // Timeout pour éviter les blocages
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout de connexion')), 15000)
      )
      
      const { data, error } = await Promise.race([
        signInPromise,
        timeoutPromise
      ]) as any
      
      if (error) {
        console.error('❌ [AUTH] Erreur Supabase lors de la connexion:', error)
        throw error
      }
      
      if (data.user) {
        const user: User = {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.name,
          avatar: data.user.user_metadata?.avatar_url
        }
        set({ user })
        await get().loadSessions()
        toast.success(`Connexion réussie ! Bienvenue ${data.user.email}`)
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
      } else if (errorMessage.includes('Timeout')) {
        toast.error('Connexion trop lente, veuillez réessayer')
      } else {
        toast.error(`Erreur de connexion: ${errorMessage}`)
      }
      
      throw error
    } finally {
      set({ isLoading: false })
    }
  },
  
  signUp: async (email, password, name) => {
    const currentState = get()
    if (currentState.isLoading) {

      return
    }
    

    set({ isLoading: true, error: null })
    
    try {
  
      
      // Timeout pour éviter les blocages
      const signUpPromise = supabase.auth.signUp({
        email,
        password
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout d\'inscription')), 15000)
      )
      
      const { data, error } = await Promise.race([
        signUpPromise,
        timeoutPromise
      ]) as any
      
      if (error) {
        console.error('❌ [SIGNUP] Erreur Supabase lors de l\'inscription:', {
          message: error.message,
          status: error.status,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        
        // Log spécifique pour les erreurs d'email
        if (error.message.includes('Email') || error.message.includes('email') || error.message.includes('SMTP')) {
          console.error('📧 [SIGNUP] Erreur liée à l\'email détectée:', {
            message: error.message,
            possibleCause: 'Configuration SMTP ou adresse non autorisée'
          })
        }
        
        throw error
      }
      
      // Vérifier si l'utilisateur nécessite une confirmation email
      if (data.user && !data.session) {

        // L'utilisateur a été créé mais doit confirmer son email
        set({ 
          error: null,
          user: null // Ne pas définir l'utilisateur tant qu'il n'est pas confirmé
        })

        toast.success('Inscription réussie ! Vérifiez votre email pour confirmer votre compte.')
        // Ne pas retourner de valeur pour correspondre à Promise<void>
      } else if (data.user && data.session) {

        // L'utilisateur est directement connecté (confirmation email désactivée)
        const user: User = {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.name,
          avatar: data.user.user_metadata?.avatar_url
        }

        set({ user })

        await get().loadSessions()

        toast.success(`Inscription et connexion réussies ! Bienvenue ${data.user.email}`)
        // Ne pas retourner de valeur pour correspondre à Promise<void>
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
      } else if (errorMessage.includes('Timeout')) {
        toast.error('Inscription trop lente, veuillez réessayer')
      } else {
        toast.error(`Erreur d\'inscription: ${errorMessage}`)
      }
      
      throw error
    } finally {

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

    
    // Éviter les initialisations multiples avec un flag dédié
    const currentState = get()
    
    // Utiliser un flag spécifique pour éviter les initialisations multiples
    if ((currentState as any).isInitializing) {

      return
    }
    

    set({ isLoading: true, error: null, isInitializing: true } as any)
    
    try {
      // Récupérer les paramètres URL pour la confirmation email
      const urlParams = new URLSearchParams(window.location.search)
      const accessToken = urlParams.get('access_token')
      const refreshToken = urlParams.get('refresh_token')
      

      
      // Si nous avons des tokens dans l'URL (confirmation email), les traiter
      if (accessToken && refreshToken) {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          

          
          if (error) {
            // Si erreur de time skew, essayer de récupérer la session existante
            if (error.message.includes('issued in the future') || error.message.includes('time skew')) {

              // Nettoyer l'URL et essayer de récupérer la session
              window.history.replaceState({}, document.title, window.location.pathname)
              
              // Attendre un peu pour que le storage custom gère le time skew
              await new Promise(resolve => setTimeout(resolve, 1000))
              
              const { data: sessionData } = await supabase.auth.getSession()
              if (sessionData.session?.user) {
                const user: User = {
                  id: sessionData.session.user.id,
                  email: sessionData.session.user.email!,
                  name: sessionData.session.user.user_metadata?.name,
                  avatar: sessionData.session.user.user_metadata?.avatar_url
                }
                set({ user })
                await get().loadSessions()
              }
            } else {

              throw error
            }
          } else if (data.session?.user) {

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

            toast.success('Email confirmé avec succès !')
          }
        } catch (confirmError) {

          // Continuer avec la récupération de session normale
        }
      }
      
      // Récupération de session normale avec timeout

      
      const sessionPromise = supabase.auth.getSession()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout de session')), 10000)
      )
      
      const { data: { session }, error: sessionError } = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]) as any
      

      
      if (sessionError) {
        // Gérer les erreurs de time skew
        if (sessionError.message.includes('issued in the future') || sessionError.message.includes('time skew')) {
          await supabase.auth.signOut()
          set({ user: null, sessions: [], currentSession: null, error: null })
        }

        throw sessionError
      }
      
      if (session?.user) {

        const user: User = {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.name,
          avatar: session.user.user_metadata?.avatar_url
        }

        set({ user })
        await get().loadSessions()

      } else {

        // Pas de session active, s'assurer que l'état est propre
        set({ user: null, sessions: [], currentSession: null })
      }
    } catch (error) {

      const errorMessage = (error as Error).message
      
      // Ne pas afficher les erreurs de time skew à l'utilisateur
      if (!errorMessage.includes('issued in the future') && !errorMessage.includes('time skew') && !errorMessage.includes('Timeout')) {
        set({ error: errorMessage })
        toast.error('Erreur de connexion: ' + errorMessage)
      } else {
        set({ error: null })
      }
      
      // S'assurer que l'état est propre en cas d'erreur
      set({ user: null, sessions: [], currentSession: null })
    } finally {

      set({ isLoading: false, isInitializing: false } as any)

    }
  },

  // Sandbox execution actions
  setCurrentExecution: (execution) => set({ currentExecution: execution }),
  
  addExecution: (execution) => {
    set({ currentExecution: execution })
  },
  
  clearExecution: () => set({ currentExecution: null }),

}))