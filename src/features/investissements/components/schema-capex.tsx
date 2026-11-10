import { Fragment, type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { toneToken } from '@/components/common/charts/chart-tokens'
import { cn } from '@/lib/utils'
import {
  statutCapexTone,
  type EtapeSchemaCapex,
  type FlecheSchemaCapex,
} from '@/features/investissements/etat'

const ETAT_SR: Record<EtapeSchemaCapex['etat'], string> = {
  fait: 'étape passée',
  actuel: 'le dossier est ici',
  avenir: 'à venir',
}

/** Couleur de l'étape où est le dossier (gris → couleur principale). */
function styleActuel(statutId: number): CSSProperties {
  const tone = statutCapexTone(statutId)
  const c = tone === 'neutral' ? 'var(--primary)' : toneToken(tone)
  return {
    borderColor: c,
    backgroundColor: `color-mix(in oklch, ${c} 12%, var(--card))`,
    boxShadow: `0 0 0 3px color-mix(in oklch, ${c} 20%, transparent)`,
  }
}

function Boite({ etape }: { etape: EtapeSchemaCapex }) {
  return (
    <div
      aria-current={etape.etat === 'actuel' ? 'step' : undefined}
      style={etape.etat === 'actuel' ? styleActuel(etape.statutId) : undefined}
      className={cn(
        'flex min-h-11 min-w-28 items-center justify-center gap-1.5 rounded-md border-2 bg-card px-4 py-2 text-sm font-medium',
        etape.etat === 'fait' && 'border-success/60',
        etape.etat === 'avenir' && 'border-dashed text-muted-foreground',
      )}
    >
      {etape.etat === 'fait' && (
        <Check aria-hidden className="size-4 shrink-0 text-success" />
      )}
      {etape.libelle}
      <span className="sr-only"> — {ETAT_SR[etape.etat]}</span>
    </div>
  )
}

/** Pointe de flèche (triangle), orientée vers la droite ou vers le bas. */
function Pointe({ bas }: { bas?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={cn('size-2.5 shrink-0 fill-current', bas && 'rotate-90')}
    >
      <path d="M0 0 L10 5 L0 10 z" />
    </svg>
  )
}

/** Flèche étiquetée par l'action qui fait passer à l'étape suivante. */
function Fleche({ fleche }: { fleche: FlecheSchemaCapex }) {
  const couleur = fleche.franchie ? 'text-success' : 'text-muted-foreground/60'
  return (
    <>
      {/* Bureau : horizontale, l'action au-dessus du trait. */}
      <div
        aria-hidden
        className={cn(
          'hidden min-w-24 flex-1 flex-col items-stretch gap-1 px-1 sm:flex sm:max-w-44',
          couleur,
        )}
      >
        <span className="text-center text-xs text-muted-foreground">
          {fleche.libelle}
        </span>
        <span className="flex items-center">
          <span className="h-0.5 flex-1 bg-current" />
          <Pointe />
        </span>
      </div>
      {/* Téléphone : verticale, l'action à côté du trait. */}
      <div
        aria-hidden
        className={cn('flex items-center gap-2 pl-10 sm:hidden', couleur)}
      >
        <span className="flex h-8 flex-col items-center">
          <span className="w-0.5 flex-1 bg-current" />
          <Pointe bas />
        </span>
        <span className="text-xs text-muted-foreground">{fleche.libelle}</span>
      </div>
    </>
  )
}

/**
 * Schéma de la fiche investissement « à la Mermaid » (138, demande PO) :
 * Demandé → Validé → Réalisé, chaque flèche portant l'action qui y mène. La
 * boîte colorée = où en est le dossier. Pas de branche « Refusé » (le badge
 * du titre le dit). Lecture seule : les actions sont les boutons du haut.
 */
export function SchemaCapex({
  etapes,
  fleches,
}: {
  etapes: EtapeSchemaCapex[]
  fleches: FlecheSchemaCapex[]
}) {
  return (
    <div
      role="img"
      aria-label={`Parcours : ${etapes
        .map((e) => `${e.libelle} (${ETAT_SR[e.etat]})`)
        .join(', puis ')}`}
      className="flex flex-col items-start sm:flex-row sm:items-end sm:justify-center"
    >
      {etapes.map((e, i) => {
        const fleche = fleches[i - 1]
        return (
          <Fragment key={e.statutId}>
            {fleche && <Fleche fleche={fleche} />}
            <Boite etape={e} />
          </Fragment>
        )
      })}
    </div>
  )
}
