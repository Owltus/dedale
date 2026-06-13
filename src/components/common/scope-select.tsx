import { ChevronDown } from 'lucide-react'
import { useSiteContext } from '@/lib/site-context'
import { Select } from '@/components/ui/select'
import { SCOPE_ALL, SCOPE_COMMUN } from '@/lib/scope'
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
   * VERROUILLÉ : non ouvrable, sans chevron — indicateur d'origine en lecture
   * seule (le périmètre est fixé par la catégorie dans laquelle on est entré).
   */
  disabled?: boolean
}

/**
 * Sélecteur de périmètre partagé : « Tout » / « Commun » / un par site (par nom).
 * Largeur FIXE (`w-44`) + chevron custom → rendu strictement identique sur toutes
 * les pages et tous les onglets de la Bibliothèque.
 *
 * À l'état `disabled` (verrouillé), c'est le MÊME `<select>` (même gabarit, même
 * largeur) mais NON ouvrable et SANS chevron : on le neutralise via
 * `pointer-events-none` + `tabIndex=-1` plutôt que par l'attribut natif `disabled`
 * (qui griserait le texte selon le navigateur) → AUCUNE dissonance visuelle.
 */
export function ScopeSelect({
  value,
  onChange,
  allowCommun = true,
  disabled = false,
}: ScopeSelectProps) {
  const { sites } = useSiteContext()
  // Libellé courant : sert d'info-bulle à l'état verrouillé (le `<select>` est
  // neutralisé par pointer-events-none → le title vit sur le conteneur, qui, lui,
  // reçoit le survol). Couvre les noms de site longs tronqués par w-44.
  const label =
    value === SCOPE_ALL
      ? 'Tout'
      : value === SCOPE_COMMUN
        ? 'Commun'
        : (sites.find((s) => s.id === value)?.nom ?? value)
  return (
    <div className="relative inline-flex" title={disabled ? label : undefined}>
      <Select
        aria-label="Périmètre"
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        value={value}
        // Verrouillé : on neutralise aussi le handler (en plus de
        // pointer-events-none / tabIndex=-1) pour ne jamais muter le périmètre.
        onChange={(e) => {
          if (!disabled) onChange?.(e.target.value)
        }}
        // Largeur fixe + place du chevron réservée (`pr-8`), dessiné en overlay
        // ci-dessous uniquement à l'état interactif.
        className={cn(
          'h-9 w-44 appearance-none truncate pr-8',
          disabled && 'pointer-events-none',
        )}
      >
        <option value={SCOPE_ALL}>Tout</option>
        {allowCommun && <option value={SCOPE_COMMUN}>Commun</option>}
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom}
          </option>
        ))}
      </Select>
      {!disabled && (
        <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
      )}
    </div>
  )
}
