import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { StatusTone } from '@/components/common/status-badge'
import { cn } from '@/lib/utils'

export interface DetailHeaderField {
  label: string
  /** Valeur affichée ; « — » si null. */
  value: string | null
  /** Tonalité optionnelle : colore la valeur (ex. écart budgétaire en dépassement). */
  tone?: StatusTone
}

// Couleur de texte d'une valeur selon sa tonalité (tokens sémantiques, pas de dur).
const FIELD_TONE: Record<StatusTone, string> = {
  neutral: '',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  info: 'text-info',
  violet: 'text-violet',
  yellow: 'text-yellow',
}

/** Cellule : intitulé EN HAUT (petit, muté), valeur EN BAS (medium, tronquée). */
function Champ({ label, value, tone }: DetailHeaderField) {
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          'truncate text-sm font-medium tabular-nums',
          tone && FIELD_TONE[tone],
        )}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

interface DetailHeaderCardProps {
  /** Vignette carrée à gauche (ex. `<MiniatureThumb … />`). OPTIONNELLE. */
  thumbnail?: ReactNode
  /**
   * Icône de repli quand il n'y a PAS de vignette (fiches sans image : utilisateur,
   * demande…) : un carré gris + l'icône centrée. Ignorée si `thumbnail` est fourni.
   */
  fallbackIcon?: LucideIcon
  /**
   * Champs de la grille. Un élément `null` rend une cellule VIDE (placeholder)
   * qui préserve l'alignement de la grille sans afficher « — » — utile pour
   * masquer une info absente sans décaler les colonnes.
   */
  fields: (DetailHeaderField | null)[]
  /** Nombre de colonnes de la grille (défaut 3). */
  columns?: 2 | 3
  className?: string
}

/**
 * Carte d'en-tête d'une fiche détail : vignette carrée (ou icône de repli) à gauche
 * + grille compacte d'informations (intitulé au-dessus de la valeur), hauteur fixe
 * `h-20`. Brique PARTAGÉE (OT, gamme, équipement, investissement, utilisateur,
 * demande…) — source unique du rendu de la carte d'en-tête.
 *
 * La brique porte AUSSI ses mesures : la marge basse (`mb-4`) et la taille de
 * l'icône de repli. Laissées à l'appelant, elles avaient divergé — trois marges
 * (`mb-6`, `mb-4`, aucune) sur sept fiches, et une icône de repli tantôt
 * `size-8` tantôt `size-10` dans le même carré de 80 px, si bien qu'un
 * prestataire sans photo avait une icône plus petite sur sa fiche que sur sa
 * ligne de liste. Un espacement laissé à sept appelants diverge mécaniquement.
 */
export function DetailHeaderCard({
  thumbnail,
  fallbackIcon: FallbackIcon,
  fields,
  columns = 3,
  className,
}: DetailHeaderCardProps) {
  return (
    <div
      className={cn(
        'mb-4 flex h-20 items-stretch overflow-hidden rounded-lg border bg-card',
        className,
      )}
    >
      {thumbnail !== undefined ? (
        <div className="aspect-square h-full shrink-0">{thumbnail}</div>
      ) : FallbackIcon ? (
        <div className="flex aspect-square h-full shrink-0 items-center justify-center bg-muted text-muted-foreground">
          {/* size-10 : la MÊME taille que RowMediaIcon impose dans les listes,
              pour qu'une entité sans image ait la même icône des deux côtés. */}
          <FallbackIcon className="size-10" />
        </div>
      ) : null}
      <div
        className={cn(
          'grid min-w-0 flex-1 content-center gap-x-4 gap-y-1 px-4',
          columns === 2 ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        {fields.map((f, i) =>
          f ? (
            <Champ key={i} label={f.label} value={f.value} tone={f.tone} />
          ) : (
            <div key={i} />
          ),
        )}
      </div>
    </div>
  )
}
