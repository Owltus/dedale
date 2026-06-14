import type { ReactNode } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { ListRow } from '@/components/common/list-row'
import { Badge } from '@/components/ui/badge'

interface OperationRowProps {
  nom: string
  description?: string | null
  /** Libellé du type d'opération (ex. « Contrôle visuel », « Mesure »). */
  typeLibelle: string
  /** Le type attend des seuils (mesure) → on affiche les valeurs plutôt que le libellé. */
  necessiteSeuils: boolean
  seuilMin: number | null
  seuilMax: number | null
  uniteSymbole?: string | null
  /** Boutons d'action (icônes), révélés au survol par ListRow. */
  actions?: ReactNode
}

// Représentation texte des seuils (avec l'unité). Vide si aucun seuil.
function formatSeuils(
  min: number | null,
  max: number | null,
  sym: string,
): string {
  if (min !== null && max !== null)
    return `${String(min)} – ${String(max)} ${sym}`.trim()
  if (min !== null) return `≥ ${String(min)} ${sym}`.trim()
  if (max !== null) return `≤ ${String(max)} ${sym}`.trim()
  return ''
}

/**
 * Carte d'une OPÉRATION / TÂCHE, réutilisable partout où l'on liste des
 * opérations (gamme « Opérations spécifiques », items d'un modèle d'opération,
 * etc.) : ligne fine (`h-12`) à icône + libellé + sous-titre, avec un emplacement
 * « Type » À POSITION FIXE (largeur constante) qui affiche le libellé du type —
 * SAUF pour une mesure renseignée, où l'on montre directement les seuils. Source
 * unique de cette présentation (esprit composant réutilisable).
 */
export function OperationRow({
  nom,
  description,
  typeLibelle,
  necessiteSeuils,
  seuilMin,
  seuilMax,
  uniteSymbole,
  actions,
}: OperationRowProps) {
  const seuils = formatSeuils(seuilMin, seuilMax, uniteSymbole ?? '')
  const typeAffiche = necessiteSeuils && seuils ? seuils : typeLibelle
  return (
    <ListRow
      className="h-12"
      media={
        <span className="bg-muted text-muted-foreground flex size-full items-center justify-center">
          <ClipboardCheck className="size-8" />
        </span>
      }
      title={nom}
      subtitle={description?.trim() ? description.trim() : undefined}
      meta={
        // `title` = repli pour lire la valeur COMPLÈTE au survol si une mesure
        // dépasse la case fixe (truncate).
        <span className="flex w-32 justify-center" title={typeAffiche}>
          <Badge
            variant="outline"
            className="max-w-full truncate tabular-nums"
          >
            {typeAffiche}
          </Badge>
        </span>
      }
      actions={actions}
    />
  )
}
