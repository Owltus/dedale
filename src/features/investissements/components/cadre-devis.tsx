import { useId, useRef, useState, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDroppable } from '@dnd-kit/core'
import { FileText, FileUp, Loader2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { documentsQueries } from '@/features/documents/queries'
import { MIME_PDF } from '@/features/documents/upload'
import { useUploadAndAttach } from '@/features/documents/mutations'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import type { DocumentMeta } from '@/features/documents/format'
import { useDefinirDevis } from '@/features/investissements/mutations'
import { useAuth } from '@/auth'
import { useSiteContext } from '@/lib/site-context'
import { writeErrorMessage } from '@/lib/form'
import { cn } from '@/lib/utils'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  RowContextMenuContent,
  type RowAction,
} from '@/components/common/row-actions'

/** Attribut posé sur la case : le dépôt pleine page de la fiche l'ignore. */
export const ATTR_ZONE_DEVIS = 'data-zone-devis'

/** Vrai si un fichier est tombé SUR la case Devis (elle le traite elle-même). */
export function estDansZoneDevis(cible: EventTarget | null): boolean {
  return (
    cible instanceof Element && cible.closest(`[${ATTR_ZONE_DEVIS}]`) !== null
  )
}

/** Type de la cible de glisser-déposer (dnd-kit) : un document de la liste vers la case. */
export const CIBLE_DEVIS = 'case-devis'

const aDesFichiers = (e: DragEvent) => e.dataTransfer.types.includes('Files')

/**
 * Case « Devis » du schéma (demande PO du 10/11/2026), accrochée SOUS la
 * proposition : elle porte LE devis du dossier (`devis_document_id`, 144) —
 * un seul ; les autres devis restent dans « Documents ».
 *
 * - Fichier de l'ordinateur lâché dessus (ou choisi d'un clic quand la case
 *   est vide) : il est ajouté au dossier ET devient le devis, sans fenêtre.
 * - Document de la liste « Documents » glissé dessus : il devient le devis
 *   (cf. `CIBLE_DEVIS`, géré par la fiche).
 * - Clic sur une case remplie : aperçu du devis.
 * - Clic droit / appui long sur une case remplie : remplacer par un fichier,
 *   ne plus en faire le devis (il repasse alors dans « Documents »).
 */
