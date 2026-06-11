import { useSiteContext } from '@/lib/site-context'
import { Select } from '@/components/ui/select'
import { SCOPE_ALL, SCOPE_COMMUN } from '@/lib/scope'

interface ScopeSelectProps {
  value: string
  onChange: (scope: string) => void
  /**
   * Inclure l'option « Commun » (site_id NULL). `false` pour les catalogues à
   * scope SITE strict, qui n'ont pas de niveau commun.
   */
  allowCommun?: boolean
}

/**
 * Sélecteur de périmètre partagé : « Tout » / « Commun » / un par site (par nom).
 * Monté à droite du bouton + des onglets de la Bibliothèque (via `useTabAddAction`).
 */
export function ScopeSelect({
  value,
  onChange,
  allowCommun = true,
}: ScopeSelectProps) {
  const { sites } = useSiteContext()
  return (
    <Select
      aria-label="Périmètre"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-auto"
    >
      <option value={SCOPE_ALL}>Tout</option>
      {allowCommun && <option value={SCOPE_COMMUN}>Commun</option>}
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nom}
        </option>
      ))}
    </Select>
  )
}
