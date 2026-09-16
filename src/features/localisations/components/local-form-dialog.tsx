import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { emptyLocal, localSchema } from '../schemas'
import type { LocalFormValues, LocalValues } from '../schemas'
import { useCreateLocal, useUpdateLocal } from '../mutations'
import { localisationsQueries } from '../queries'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { SelectField } from '@/components/common/fields/select-field'
import { CheckboxField } from '@/components/common/fields/checkbox-field'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import { ChampValeurInput } from '@/components/common/champ-valeur-input'
import { Separator } from '@/components/ui/separator'
import {
  parseChamps,
  serializeChamps,
  type Champ,
  type ChampValeur,
} from '@/lib/champs'
import type { Database } from '@/lib/database.types'

type Local = Database['public']['Tables']['locaux']['Row']

interface LocalFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  niveauId: string
  /** Site (pour le pool de vignettes : périmètre de la MiniatureField). */
  siteId: string
  local?: Local | null
}

function initialValues(local: Local | null | undefined): LocalFormValues {
  if (!local) return emptyLocal
  return {
    nom: local.nom,
    description: local.description ?? '',
    surface_m2: local.surface_m2 === null ? '' : String(local.surface_m2),
    type_local_id:
      local.type_local_id === null ? '' : String(local.type_local_id),
    miniature_id: local.miniature_id ?? null,
    chauffe_climatise: local.chauffe_climatise,
    hauteur_m: local.hauteur_m === null ? '' : String(local.hauteur_m),
    capacite_personnes:
      local.capacite_personnes === null ? '' : String(local.capacite_personnes),
    accessible_pmr: local.accessible_pmr,
  }
}

export function LocalFormDialog({
  open,
  onOpenChange,
  niveauId,
  siteId,
  local,
}: LocalFormDialogProps) {
  const isEdit = Boolean(local)
  const create = useCreateLocal()
  const update = useUpdateLocal()
  const { data: types = [] } = useQuery(localisationsQueries.typesLocaux())
  const form = useForm<LocalFormValues, unknown, LocalValues>({
    resolver: zodResolver(localSchema),
    defaultValues: initialValues(local),
  })

  // Caractéristiques (112) : le GABARIT vient du type choisi, les VALEURS
  // vivent sur le local. En édition on repart de son snapshot ; un changement
  // de type propose le gabarit du nouveau type en conservant les valeurs des
  // champs de même nom (l'utilisateur ne resaisit pas ce qui existait déjà).
  const typeIdChoisi = useWatch({
    control: form.control,
    name: 'type_local_id',
  })
  const [champs, setChamps] = useState<Champ[]>(() =>
    parseChamps(local?.specifications),
  )
  const [dernierType, setDernierType] = useState<string>(
    initialValues(local).type_local_id,
  )
  const gabaritDuType = useMemo(() => {
    const t = types.find((t) => String(t.id) === typeIdChoisi)
    return t ? parseChamps(t.specifications) : []
  }, [types, typeIdChoisi])
  // Ajustement PENDANT le rendu (pas d'effet) : aligne la liste sur le gabarit
  // du type dès que l'utilisateur en change.
  if (typeIdChoisi !== dernierType) {
    setDernierType(typeIdChoisi)
    setChamps(
      gabaritDuType.map((c) => ({
        ...c,
        valeur: champs.find((v) => v.cle === c.cle)?.valeur ?? c.defaut,
      })),
    )
  }
  // Création : le gabarit du type sert de liste initiale (aucun snapshot).
  const champsAffiches =
    champs.length > 0
      ? champs
      : gabaritDuType.map((c) => ({ ...c, valeur: c.defaut }))

  function setValeur(index: number, valeur: ChampValeur) {
    setChamps(
      champsAffiches.map((c, i) => (i === index ? { ...c, valeur } : c)),
    )
  }
  const submit = useSubmitDialog<LocalValues>({
    onSubmit: (data) => {
      const specifications = serializeChamps(champsAffiches)
      return local
        ? update.mutateAsync({ id: local.id, values: data, specifications })
        : create.mutateAsync({ niveauId, values: data, specifications })
    },
    successMessage: isEdit ? 'Local modifié' : 'Local créé',
    close: () => onOpenChange(false),
  })

  // Option neutre via `optionAucune` (jamais un item à `value: ''` : Radix y
  // voit « pas de valeur » et le libellé choisi ne s'afficherait jamais).
  const typeOptions = types.map((t) => ({
    value: String(t.id),
    label: t.libelle,
  }))

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le local' : 'Nouveau local'}
        description="Un local : type, dimensions, effectif et accessibilité."
        size="lg"
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <IdentiteFields
          control={form.control}
          nomName="nom"
          descriptionName="description"
          image={{
            name: 'miniature_id',
            targetSiteId: siteId,
            canUpload: true,
          }}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="type_local_id"
            label="Type de local"
            options={typeOptions}
            optionAucune="— Aucun —"
          />
          <TextField
            control={form.control}
            name="capacite_personnes"
            label="Effectif admissible"
            type="number"
            inputMode="numeric"
          />
          {/*
            La base refuse une surface ou une hauteur nulle (CHECK … > 0). Sans
            ce rappel, l'usager qui ignore la valeur tape « 0 » et se heurte au
            refus sans savoir quoi faire : le mur serait seulement déplacé.
          */}
          <TextField
            control={form.control}
            name="surface_m2"
            label="Surface (m²)"
            type="number"
            inputMode="decimal"
            hint="Laissez vide si la surface n’est pas connue."
          />
          <TextField
            control={form.control}
            name="hauteur_m"
            label="Hauteur sous plafond (m)"
            type="number"
            inputMode="decimal"
            hint="Laissez vide si la hauteur n’est pas connue."
          />
          <CheckboxField
            control={form.control}
            name="chauffe_climatise"
            label="Chauffé / climatisé"
          />
          <CheckboxField
            control={form.control}
            name="accessible_pmr"
            label="Accessible PMR"
          />
        </div>
        {champsAffiches.length > 0 && (
          <>
            <Separator />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {champsAffiches.map((c, i) => (
                <ChampValeurInput
                  key={c.cle}
                  champ={c}
                  value={c.valeur ?? null}
                  onChange={(v) => setValeur(i, v)}
                />
              ))}
            </div>
          </>
        )}
      </FormDialog>
    </Form>
  )
}
