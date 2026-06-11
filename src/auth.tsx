import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/supabase'

export interface AuthState {
  session: Session | null
  isLoading: boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    // Session restaurée au démarrage (depuis le stockage local).
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsLoading(false)
    })

    // Connexion / déconnexion / refresh de token.
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession)
        // À la déconnexion, on purge tout le cache TanStack Query : ses clés
        // (ex. ['current_role']) ne sont pas liées à l'utilisateur, donc sans
        // ce clear le compte suivant hériterait des données du précédent
        // (rôle, profil, listes) tant que le staleTime n'a pas expiré.
        if (event === 'SIGNED_OUT') {
          queryClient.clear()
        }
      },
    )

    return () => sub.subscription.unsubscribe()
  }, [queryClient])

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
