import { Fragment, type CSSProperties } from 'react'
import { Check, ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react'
import { toneToken } from '@/components/common/charts/chart-tokens'
import { cn } from '@/lib/utils'
import {
  statutCapexTone,
  type NoeudCapex,
} from '@/features/investissements/etat'

const ETAT_SR: Record<NoeudCapex['etat'], string> = {
  fait: 'franchi',
  actuel: 'le dossier est ici',
  avenir: 'à venir',
}

/** Couleur de la case où se trouve le dossier : celle de son statut. */
function styleActuel(statutId: number): CSSProperties {
  // Un statut gris (Demandé, Annulé) se lirait comme « rien » : la case où
  // l'on est prend alors la couleur principale de l'appli.
  const tone = statutCapexTone(statutId)
  const c = tone === 'neutral' ? 'var(--primary)' : toneToken(tone)
  return {
    borderColor: c,
    backgroundColor: `color-mix(in oklch, ${c} 14%, transparent)`,
    boxShadow: `0 0 0 3px color-mix(in oklch, ${c} 22%, transparent)`,
  }
}

function Case({
  noeud,
  onClick,
  disabled,
  className,
}: {
  noeud: NoeudCapex
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  const contenu = (
    <>
      <span className="flex items-center gap-1.5 font-medium">
        {noeud.etat === 'fait' && (
          <Check aria-hidden className="size-3.5 shrink-0 text-success" />
        )}
        <span className="truncate">{noeud.libelle}</span>
      </span>
      {noeud.precision && (
        <span className="text-xs text-muted-foreground">{noeud.precision}</span>
      )}
      <span className="sr-only">{ETAT_SR[noeud.etat]}</span>
    </>
  )
  const classes = cn(
    'flex min-w-0 flex-col items-start rounded-lg border px-3 py-2 text-left text-sm',
    noeud.etat === 'fait' && 'border-success/40 bg-success/5',
    noeud.etat === 'avenir' && 'border-dashed text-muted-foreground',
    className,
  )
  const style =
    noeud.etat === 'actuel' ? styleActuel(noeud.statutId) : undefined
  if (onClick && noeud.etat !== 'actuel')
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={`Passer à « ${noeud.libelle} »`}
        className={cn(
          classes,
          'cursor-pointer transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {contenu}
      </button>
    )
  return (
    <div
      className={classes}
      style={style}
      aria-current={noeud.etat === 'actuel' ? 'step' : undefined}
    >
      {contenu}
    </div>
  )
}

/**
 * Schéma du parcours d'un investissement (demande PO du 10/11/2026) : le
 * chemin normal en une ligne (en colonne sur téléphone), puis les sorties
 * possibles. La case colorée = où en est le dossier. Les cases du chemin
 * restent cliquables pour corriger un statut (statut libre côté base).
 */
export function ParcoursCapex({
  chemin,
  sorties,
  onEtape,
  disabled,
}: {
  chemin: NoeudCapex[]
  sorties: NoeudCapex[]
  onEtape?: (statutId: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-3">
      <ol
        aria-label="Parcours du dossier"
        className="flex flex-col gap-1 md:flex-row md:items-stretch"
      >
        {chemin.map((n, i) => (
          <Fragment key={n.statutId}>
            {i > 0 && (
              <li
                aria-hidden
                className={cn(
                  'flex items-center justify-center',
                  n.etat === 'avenir' ? 'text-border' : 'text-success',
                )}
              >
                <ChevronDown className="size-4 md:hidden" />
                <ChevronRight className="hidden size-4 md:block" />
              </li>
            )}
            <li className="flex min-w-0 md:flex-1">
              <Case
                noeud={n}
                disabled={disabled}
                className="w-full"
                onClick={onEtape ? () => onEtape(n.statutId) : undefined}
              />
            </li>
          </Fragment>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-dashed pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CornerDownRight aria-hidden className="size-4" />
          Sorties possibles :
        </span>
        {sorties.map((n) => (
          <Case key={n.statutId} noeud={n} />
        ))}
        <span className="text-xs text-muted-foreground">
          « Relancer » ramène à Demandé
        </span>
      </div>
    </div>
  )
}
