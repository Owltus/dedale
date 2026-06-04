import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sitesQueries } from '@/features/sites/queries'
import type { Database } from '@/lib/database.types'

type Site = Database['public']['Tables']['sites']['Row']

interface SiteContextValue {
  sites: Site[]
  activeSiteId: string | null
  activeSite: Site | null
  setActiveSiteId: (id: string) => void
  isPending: boolean
}

const STORAGE_KEY = 'dedale-site'
const SiteContext = createContext<SiteContextValue | undefined>(undefined)

export function SiteProvider({ children }: { children: ReactNode }) {
  const { data: sites = [], isPending } = useQuery(sitesQueries.mine())
  const [storedId, setStoredId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )

  // Site actif : le site stocké s'il est toujours accessible, sinon le premier.
  const activeSiteId =
    sites.find((s) => s.id === storedId)?.id ?? sites[0]?.id ?? null

  // Persiste le site actif (au premier chargement comme après un changement).
  useEffect(() => {
    if (activeSiteId) {
      localStorage.setItem(STORAGE_KEY, activeSiteId)
    }
  }, [activeSiteId])

  const value = useMemo<SiteContextValue>(
    () => ({
      sites,
      activeSiteId,
      activeSite: sites.find((s) => s.id === activeSiteId) ?? null,
      setActiveSiteId: (id) => {
        setStoredId(id)
      },
      isPending,
    }),
    [sites, activeSiteId, isPending],
  )

  return <SiteContext value={value}>{children}</SiteContext>
}

export function useSiteContext(): SiteContextValue {
  const ctx = useContext(SiteContext)
  if (!ctx) {
    throw new Error(
      'useSiteContext doit être utilisé à l’intérieur de <SiteProvider>',
    )
  }
  return ctx
}
