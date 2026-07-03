import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Paperclip } from 'lucide-react'
import { documentsQueries } from '@/features/documents/queries'
import type { LiaisonTable } from '@/features/documents/queries'
import {
  useDeleteDocument,
  useDetachDocument,
  useUploadAndAttach,
} from '@/features/documents/mutations'
import { UploadDocumentDialog } from '@/features/documents/components/upload-document-dialog'
import type { DocumentNamingContext } from '@/features/documents/naming'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { cn } from '@/lib/utils'
import * as perm from '@/lib/permissions'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { DocumentsListe } from '@/components/common/documents-liste'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'

interface DocumentsTabProps {
  /** Nom de la table de liaison (ex. 'documents_ordres_travail'). */
  liaison: LiaisonTable
  /** Colonne FK vers l'entité parente (ex. 'ordre_travail_id'). */
  parentColumn: string
  /** Id de l'entité parente à laquelle rattacher les documents. */
  parentId: string
  /**
   * Restreint les formats acceptés à l'upload (défaut : PDF + WebP). Ex.
   * `MIME_PDF` pour n'autoriser que le PDF (investissements). Transmis tel quel
   * au dialogue d'upload.
   */
  acceptedMimes?: readonly string[]
  /**
   * Titre de section (ex. « Documents »). Si fourni, l'en-tête affiche le titre
   * à gauche et le bouton de rattachement (icône + tooltip) à droite, sur une
   * seule ligne. Sans titre, seul le bouton est rendu (aligné à droite).
   */
  title?: string
  /**
   * Mode CONTRÔLÉ du dialogue d'upload : si l'hôte fournit ce couple, c'est LUI
   * qui ouvre l'upload (typiquement pour poser le bouton « Rattacher » dans sa
   * propre barre de titre). Dans ce mode, l'en-tête interne (titre + bouton)
   * N'EST PAS rendu. Omis → état interne + bouton d'en-tête (comportement par défaut).
   */
  uploadOpen?: boolean
  onUploadOpenChange?: (open: boolean) => void
  /** Fichiers pré-remplis du dialogue (ex. issus d'un glisser-déposer de l'hôte). */
  uploadInitialFiles?: File[]
  /** Type de document pré-sélectionné, par nom (ex. « Devis »). */
  uploadDefaultTypeNom?: string
  /**
   * Classe du conteneur racine. Permet à l'hôte de borner la hauteur (ex.
   * `min-h-0 flex-1` dans une zone `flex flex-col` à hauteur définie) : l'état
   * vide « Aucun document » se centre alors verticalement dans toute la zone.
   */
  className?: string
  /**
   * Contexte de NOMMAGE transmis au dialogue d'upload : si fourni, les fichiers
   * ajoutés sont pré-renommés « [Type] - [Prestataire] - [Objet] - [Date] »
   * (éditable). L'hôte le dérive de sa fiche (ex. OT : prestataire + gamme + date).
   */
  namingContext?: DocumentNamingContext
}

/**
 * Onglet « Documents » réutilisable, à embarquer dans les fiches métier
 * (OT, gammes, contrats, prestataires, locaux, équipements, DI…).
 *
 * Liste les documents rattachés à une entité via sa table de liaison,
 * permet d'uploader+rattacher (doctrine 3 étapes a+b+c) et de détacher.
 *
 * Le droit d'écriture (rattacher/détacher) suit `canManageMetier` — le miroir
 * de la RLS des tables `documents_*` — indépendamment du `canManage` de la
 * fiche hôte : un rôle autorisé en base voit les actions, même si la fiche
 * elle-même est en lecture seule pour lui.
 */
export function DocumentsTab({
  liaison,
  parentColumn,
  parentId,
  acceptedMimes,
  title,
  uploadOpen,
  onUploadOpenChange,
  uploadInitialFiles,
  uploadDefaultTypeNom,
  className,
  namingContext,
}: DocumentsTabProps) {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  // Hard-delete d'un document = manager + technicien sur leurs sites (migration 053).
  const canDelete = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  const query = useQuery(
    documentsQueries.byEntity(liaison, parentColumn, parentId),
  )

  const uploadAttach = useUploadAndAttach()
  const detach = useDetachDocument()
  const del = useDeleteDocument()

  const [internalOpen, setInternalOpen] = useState(false)

  // Mode contrôlé si l'hôte fournit le pilotage de l'ouverture (il pose alors
  // son propre déclencheur, ex. dans la barre de titre) ; sinon, état interne.
  const isControlled = onUploadOpenChange !== undefined
  const open = uploadOpen ?? internalOpen
  const setOpen = onUploadOpenChange ?? setInternalOpen

  const peutAjouter = canManage && activeSiteId
  // En-tête : bouton icône seule + tooltip (style barre de titre réutilisable).
  const headerAction =
    !isControlled && peutAjouter ? (
      <TooltipIconButton
        icon={<Paperclip />}
        label="Rattacher un document"
        variant="outline"
        onClick={() => setOpen(true)}
      />
    ) : undefined
  // État vide : CTA explicite pour amorcer le premier ajout, MAIS seulement en
  // mode autonome. En mode CONTRÔLÉ, l'hôte fournit déjà le déclencheur (bouton
  // de sa barre de titre) → pas de CTA redondant au centre (cohérent avec
  // l'onglet Équipements, dont l'état vide n'a pas d'action).
  const emptyAction =
    !isControlled && peutAjouter ? (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Paperclip /> Rattacher un document
      </Button>
    ) : undefined

  // Le rattachement insère le `site_id` du site actif sur le document.
  if (!activeSiteId) {
    return (
      <EmptyState
        icon={FileText}
        title="Aucun site actif"
        description="Sélectionne un site pour gérer les documents."
      />
    )
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {(title != null || headerAction != null) && (
        <div
          className={cn(
            'flex items-center gap-4',
            title != null ? 'justify-between' : 'justify-end',
          )}
        >
          {title && (
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          )}
          {headerAction}
        </div>
      )}

      <QueryState
        query={query}
        pending={
          <CardSkeletons
            count={3}
            height="h-14"
            container="flex flex-col gap-2"
          />
        }
        empty={
          <EmptyState
            icon={FileText}
            title="Aucun document"
            action={emptyAction}
            className="min-h-40 flex-1 justify-center"
          />
        }
      >
        {(list) => (
          <DocumentsListe
            docs={list}
            canDetach={canManage}
            onDetach={(doc) =>
              detach.mutateAsync({
                liaison,
                parentColumn,
                parentId,
                documentId: doc.id,
              })
            }
            canDelete={canDelete}
            onDelete={(doc) => del.mutateAsync(doc.id)}
          />
        )}
      </QueryState>

      {canManage && (
        <UploadDocumentDialog
          key={open ? 'open' : 'closed'}
          open={open}
          onOpenChange={setOpen}
          siteId={activeSiteId}
          title="Rattacher un document"
          description="Le document est ajouté à la bibliothèque du site puis rattaché à cette fiche."
          onUpload={({ file, uploadedBy, typeDocumentId }) =>
            uploadAttach.mutateAsync({
              file,
              siteId: activeSiteId,
              uploadedBy,
              typeDocumentId,
              liaison,
              parentColumn,
              parentId,
            })
          }
          pending={uploadAttach.isPending}
          acceptedMimes={acceptedMimes}
          initialFiles={uploadInitialFiles}
          defaultTypeNom={uploadDefaultTypeNom}
          namingContext={namingContext}
        />
      )}
    </div>
  )
}
