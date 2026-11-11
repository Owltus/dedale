import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Check, FileText, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Devis } from '@/features/investissements/queries'
import { formatEuros } from '@/features/investissements/format'
import { MIME_PDF, validerFichier } from '@/features/documents/upload'
import { cn } from '@/lib/utils'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { RowContextMenuContent } from '@/components/common/row-actions'
import type { ModeDevis } from './schema-capex'

/** Attribut posé sur la colonne : le dépôt pleine page de la fiche l'ignore. */
export const ATTR_ZONE_DEVIS = 'data-zone-devis'

/** Vrai si un fichier est tombé SUR la colonne des devis (elle le traite). */
export function estDansZoneDevis(cible: EventTarget | null): boolean {
  return (
    cible instanceof Element && cible.closest(`[${ATTR_ZONE_DEVIS}]`) !== null
  )
}

/** Type de la cible dnd-kit : un document de la liste glissé sur la colonne. */
export const CIBLE_DEVIS = 'colonne-devis'

const aDesFichiers = (e: DragEvent) => e.dataTransfer.types.includes('Files')

/** Une tuile de la colonne aussi haute que les cases du schéma. */
const TUILE =
  'flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-sm shadow-xs transition duration-150'

interface ColonneDevisProps {
  /**
   * `grille` : une rangée égale par tuile, sur toute la hauteur (schéma
   * large — les flèches visent le centre de chaque rangée) ; `pile` : les
   * tuiles l'une sous l'autre (schéma étroit).
   */
  mode: ModeDevis
  devis: readonly Devis[]
  /** Nom du PDF de chaque devis, par id de document. */
  nomsPdf: Map<string, string>
  canManage: boolean
  /** Projet validé ou réalisé : les devis non retenus s'estompent. */
  choixFait: boolean
  /** Un fichier est en train d'être glissé sur la page. */
  glissement: boolean
  onApercu: (d: Devis) => void
  onModifier: (d: Devis) => void
  /** Nouveau devis, avec le PDF qu'on vient de lâcher s'il y en a un. */
  onAjouter: (fichier: File | null) => void
  onRetenir: (d: Devis, retenu: boolean) => void
  onSupprimer: (d: Devis) => void
}

/**
 * Colonne des DEVIS d'un projet (147, demande PO du 11/11/2026), accrochée à
 * « Proposition » dans le schéma. Chaque devis : fournisseur, objet, montant
 * HT ; retenu = vert et coché, et une fois le projet validé les autres
 * s'estompent (nets au survol).
 *
 * Purement présentationnelle : les fenêtres (devis, aperçu, suppression)
 * vivent dans la fiche — le schéma est rendu DEUX fois (large / étroit), une
 * fenêtre par exemplaire s'ouvrirait en double.
 *
 * - Clic : aperçu du PDF (sinon, modification du devis).
 * - Clic droit / appui long : modifier, retenir ou non, supprimer.
 * - PDF de l'ordinateur lâché sur la colonne, ou document de la liste glissé
 *   dessus : fenêtre « Nouveau devis » pré-remplie.
 */
