import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyEquipement, equipementSchema } from '../schemas'
import type { EquipementFormValues } from '../schemas'
import { useCreateEquipement, useUpdateEquipement } from '../mutations'
import { equipementsQueries } from '../queries'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { MiniatureField } from '@/features/miniatures/components/miniature-field'
import { ChampValeurInput } from '@/components/common/champ-valeur-input'
import { Label } from '@/components/ui/label'
import { parseChamps, type ChampValeur } from '@/lib/champs'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

interface EquipementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  equipement?: Equipement | null
}

function initialValues(
  eq: Equipement | null | undefined,
): EquipementFormValues {
  if (!eq) return emptyEquipement
  return {
    nom: eq.nom ?? '',
    code_inventaire: eq.code_inventaire ?? '',
    categorie_id: eq.categorie_id ?? '',
    local_id: eq.local_id ?? '',
    date_mise_en_service: eq.date_mise_en_service ?? '',
    date_fin_garantie: eq.date_fin_garantie ?? '',
    commentaires: eq.commentaires ?? '',
    miniature_id: eq.miniature_id ?? null,
    specifications: parseChamps(eq.specifications),
  }
}

export function EquipementFormDialog({
  open,
  onOpenChange,
  siteId,
  equipement,
}: EquipementFormDialogProps) {
  const isEdit = Boolean(equipement)
  const create = useCreateEquipement()
  const update = useUpdateEquipement()
  const { data: categories = [] } = useQuery(
    equipementsQueries.categories(siteId),
  )
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  const [values, setValues] = useState<EquipementFormValues>(() =>
    initialValues(equipement),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof EquipementFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }
  function setSpecValeur(index: number, valeur: ChampValeur) {
    setValues((v) => ({
      ...v,
      specifications: v.specifications.map((c, i) =>
        i === index ? { ...c, valeur } : c,
      ),
    }))
  }

  async function handleSubmit() {
    const parsed = equipementSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    // Un champ requis vide bloque l'enregistrement.
    const manquant = parsed.data.specifications.find(
      (c) =>
        c.requis &&
        (c.valeur === null || c.valeur === undefined || c.valeur === ''),
    )
    if (manquant) {
      setErrors({
        specifications: `Le champ « ${manquant.cle} » est obligatoire.`,
      })
      return
    }
    setErrors({})
    try {
      if (equipement?.id) {
        await update.mutateAsync({ id: equipement.id, values })
        toast.success('Équipement modifié')
      } else {
        await create.mutateAsync(values)
        toast.success('Équipement créé')
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
      title={isEdit ? 'Modifier l’équipement' : 'Nouvel équipement'}
      description="Renseigne les informations de l’équipement."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Nom"
        value={values.nom}
        onChange={(v) => set('nom', v)}
        error={errors.nom}
        required
      />
      <MiniatureField
        value={values.miniature_id}
        onChange={(id) => setValues((v) => ({ ...v, miniature_id: id }))}
        targetSiteId={siteId}
        canUpload
      />
      <TextField
        label="Code inventaire"
        value={values.code_inventaire}
        onChange={(v) => set('code_inventaire', v)}
        error={errors.code_inventaire}
      />
      <SelectField
        label="Catégorie"
        id="categorie_id"
        value={values.categorie_id}
        onChange={(v) => set('categorie_id', v)}
      >
        <option value="">— Aucune —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Emplacement"
        required
        id="local_id"
        value={values.local_id}
        onChange={(v) => set('local_id', v)}
        error={errors.local_id}
      >
        <option value="">— Choisir un local —</option>
        {locaux.map((l) => (
          <option key={l.local_id ?? ''} value={l.local_id ?? ''}>
            {l.chemin_court ?? l.local_nom ?? ''}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Mise en service"
          type="date"
          value={values.date_mise_en_service}
          onChange={(v) => set('date_mise_en_service', v)}
          error={errors.date_mise_en_service}
        />
        <TextField
          label="Fin de garantie"
          type="date"
          value={values.date_fin_garantie}
          onChange={(v) => set('date_fin_garantie', v)}
          error={errors.date_fin_garantie}
        />
      </div>
      <TextField
        label="Commentaires"
        value={values.commentaires}
        onChange={(v) => set('commentaires', v)}
        error={errors.commentaires}
      />
      {values.specifications.length > 0 && (
        <div className="grid gap-3">
          <Label>Caractéristiques techniques</Label>
          {values.specifications.map((champ, i) => (
            <ChampValeurInput
              key={i}
              champ={champ}
              value={champ.valeur ?? null}
              onChange={(valeur) => setSpecValeur(i, valeur)}
            />
          ))}
          {errors.specifications && (
            <p className="text-destructive text-sm">{errors.specifications}</p>
          )}
        </div>
      )}
    </FormDialog>
  )
}
