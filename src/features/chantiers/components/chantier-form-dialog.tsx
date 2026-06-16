import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { chantierSchema, emptyChantier } from '../schemas'
import type { ChantierFormValues } from '../schemas'
import { useCreateChantier, useUpdateChantier } from '../mutations'
import { chantiersQueries } from '../queries'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { equipementsQueries } from '@/features/equipements/queries'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { DescriptionField } from '@/components/common/description-field'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/database.types'

type Chantier = Database['public']['Tables']['interventions_chantier']['Row']

interface ChantierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  chantier?: Chantier | null
}

export function ChantierFormDialog({
  open,
  onOpenChange,
  siteId,
  chantier,
}: ChantierFormDialogProps) {
  const isEdit = Boolean(chantier)
  const { session } = useAuth()
  const create = useCreateChantier()
  const update = useUpdateChantier()
  const { data: prestataires = [] } = useQuery(prestatairesQueries.list())
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))

  // Liaisons existantes (en édition) pour pré-cocher les multi-sélections.
  const { data: chantierLocaux = [] } = useQuery({
    ...chantiersQueries.locaux(chantier?.id ?? ''),
    enabled: isEdit && open,
  })
  const { data: chantierEquipements = [] } = useQuery({
    ...chantiersQueries.equipements(chantier?.id ?? ''),
    enabled: isEdit && open,
  })

  const [values, setValues] = useState<ChantierFormValues>(() =>
    chantier
      ? {
          titre: chantier.titre,
          description: chantier.description ?? '',
          prestataire_id: chantier.prestataire_id ?? '',
          date_demande: chantier.date_demande,
          date_prevue: chantier.date_prevue ?? '',
          date_fin: chantier.date_fin ?? '',
          local_ids: [],
          equipement_ids: [],
        }
      : emptyChantier(),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Les liaisons arrivent en asynchrone : on les fusionne tant que l'utilisateur
  // n'a pas touché à la sélection (touched).
  const [touchedLiens, setTouchedLiens] = useState(false)
  const pending = create.isPending || update.isPending

  const localIds = touchedLiens
    ? values.local_ids
    : chantierLocaux.map((l) => l.local_id)
  const equipementIds = touchedLiens
    ? values.equipement_ids
    : chantierEquipements.map((e) => e.equipement_id)

  function set(key: keyof ChantierFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function toggleLocal(id: string) {
    const base = localIds
    const next = base.includes(id)
      ? base.filter((x) => x !== id)
      : [...base, id]
    setTouchedLiens(true)
    setValues((v) => ({ ...v, local_ids: next, equipement_ids: equipementIds }))
  }

  function toggleEquipement(id: string) {
    const base = equipementIds
    const next = base.includes(id)
      ? base.filter((x) => x !== id)
      : [...base, id]
    setTouchedLiens(true)
    setValues((v) => ({ ...v, equipement_ids: next, local_ids: localIds }))
  }

  async function handleSubmit() {
    const candidate: ChantierFormValues = {
      ...values,
      local_ids: localIds,
      equipement_ids: equipementIds,
    }
    const parsed = chantierSchema.safeParse(candidate)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (chantier) {
        await update.mutateAsync({ id: chantier.id, values: parsed.data })
        toast.success('Chantier modifié')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          siteId,
          createdBy: session.user.id,
          values: parsed.data,
        })
        toast.success('Chantier créé')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le chantier' : 'Nouveau chantier'}
      description="Travaux ponctuels (souvent confiés à un prestataire)."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Titre"
        value={values.titre}
        onChange={(v) => set('titre', v)}
        error={errors.titre}
        required
      />
      <DescriptionField
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
      <SelectField
        label="Prestataire"
        value={values.prestataire_id}
        onChange={(v) => set('prestataire_id', v)}
      >
        <option value="">Aucun</option>
        {prestataires.map((p) => (
          <option key={p.id} value={p.id}>
            {p.libelle}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-3 gap-4">
        <TextField
          label="Date de demande"
          type="date"
          value={values.date_demande}
          onChange={(v) => set('date_demande', v)}
          error={errors.date_demande}
          required
        />
        <TextField
          label="Date prévue"
          type="date"
          value={values.date_prevue}
          onChange={(v) => set('date_prevue', v)}
          error={errors.date_prevue}
        />
        <TextField
          label="Date de fin"
          type="date"
          value={values.date_fin}
          onChange={(v) => set('date_fin', v)}
          error={errors.date_fin}
        />
      </div>

      <div className="grid gap-2">
        <Label>Locaux concernés</Label>
        <div className="border-input max-h-40 overflow-y-auto rounded-md border p-2">
          {locaux.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun local sur ce site.
            </p>
          ) : (
            locaux.map((l) => (
              <label
                key={l.local_id}
                className="flex items-center gap-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={l.local_id !== null && localIds.includes(l.local_id)}
                  onChange={() =>
                    l.local_id !== null && toggleLocal(l.local_id)
                  }
                />
                <span className="truncate">
                  {l.chemin_court ?? l.local_nom}
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Équipements concernés</Label>
        <div className="border-input max-h-40 overflow-y-auto rounded-md border p-2">
          {equipements.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun équipement sur ce site.
            </p>
          ) : (
            equipements.map((eq) => (
              <label
                key={eq.id ?? ''}
                className="flex items-center gap-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={eq.id !== null && equipementIds.includes(eq.id)}
                  onChange={() => eq.id !== null && toggleEquipement(eq.id)}
                />
                <span className="truncate">{eq.nom}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </FormDialog>
  )
}
