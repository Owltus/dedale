import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ScopeContext, type ScopeContextValue } from '@/hooks/use-scope'
import { useSiteContext } from '@/lib/site-context'
import { SCOPE_COMMUN } from '@/lib/scope'

/**
 * Fournit un périmètre PARTAGÉ aux onglets de la Bibliothèque : la valeur choisie
 * dans un onglet est conservée quand on change d'onglet.
 *
 * Défaut = le SITE ACTIF ; à défaut de site actif (ex. vue multi-sites), on
 * retombe sur « Commun » (le catalogue entreprise). Il n'y a PAS d'option « Tout » :
 * on consulte UN périmètre à la fois (Commun ou un site).
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const { activeSiteId } = useSiteContext()
  const [scope, setScope] = useState<string>(() => activeSiteId ?? SCOPE_COMMUN)
  const value = useMemo<ScopeContextValue>(() => ({ scope, setScope }), [scope])
  return <ScopeContext value={value}>{children}</ScopeContext>
}
