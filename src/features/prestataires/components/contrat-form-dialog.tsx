import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { contratSchema, emptyContrat } from '../schemas'
import type { ContratFormValues } from '../schemas'
import { useCreateContrat, useUpdateContrat } from '../mutations'
import { typesContratsQueries } from '../queries'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { NumberField } from '@/components/common/number-field'
import type { Database } from '@/lib/database.types'

type Contrat = Database['public']['Tables']['contrats']['Row']

interface ContratFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  prestataireId: string
  contrat?: Contrat | null
}

function initialValues(contrat: Contrat | null | undefined): ContratFormValues {
  if (!contrat) return emptyContrat
  return {
    reference: contrat.reference,
    type_contrat_id: String(contrat.type_contrat_id),
    date_debut: contrat.date_debut,
    date_fin: contrat.date_fin ?? '',
    objet_avenant: contrat.objet_avenant ?? '',
    commentaires: contrat.commentaires ?? '',
    duree_cycle_mois: contrat.duree_cycle_mois,
    delai_preavis_jours: contrat.delai_preavis_jours,
    fenetre_resiliation_jours: contrat.fenetre_resiliation_jours,
    date_signature: contrat.date_signature ?? '',
    date_resiliation: contrat.date_resiliation ?? '',
    date_notification: contrat.date_notification ?? '',
  }
}

export function ContratFormDialog({
  open,
  onOpenChange,
  siteId,
  prestataireId,
  contrat,
}: ContratFormDialogProps) {
  const isEdit = Boolean(contrat)
  const create = useCreateContrat()
  const update = useUpdateContrat()
  const { data: types = [] } = useQuery(typesContratsQueries.list())
  const [values, setValues] = useState<ContratFormValues>(() =>
    initialValues(contrat),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set<K extends keyof ContratFormValues>(
    key: K,
    value: ContratFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  // Affichage conditionnel par type (1 = Déterminé, 2 = Tacite, 3 = Indéterminé).
  const estTacite = values.type_contrat_id === '2'
  const estIndetermine = values.type_contrat_id === '3'

  async function handleSubmit() {
    const parsed = contratSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (contrat) {
        await update.mutateAsync({ id: contrat.id, values: parsed.data })
        toast.success('Contrat modifié')
      } else {
        await create.mutateAsync({
          siteId,
          prestataireId,
          values: parsed.data,
        })
        toast.success('Contrat créé')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le contrat' : 'Nouveau contrat'}
      description="Renseigne les informations du contrat."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Référence"
        value={values.reference}
        onChange={(v) => set('reference', v)}
        error={errors.reference}
        required
      />
      <SelectField
        label="Type de contrat"
        required
        value={values.type_contrat_id}
        onChange={(v) => set('type_contrat_id', v)}
        error={errors.type_contrat_id}
      >
        <option value="">— Sélectionner —</option>
        {types.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {t.libelle}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Date de début"
          type="date"
          value={values.date_debut}
          onChange={(v) => set('date_debut', v)}
          error={errors.date_debut}
          required
        />
        <TextField
          label="Date de fin"
          type="date"
          value={values.date_fin}
          onChange={(v) => set('date_fin', v)}
          error={errors.date_fin}
        />
      </div>
      <TextField
        label="Date de signature"
        type="date"
        value={values.date_signature}
        onChange={(v) => set('date_signature', v)}
        error={errors.date_signature}
      />

      {/* ── Reconduction (tacite uniquement) ─────────────────────────────── */}
      {estTacite && (
        <>
          <p className="text-muted-foreground pt-2 text-sm font-medium">
            Reconduction
          </p>
          <NumberField
            label="Durée d'un cycle"
            unite="mois"
            min={1}
            step={1}
            value={values.duree_cycle_mois}
            onChange={(v) => set('duree_cycle_mois', v)}
            error={errors.duree_cycle_mois}
            required
          />
        </>
      )}

      {/* ── Résiliation / préavis ────────────────────────────────────────── */}
      <p className="text-muted-foreground pt-2 text-sm font-medium">
        Résiliation
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Délai de préavis"
          unite="jours"
          min={0}
          step={1}
          value={values.delai_preavis_jours}
          onChange={(v) => set('delai_preavis_jours', v)}
          error={errors.delai_preavis_jours}
          required
        />
        {!estIndetermine && (
          <NumberField
            label="Fenêtre de résiliation"
            unite="jours"
            min={1}
            step={1}
            value={values.fenetre_resiliation_jours}
            onChange={(v) => set('fenetre_resiliation_jours', v)}
            error={errors.fenetre_resiliation_jours}
          />
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Date de résiliation"
          type="date"
          value={values.date_resiliation}
          onChange={(v) => set('date_resiliation', v)}
          error={errors.date_resiliation}
        />
        <TextField
          label="Date de notification"
          type="date"
          value={values.date_notification}
          onChange={(v) => set('date_notification', v)}
          error={errors.date_notification}
        />
      </div>

      <TextField
        label="Objet de l'avenant"
        value={values.objet_avenant}
        onChange={(v) => set('objet_avenant', v)}
        error={errors.objet_avenant}
      />
      <TextField
        label="Commentaires"
        value={values.commentaires}
        onChange={(v) => set('commentaires', v)}
        error={errors.commentaires}
      />
    </FormDialog>
  )
}
