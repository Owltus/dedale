import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    // Page protégée : pas de session → on renvoie vers /login.
    if (!context.auth.session) {
      throw redirect({ to: '/login' })
    }
  },
  component: HomePage,
})

function HomePage() {
  const { session } = useAuth()
  const navigate = useNavigate()

  // Lecture du rôle via la RPC public.current_role() : prouve que toute la
  // chaîne front → Supabase (auth + RLS) est branchée. Erreur non bloquante.
  const { data: role, isPending } = useQuery({
    queryKey: ['current_role'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('current_role')
      if (error) throw error
      return data as string | null
    },
  })

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate({ to: '/login' })
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">Dédale</h1>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-slate-700">
          Connecté en tant que{' '}
          <span className="font-medium text-slate-900">
            {session?.user.email}
          </span>
        </p>
        <p className="mt-2 text-slate-700">
          Rôle :{' '}
          <span className="font-medium text-slate-900">
            {isPending ? '…' : (role ?? '— inconnu')}
          </span>
        </p>
      </div>

      <button
        onClick={handleLogout}
        className="mt-6 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        Se déconnecter
      </button>
    </div>
  )
}
