import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export interface AuthState {
  session: Session | null
  isLoading: boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Session restaurée au démarrage (depuis le stockage local).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsLoading(false)
    })

    // Connexion / déconnexion / refresh de token.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>')
  }
  return ctx
}
