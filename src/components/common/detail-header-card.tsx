import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DetailHeaderField {
  label: string
  /** Valeur affichée ; « — » si null. */
  value: string | null
}

/** Cellule : intitulé EN HAUT (petit, muté), valeur EN BAS (medium, tronquée). */
function Champ({ label, value }: DetailHeaderField) {
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="text-muted-foreground text-[10px]">{label}</span>
      <span className="truncate text-sm font-medium">{value ?? '—'}</span>
    </div>
  )
}

interface DetailHeaderCardProps {
  /** Vignette carrée à gauche (ex. `<MiniatureThumb … />`). */
  thumbnail: ReactNode
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
 * Carte d'en-tête d'une fiche détail : vignette carrée à gauche + grille compacte
 * d'informations (intitulé au-dessus de la valeur), hauteur fixe `h-20`. Brique
 * PARTAGÉE (OT, gamme…) — source unique du rendu de la carte d'en-tête. L'hôte
 * fournit la vignette et les champs ; il ajoute son espacement via `className`
 * (ex. `mb-4`).
 */
export function DetailHeaderCard({
  thumbnail,
  fields,
  columns = 3,
  className,
}: DetailHeaderCardProps) {
  return (
    <div
      className={cn(
        'bg-card flex h-20 items-stretch overflow-hidden rounded-lg border',
        className,
      )}
    >
      <div className="aspect-square h-full shrink-0">{thumbnail}</div>
      <div
        className={cn(
          'grid min-w-0 flex-1 content-center gap-x-4 gap-y-1 px-4',
          columns === 2 ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        {fields.map((f, i) =>
          f ? <Champ key={i} label={f.label} value={f.value} /> : <div key={i} />,
        )}
      </div>
    </div>
  )
}
