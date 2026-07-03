import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useCreateEquipementParc,
  useUpdateEquipementParc,
} from '../mutations'
import { EmplacementSelect } from './emplacement-select'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { DateField } from '@/components/common/fields/date-field'
import { ChampValeurInput } from '@/components/common/champ-valeur-input'
import { parseChamps, type Champ, type ChampValeur } from '@/lib/champs'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

const equipementParcSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire'),
  localId: z.string().min(1, 'L’emplacement est obligatoire'),
  dateMiseEnService: z.string(),
  dateFinGarantie: z.string(),
})

type EquipementParcValues = z.input<typeof equipementParcSchema>

interface EquipementParcDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Sous-catégorie de parc où ranger l'équipement. */
  categorieId: string
  /** Gabarit hérité de la sous-catégorie (source des champs/image À LA CRÉATION). */
  template: {
    nomDefaut: string
    champs: Champ[]
    miniatureId: string | null
    modeleId: string | null
  }
  /** Équipement à MODIFIER. Absent = création. */
  equipement?: Equipement | null
}

function initialValues(
  equipement: Equipement | null | undefined,
  template: { nomDefaut: string },
): EquipementParcValues {
  return {
    nom: equipement?.nom ?? template.nomDefaut,
    localId: equipement?.local_id ?? '',
    dateMiseEnService: equipement?.date_mise_en_service ?? '',
    dateFinGarantie: equipement?.date_fin_garantie ?? '',
  }
}

/**
 * Formulaire UNIQUE création + édition d'un équipement de parc, ÉPURÉ et identique
 * dans les deux cas : Nom + Emplacement (cascade) + dates + caractéristiques. PAS
 * d'image (héritée de la sous-catégorie/modèle), PAS de code inventaire, PAS de
 * catégorie (c'est la sous-catégorie). En création, les caractéristiques viennent
 * du gabarit ; en édition, de l'équipement (valeurs déjà saisies conservées).
 */
export function EquipementParcDialog({
  open,
  onOpenChange,
  siteId,
  categorieId,
  template,
  equipement,
}: EquipementParcDialogProps) {
  const isEdit = Boolean(equipement)
  const create = useCreateEquipementParc()
  const update = useUpdateEquipementParc()

  const form = useForm<EquipementParcValues>({
    resolver: zodResolver(equipementParcSchema),
    defaultValues: initialValues(equipement, template),
  })

  // Édition : caractéristiques (avec valeurs) de l'équipement ; création :
  // caractéristiques du gabarit, valeur initialisée sur le défaut. Champs DYNAMIQUES
  // (widget par type) → état local, hors react-hook-form.
  const [champs, setChamps] = useState<Champ[]>(() =>
    equipement
      ? parseChamps(equipement.specifications)
      : template.champs.map((c) => ({
          ...c,
          valeur: c.valeur ?? c.defaut ?? null,
        })),
  )
  // Erreur des caractéristiques : validée impérativement (hors resolver Zod), affichée
  // sous la liste des champs — inchangée par rapport à l'ancienne modale.
  const [champsError, setChampsError] = useState<string | undefined>()

  function setValeur(index: number, valeur: ChampValeur) {
    setChamps((cs) => cs.map((c, i) => (i === index ? { ...c, valeur } : c)))
  }

  const submit = useSubmitDialog<EquipementParcValues>({
    onSubmit: (data) =>
      equipement?.id
        ? update.mutateAsync({
            id: equipement.id,
            nom: data.nom,
            localId: data.localId,
            champs,
            dateMiseEnService: data.dateMiseEnService,
            dateFinGarantie: data.dateFinGarantie,
          })
        : create.mutateAsync({
            nom: data.nom,
            localId: data.localId,
            categorieId,
            miniatureId: template.miniatureId,
            champs,
            modeleId: template.modeleId,
            dateMiseEnService: data.dateMiseEnService,
            dateFinGarantie: data.dateFinGarantie,
          }),
    successMessage: isEdit ? 'Équipement modifié' : 'Équipement créé',
    close: () => onOpenChange(false),
  })

  function handleSubmit() {
    // Caractéristique requise manquante : Oui/Non exclu (false est une réponse valide)
    // pour ne pas bloquer sur un champ legacy requis=true.
    const manquant = champs.find(
      (c) =>
        c.requis &&
        c.type !== 'oui-non' &&
        (c.valeur === null || c.valeur === undefined || c.valeur === ''),
    )
    setChampsError(
      manquant ? `Le champ « ${manquant.cle} » est obligatoire.` : undefined,
    )
    void form.handleSubmit(async (data) => {
      // Validation Zod passée : on soumet SAUF si une caractéristique requise manque.
      if (manquant) return
      await submit(data)
    })()
  }

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier l’équipement' : 'Nouvel équipement'}
        description={
          isEdit
            ? 'Mettez à jour son emplacement et ses caractéristiques.'
            : 'Renseignez son emplacement et ses caractéristiques.'
        }
        onSubmit={handleSubmit}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        size="lg"
      >
        <TextField control={form.control} name="nom" label="Nom" required />
        {/* Emplacement en cascade (bâtiment pleine ligne si >1) ; dates en colonne
            droite, à côté de Niveau/Local, pour compacter. */}
        <Controller
          control={form.control}
          name="localId"
          render={({ field, fieldState }) => (
            <EmplacementSelect
              siteId={siteId}
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
              aside={
                <>
                  <DateField
                    control={form.control}
                    name="dateMiseEnService"
                    label="Mise en service"
                  />
                  <DateField
                    control={form.control}
                    name="dateFinGarantie"
                    label="Fin de garantie"
                  />
                </>
              }
            />
          )}
        />
        {champs.length > 0 && (
          <div className="grid gap-3 border-t pt-4">
            {champs.map((champ, i) => (
              <ChampValeurInput
                key={champ.cle}
                champ={champ}
                value={champ.valeur ?? null}
                onChange={(valeur) => setValeur(i, valeur)}
              />
            ))}
            {champsError && (
              <p className="text-destructive text-sm">{champsError}</p>
            )}
          </div>
        )}
      </FormDialog>
    </Form>
  )
}