export function ColonneDevis({
  mode,
  devis,
  nomsPdf,
  canManage,
  choixFait,
  glissement,
  onApercu,
  onModifier,
  onAjouter,
  onRetenir,
  onSupprimer,
}: ColonneDevisProps) {
  const [survol, setSurvol] = useState(false)
  const profondeur = useRef(0)
  // Id PROPRE à chaque exemplaire (schéma large / étroit, l'un masqué) : un
  // id partagé laisserait l'exemplaire masqué capter le dépôt.
  const rangees = rangeesColonneDevis(devis.length, canManage)
  const { setNodeRef, isOver } = useDroppable({
    id: `${CIBLE_DEVIS}-${useId()}`,
    data: { type: CIBLE_DEVIS },
    disabled: !canManage,
  })
  const cible = survol || isOver

  const surDepot = canManage
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!aDesFichiers(e)) return
          profondeur.current += 1
          setSurvol(true)
        },
        onDragLeave: (e: DragEvent) => {
          if (!aDesFichiers(e)) return
          profondeur.current = Math.max(0, profondeur.current - 1)
          if (profondeur.current === 0) setSurvol(false)
        },
        onDrop: (e: DragEvent) => {
          if (!aDesFichiers(e)) return
          e.preventDefault()
          profondeur.current = 0
          setSurvol(false)
          const fichier = e.dataTransfer.files[0]
          if (!fichier) return
          const erreur = validerFichier(fichier, MIME_PDF)
          if (erreur) toast.error(erreur)
          else onAjouter(fichier)
        },
      }
    : {}

  return (
    <div
      ref={setNodeRef}
      {...{ [ATTR_ZONE_DEVIS]: '' }}
      {...surDepot}
      className={cn(
        'w-full rounded-xl transition',
        mode === 'grille' ? 'grid' : 'flex flex-col gap-2',
        canManage && glissement && 'ring-2 ring-info/40 ring-offset-2',
        cible && 'bg-info/10 ring-2 ring-info ring-offset-2',
      )}
      style={
        mode === 'grille'
          ? { gridTemplateRows: `repeat(${String(rangees)}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {devis.map((d) => (
        <Rangee key={d.id} mode={mode}>
          <TuileDevis
            key={d.id}
            d={d}
            nomPdf={d.document_id ? nomsPdf.get(d.document_id) : undefined}
            canManage={canManage}
            estompe={choixFait && !d.retenu}
            onApercu={onApercu}
            onModifier={onModifier}
            onRetenir={onRetenir}
            onSupprimer={onSupprimer}
          />
        </Rangee>
      ))}
      {canManage && (
        <Rangee mode={mode}>
          <button
            type="button"
            onClick={() => onAjouter(null)}
            className={cn(
              TUILE,
              'cursor-pointer justify-center border-dashed font-medium text-muted-foreground hover:border-info hover:text-foreground',
              devis.length > 0 && 'min-h-11 py-2',
            )}
          >
            <Plus aria-hidden className="size-4" />
            {cible
              ? 'Lâche ici pour ajouter un devis'
              : devis.length === 0
                ? 'Ajouter un devis (ou glisse son PDF)'
                : 'Ajouter un devis'}
          </button>
        </Rangee>
      )}
      {!canManage && devis.length === 0 && (
        <Rangee mode={mode}>
          <div
            className={cn(
              TUILE,
              'justify-center border-dashed text-muted-foreground',
            )}
          >
            Aucun devis
          </div>
        </Rangee>
      )}
    </div>
  )
}

/** Rangées de la colonne : les devis, plus « Ajouter » ou « Aucun devis ». */
export function rangeesColonneDevis(nbDevis: number, canManage: boolean) {
  return nbDevis + (canManage || nbDevis === 0 ? 1 : 0)
}

/** Une rangée : la tuile centrée dans sa hauteur (grille), ou telle quelle. */
function Rangee({ mode, children }: { mode: ModeDevis; children: ReactNode }) {
  if (mode === 'pile') return children
  return <div className="flex min-h-0 items-center py-1.5">{children}</div>
}

function TuileDevis({
  d,
  nomPdf,
  canManage,
  estompe,
  onApercu,
  onModifier,
  onRetenir,
  onSupprimer,
}: {
  d: Devis
  nomPdf: string | undefined
  canManage: boolean
  estompe: boolean
  onApercu: (d: Devis) => void
  onModifier: (d: Devis) => void
  onRetenir: (d: Devis, retenu: boolean) => void
  onSupprimer: (d: Devis) => void
}) {
  const cliquable = d.document_id !== null || canManage
  // Case RONDE = retenir (pré-valider) le devis, demande PO ; le reste de la
  // tuile ouvre son PDF.
  const caseRonde = (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition',
        d.retenu
          ? 'border-success bg-success text-success-foreground'
          : 'border-muted-foreground/40 bg-card',
      )}
    >
      {d.retenu && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
    </span>
  )
  const tuile = (
    <div
      className={cn(
        TUILE,
        '@container gap-2 px-2',
        d.retenu ? 'border-success/60 bg-success/5' : 'border-info/40',
        estompe &&
          'opacity-30 saturate-50 focus-within:opacity-100 hover:opacity-100 hover:saturate-100',
      )}
    >
      {canManage ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={d.retenu}
          aria-label={
            d.retenu
              ? `Ne plus retenir le devis ${d.fournisseur}`
              : `Retenir le devis ${d.fournisseur}`
          }
          title={d.retenu ? 'Ne plus retenir' : 'Retenir ce devis'}
          onClick={() => onRetenir(d, !d.retenu)}
          className="cursor-pointer rounded-full p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {caseRonde}
        </button>
      ) : (
        <span className="p-1">{caseRonde}</span>
      )}
      <button
        type="button"
        disabled={!cliquable}
        onClick={() => (d.document_id ? onApercu(d) : onModifier(d))}
        title={nomPdf ?? (canManage ? 'Modifier le devis' : undefined)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-lg text-left',
          cliquable &&
            'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex items-center gap-1.5 truncate font-medium">
            {d.document_id && (
              <FileText aria-hidden className="size-3.5 shrink-0 text-info" />
            )}
            <span className="truncate">{d.fournisseur}</span>
          </span>
          <span className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {d.objet ?? nomPdf ?? 'Sans PDF'}
          </span>
        </span>
        <span className="shrink-0 pr-1 text-xs font-semibold whitespace-nowrap tabular-nums @min-[15rem]:text-sm">
          {formatEuros(d.montant_ht)}
        </span>
      </button>
    </div>
  )
  if (!canManage) return tuile
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{tuile}</ContextMenuTrigger>
      <RowContextMenuContent
        actions={[
          {
            label: 'Modifier le devis',
            icon: Pencil,
            onSelect: () => onModifier(d),
          },
          d.retenu
            ? {
                label: 'Ne plus retenir',
                icon: Undo2,
                onSelect: () => onRetenir(d, false),
              }
            : {
                label: 'Retenir ce devis',
                icon: Check,
                onSelect: () => onRetenir(d, true),
              },
          {
            label: 'Supprimer le devis',
            icon: Trash2,
            destructive: true,
            separatorBefore: true,
            onSelect: () => onSupprimer(d),
          },
        ]}
      />
    </ContextMenu>
  )
}
