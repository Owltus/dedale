import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { diSchema, emptyDi } from '../schemas'
import type { DiFormValues } from '../schemas'
import { useCreateDemande } from '../mutations'
import { modelesDiQueries } from '../queries'
import { equipementsQueries } from '@/features/equipements/queries'
import { useAuth } from '@/auth'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { SelectField } from '@/components/common/select-field'
import { TextareaField } from '@/components/common/textarea-field'

interface DiFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
}

export function DiFormDialog({
  open,
  onOpenChange,
  siteId,
}: DiFormDialogProps) {
  const { session } = useAuth()
  const create = useCreateDemande()
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))
  const { data: modeles = [] } = useQuery(modelesDiQueries.list(siteId))

  const [values, setValues] = useState<DiFormValues>(() => emptyDi())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [modeleId, setModeleId] = useState('')

  function set(key: keyof DiFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  // Suggestion rapide : pré-remplit le constat depuis un modèle de DI (commun
  // ou du site).
  function applyModele(id: string) {
    setModeleId(id)
    const modele = modeles.find((m) => m.id === id)
    if (modele) set('constat', modele.constat_modele)
  }

  async function handleSubmit() {
    const parsed = diSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    if (!session) {
      toast.error('Session expirée, reconnecte-toi.')
      return
    }
    try {
      await create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: parsed.data,
      })
      toast.success("Demande d'intervention créée")
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle demande d'intervention"
      description="Décris le constat. Le lieu et l'équipement sont optionnels."
      onSubmit={() => void handleSubmit()}
      submitLabel="Créer"
      pendingLabel="Création…"
      pending={create.isPending}
    >
      {modeles.length > 0 && (
        <SelectField
          id="di-modele"
          label="Suggestion rapide"
          value={modeleId}
          onChange={applyModele}
        >
          <option value="">Aucun modèle</option>
          {modeles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.libelle}
            </option>
          ))}
        </SelectField>
      )}

      <TextareaField
        id="di-constat"
        label="Constat"
        required
        rows={4}
        value={values.constat}
        onChange={(v) => set('constat', v)}
        error={errors.constat}
      />

      <SelectField
        id="di-local"
        label="Localisation"
        value={values.local_id}
        onChange={(v) => set('local_id', v)}
      >
        <option value="">Aucune</option>
        {locaux.map((l) => (
          <option key={l.local_id} value={l.local_id ?? ''}>
            {l.chemin_court ?? l.local_nom}
          </option>
        ))}
      </SelectField>

      <SelectField
        id="di-equipement"
        label="Équipement"
        value={values.equipement_id}
        onChange={(v) => set('equipement_id', v)}
      >
        <option value="">Aucun</option>
        {equipements.map((eq) => (
          <option key={eq.id} value={eq.id ?? ''}>
            {eq.nom}
          </option>
        ))}
      </SelectField>
    </FormDialog>
  )
}
