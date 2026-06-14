import { useSiteContext } from '@/lib/site-context'
import { SelectMenu } from '@/components/common/select-menu'
import { SCOPE_COMMUN } from '@/lib/scope'
import { cn } from '@/lib/utils'

interface ScopeSelectProps {
  value: string
  /** Optionnel : inutile à l'état verrouillé (lecture seule). */
  onChange?: (scope: string) => void
  /**
   * Inclure l'option « Commun » (site_id NULL). `false` pour les catalogues à
   * scope SITE strict, qui n'ont pas de niveau commun.
   */
  allowCommun?: boolean
  /**
   * VERROUILLÉ : vrai `<select>` NATIVEMENT désactivé (grisé, non ouvrable, hors
   * tabulation) — indicateur d'origine en lecture seule quand le périmètre est fixé
   * par la catégorie / le modèle ouvert. Pas de simulacre : `disabled` natif.
   */
  disabled?: boolean
  /**
   * Largeur FLUIDE : pleine largeur sous `sm`, puis `w-44` à partir de `sm`. Pour
   * les en-têtes empilés sur mobile où le sélecteur occupe sa propre ligne. Défaut :
   * largeur fixe `w-44` (inchangé pour les autres pages).
   */
  fluid?: boolean
}

/**
 * Sélecteur de périmètre partagé : « Tout » / « Commun » / un par site (par nom).
 * Chevron custom (le natif est retiré via `appearance-none`). Largeur fixe `w-44`
 * par défaut, ou FLUIDE (`fluid`) pour les en-têtes empilés sur mobile.
 *
 * À l'état `disabled` (verrouillé en descente), c'est le MÊME `<select>` mais
 * NATIVEMENT désactivé : grisé, non ouvrable, hors tabulation — un VRAI menu
 * déroulant désactivé, pas un simulacre. Le chevron reste affiché (grisé) pour
 * qu'il se lise bien comme un dropdown.
 */
export function ScopeSelect({
  value,
  onChange,
  allowCommun = true,
  disabled = false,
  fluid = false,
}: ScopeSelectProps) {
  const { sites } = useSiteContext()
  // Libellé courant : info-bulle à l'état verrouillé (portée sur le CONTENEUR — un
  // `<select>` désactivé ne montre pas toujours son `title`). Couvre les noms de
  // site longs tronqués par `w-44`.
  const label =
    value === SCOPE_COMMUN
      ? 'Commun'
      : (sites.find((s) => s.id === value)?.nom ?? value)
  return (
    <SelectMenu
      aria-label="Périmètre"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      // Verrouillé : info-bulle portée par le conteneur (cf. SelectMenu).
      title={disabled ? label : undefined}
      containerClassName={cn(fluid && 'flex w-full sm:inline-flex sm:w-auto')}
      className={fluid ? 'w-full sm:w-44' : 'w-44'}
    >
      {allowCommun && <option value={SCOPE_COMMUN}>Commun</option>}
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nom}
        </option>
      ))}
    </SelectMenu>
  )
}
