import { useId, useRef, useState, type DragEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Check, FileText, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Devis } from '@/features/investissements/queries'
import { formatEuros } from '@/features/investissements/format'
import { MIME_PDF, validerFichier } from '@/features/documents/upload'
import { cn } from '@/lib/utils'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { RowContextMenuContent } from '@/components/common/row-actions'

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
        'flex w-full flex-col gap-2 rounded-xl transition',
        canManage && glissement && 'ring-2 ring-info/40 ring-offset-2',
        cible && 'bg-info/10 ring-2 ring-info ring-offset-2',
      )}
    >
      {devis.map((d) => (
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
      ))}
      {canManage && (
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
      )}
      {!canManage && devis.length === 0 && (
        <div
          className={cn(
            TUILE,
            'justify-center border-dashed text-muted-foreground',
          )}
        >
          Aucun devis
        </div>
      )}
    </div>
  )
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
  const tuile = (
    <button
      type="button"
      disabled={!cliquable}
      onClick={() => (d.document_id ? onApercu(d) : onModifier(d))}
      title={nomPdf ?? (canManage ? 'Modifier le devis' : undefined)}
      className={cn(
        TUILE,
        '@container',
        d.retenu ? 'border-success/60 bg-success/5' : 'border-info/40',
        cliquable &&
          'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        estompe &&
          'opacity-30 saturate-50 hover:opacity-100 hover:saturate-100 focus-visible:opacity-100',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          d.retenu ? 'bg-success/15 text-success' : 'bg-info/15 text-info',
        )}
      >
        {d.retenu ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <FileText aria-hidden className="size-4" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate font-medium">{d.fournisseur}</span>
        <span className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {d.objet ?? nomPdf ?? 'Sans PDF'}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold whitespace-nowrap tabular-nums @min-[15rem]:text-sm">
        {formatEuros(d.montant_ht)}
      </span>
    </button>
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
