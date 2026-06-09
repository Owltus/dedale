import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ScopeContext, type ScopeContextValue } from '@/hooks/use-scope'
import { useSiteContext } from '@/lib/site-context'
import { SCOPE_ALL } from '@/lib/scope'

/**
 * Fournit un périmètre PARTAGÉ aux onglets de la Bibliothèque : la valeur choisie
 * dans un onglet est conservée quand on change d'onglet.
 *
 * Défaut = le SITE ACTIF — seule valeur qui s'affiche à l'IDENTIQUE sur tous les
 * onglets, y compris les modèles de DI (scope site strict, sans « Commun »). À
 * défaut de site actif (ex. vue multi-sites), on retombe sur « Tout ». « Commun »
 * reste disponible dans la liste (sauf DI), mais n'est jamais le défaut.
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const { activeSiteId } = useSiteContext()
  const [scope, setScope] = useState<string>(() => activeSiteId ?? SCOPE_ALL)
  const value = useMemo<ScopeContextValue>(() => ({ scope, setScope }), [scope])
  return <ScopeContext value={value}>{children}</ScopeContext>
}
