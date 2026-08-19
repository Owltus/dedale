import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Paperclip } from 'lucide-react'
import {
  tacheSchema,
  emptyTache,
  type TacheFormValues,
} from '@/features/equipements/tache-schema'
import type { TacheItem } from './tache-row'
import { LocalEquipementFields } from './local-equipement-fields'
import { EmplacementSelect } from './emplacement-select'
import type { LiaisonTable } from '@/features/documents/queries'
import { DocumentsTab } from '@/components/common/documents-tab'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { TextareaField } from '@/components/common/fields/textarea-field'

interface TacheDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Site actif : périmètre des locaux/équipements chargés. */
  siteId: string
  /** Tâche à MODIFIER. Absent = ajout d'une nouvelle tâche. */
  tache?: TacheItem | null
  /** Création OU modification : la feature appelante fournit l'écriture. */
  onSubmit: (values: TacheFormValues) => Promise<unknown>
  /**
   * Coordonnées de la table de liaison documents de la FICHE parente
   * (travaux/événement) — permet de lister/rattacher les documents propres à
   * CETTE tâche (`tache_id`). Rendu seulement en modification : une tâche pas
   * encore créée n'a pas d'id auquel rattacher un document.
   */
  documents?: {
    liaison: LiaisonTable
    parentColumn: string
    parentId: string
  }
}

/**
 * Ajout OU modification d'une tâche généralisée (090) : un libellé libre
 * (identité, requis), un lieu facultatif (local + équipement, cascade
 * `EmplacementSelect`), un commentaire facultatif, et — en modification
 * seulement — les documents rattachés spécifiquement à cette tâche. Brique
 * commune Travaux/Événements : la feature appelante fournit `onSubmit`
 * (create ou update selon la présence de `tache`) et les coordonnées de sa
 * table de liaison documents.
 */
export function TacheDialog({
  open,
  onOpenChange,
  siteId,
  tache,
  onSubmit,
  documents,
}: TacheDialogProps) {
  const isEdit = Boolean(tache)

  const form = useForm<TacheFormValues>({
    resolver: zodResolver(tacheSchema),
    defaultValues: tache
      ? {
          libelle: tache.libelle,
          local_id: tache.local_id ?? '',
          equipement_id: tache.equipement_id ?? '',
          commentaire: tache.commentaire ?? '',
        }
      : emptyTache(),
  })
  const submit = useSubmitDialog<TacheFormValues>({
    onSubmit,
    successMessage: isEdit ? 'Tâche modifiée' : 'Tâche ajoutée',
    close: () => onOpenChange(false),
  })

  // Pont vers `LocalEquipementFields` (API contrôlée par props, hors RHF) : on lit
  // le couple local/équipement via `watch`, on le réécrit via `setValue`. On ne
  // revalide qu'APRÈS une première tentative de soumission (`isSubmitted`), comme
  // le fait le resolver sur les champs RHF standards.
  const { errors, isSubmitted, isSubmitting } = form.formState
  const localId = useWatch({ control: form.control, name: 'local_id' })
  const equipementId = useWatch({
    control: form.control,
    name: 'equipement_id',
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier la tâche' : 'Ajouter une tâche'}
        description="Un libellé suffit ; le lieu, le commentaire et les documents sont facultatifs."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Ajouter'}
        pendingLabel={isEdit ? 'Enregistrement…' : 'Ajout…'}
        pending={isSubmitting}
        size="lg"
      >
        <div className="grid gap-4">
          <TextField
            control={form.control}
            name="libelle"
            label="Libellé"
            required
            placeholder="Ex. Livraison et déballage"
          />

          <LocalEquipementFields
            siteId={siteId}
            localId={localId}
            equipementId={equipementId}
            onChange={({
              localId: nextLocalId,
              equipementId: nextEquipementId,
            }) => {
              form.setValue('local_id', nextLocalId, {
                shouldValidate: isSubmitted,
              })
              form.setValue('equipement_id', nextEquipementId, {
                shouldValidate: isSubmitted,
              })
            }}
            errors={{
              local_id: errors.local_id?.message,
              equipement_id: errors.equipement_id?.message,
            }}
            equipementLabel="Équipement concerné"
            equipementEnAside
            renderLieu={(p) => (
              <EmplacementSelect {...p} requiredEmplacement={false} />
            )}
          />

          <TextareaField
            control={form.control}
            name="commentaire"
            label="Commentaire"
            rows={3}
          />

          {isEdit && tache && documents && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <Paperclip className="size-3.5" />
                  Documents de cette tâche
                </h3>
                <DocumentsTab
                  liaison={documents.liaison}
                  parentColumn={documents.parentColumn}
                  parentId={documents.parentId}
                  tacheId={tache.id}
                />
              </div>
            </>
          )}
        </div>
      </FormDialog>
    </Form>
  )
}