export function CaseDevis({
  investissementId,
  devisDocumentId,
  fournisseur,
  devisTypeId,
  canManage,
  glissement,
}: {
  investissementId: string
  devisDocumentId: string | null
  fournisseur: string | null
  /** Id du type de document « Devis » (pour un fichier ajouté ici). */
  devisTypeId: number | undefined
  canManage: boolean
  /** Un fichier est en train d'être glissé sur la page. */
  glissement: boolean
}) {
  const { session } = useAuth()
  const { activeSiteId } = useSiteContext()
  const [apercu, setApercu] = useState<DocumentMeta | null>(null)
  const [survol, setSurvol] = useState(false)
  const profondeur = useRef(0)
  const choix = useRef<HTMLInputElement>(null)
  const upload = useUploadAndAttach()
  const definir = useDefinirDevis()
  const { data: docs = [] } = useQuery(
    documentsQueries.byEntity(
      'documents_investissements',
      'investissement_id',
      investissementId,
    ),
  )
  const devis = docs.find((d) => d.id === devisDocumentId) ?? null
  // Id PROPRE à chaque case : le schéma existe en deux exemplaires (large /
  // étroit, l'un masqué) — un id partagé laisserait l'exemplaire masqué
  // capter le dépôt. La fiche reconnaît la cible à son `type`.
  const idCible = `${CIBLE_DEVIS}-${useId()}`
  const { setNodeRef, isOver } = useDroppable({
    id: idCible,
    data: { type: CIBLE_DEVIS },
    disabled: !canManage,
  })
  const occupe = upload.isPending || definir.isPending

  async function deposer(fichier: File | undefined) {
    if (!fichier) return
    if (!(MIME_PDF as readonly string[]).includes(fichier.type)) {
      toast.error('Le devis doit être un PDF.')
      return
    }
    if (!session || !activeSiteId || devisTypeId === undefined) return
    try {
      const doc = await upload.mutateAsync({
        file: fichier,
        siteId: activeSiteId,
        uploadedBy: session.user.id,
        typeDocumentId: devisTypeId,
        liaison: 'documents_investissements',
        parentColumn: 'investissement_id',
        parentId: investissementId,
      })
      await definir.mutateAsync({ id: investissementId, documentId: doc.id })
      toast.success('Devis ajouté')
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

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
          void deposer(e.dataTransfer.files[0])
        },
      }
    : {}

  const cliquable = devis !== null || canManage
  const retirer = () =>
    definir.mutate(
      { id: investissementId, documentId: null },
      {
        onSuccess: () =>
          toast.success('Devis retiré : il reste dans les documents'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  // Menu = ce que le clic ne fait PAS (demande PO) : le clic voit le devis,
  // ou en ajoute un quand la case est vide.
  const menu: RowAction[] = [
    {
      label: 'Remplacer par un fichier…',
      icon: FileUp,
      onSelect: () => choix.current?.click(),
    },
    {
      label: 'Ne plus en faire le devis',
      icon: Unlink,
      onSelect: retirer,
      separatorBefore: true,
    },
  ]
  const cible = survol || isOver

  const caseDevis = (
    <div
      ref={setNodeRef}
      {...{ [ATTR_ZONE_DEVIS]: '' }}
      {...surDepot}
      className="relative flex w-full"
    >
      <button
        type="button"
        disabled={!cliquable || occupe}
        onClick={() => (devis ? setApercu(devis) : choix.current?.click())}
        title={devis ? devis.nom_original : 'Ajouter le devis'}
        className={cn(
          // Comme les autres cases : empilée et centrée quand elle est étroite,
          // sur une ligne quand elle est large (requête de conteneur).
          'flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-card px-2 py-2.5 text-center text-sm font-medium shadow-xs transition duration-150 @min-[15rem]:flex-row @min-[15rem]:justify-start @min-[15rem]:gap-3 @min-[15rem]:px-4 @min-[15rem]:text-left',
          devis ? 'border-info/50' : 'text-muted-foreground',
          cliquable &&
            'cursor-pointer hover:-translate-y-0.5 hover:border-info hover:text-foreground hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
          canManage && glissement && 'border-info',
          cible && 'border-solid border-info bg-info/10',
        )}
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            devis ? 'bg-info/15 text-info' : 'bg-muted text-muted-foreground',
          )}
        >
          {occupe ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : devis ? (
            <FileText aria-hidden className="size-4" />
          ) : (
            <FileUp aria-hidden className="size-4" />
          )}
        </span>
        <span className="flex w-full min-w-0 flex-col leading-tight">
          <span className="truncate">
            Devis
            {fournisseur && (
              <span className="font-normal text-muted-foreground">
                {' '}
                · {fournisseur}
              </span>
            )}
          </span>
          <span className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground">
            {cible
              ? 'Lâche ici pour en faire le devis'
              : devis
                ? devis.nom_original
                : canManage
                  ? 'Clique ou glisse le devis'
                  : 'Aucun devis'}
          </span>
        </span>
      </button>

      <input
        ref={choix}
        type="file"
        accept={MIME_PDF.join(',')}
        className="hidden"
        onChange={(e) => {
          void deposer(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <DocumentPreviewDialog
        doc={apercu}
        onOpenChange={(o) => {
          if (!o) setApercu(null)
        }}
      />
    </div>
  )
  // Menu seulement quand il y a un devis à remplacer ou à détacher.
  if (devis === null || !canManage) return caseDevis
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{caseDevis}</ContextMenuTrigger>
      <RowContextMenuContent actions={menu} />
    </ContextMenu>
  )
}
