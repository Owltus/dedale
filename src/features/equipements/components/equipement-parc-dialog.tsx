import { useState } from 'react'
import { toast } from 'sonner'
import {
  useCreateEquipementParc,
  useUpdateEquipementParc,
} from '../mutations'
import { EmplacementSelect } from './emplacement-select'
import { errorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { ChampValeurInput } from '@/components/common/champ-valeur-input'
import { parseChamps, type Champ, type ChampValeur } from '@/lib/champs'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

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
  const pending = create.isPending || update.isPending

  const [nom, setNom] = useState(equipement?.nom ?? template.nomDefaut)
  const [localId, setLocalId] = useState(equipement?.local_id ?? '')
  const [dateMiseEnService, setDateMiseEnService] = useState(
    equipement?.date_mise_en_service ?? '',
  )
  const [dateFinGarantie, setDateFinGarantie] = useState(
    equipement?.date_fin_garantie ?? '',
  )
  // Édition : caractéristiques (avec valeurs) de l'équipement ; création :
  // caractéristiques du gabarit, valeur initialisée sur le défaut.
  const [champs, setChamps] = useState<Champ[]>(() =>
    equipement
      ? parseChamps(equipement.specifications)
      : template.champs.map((c) => ({
          ...c,
          valeur: c.valeur ?? c.defaut ?? null,
        })),
  )
  const [errors, setErrors] = useState<{
    nom?: string
    local?: string
    champs?: string
  }>({})

  function setValeur(index: number, valeur: ChampValeur) {
    setChamps((cs) => cs.map((c, i) => (i === index ? { ...c, valeur } : c)))
  }

  async function handleSubmit() {
    const next: typeof errors = {}
    if (!nom.trim()) next.nom = 'Le nom est obligatoire'
    if (!localId) next.local = 'L’emplacement est obligatoire'
    const manquant = champs.find(
      (c) =>
        c.requis &&
        // Oui/Non n'est jamais réellement obligatoire (false est une réponse
        // valide) : on l'exclut pour ne pas bloquer sur un champ legacy requis=true.
        c.type !== 'oui-non' &&
        (c.valeur === null || c.valeur === undefined || c.valeur === ''),
    )
    if (manquant) next.champs = `Le champ « ${manquant.cle} » est obligatoire.`
    if (next.nom || next.local || next.champs) {
      setErrors(next)
      return
    }
    setErrors({})
    try {
      if (equipement?.id) {
        await update.mutateAsync({
          id: equipement.id,
          nom,
          localId,
          champs,
          dateMiseEnService,
          dateFinGarantie,
        })
        toast.success('Équipement modifié')
      } else {
        await create.mutateAsync({
          nom,
          localId,
          categorieId,
          miniatureId: template.miniatureId,
          champs,
          modeleId: template.modeleId,
          dateMiseEnService,
          dateFinGarantie,
        })
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
      description={
        isEdit
          ? 'Mettez à jour son emplacement et ses caractéristiques.'
          : 'Renseignez son emplacement et ses caractéristiques.'
      }
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Nom"
        value={nom}
        onChange={setNom}
        error={errors.nom}
        required
      />
      {/* Emplacement en cascade (bâtiment pleine ligne si >1) ; dates en colonne
          droite, à côté de Niveau/Local, pour compacter. */}
      <EmplacementSelect
        siteId={siteId}
        value={localId}
        onChange={setLocalId}
        error={errors.local}
        aside={
          <>
            <TextField
              label="Mise en service"
              type="date"
              value={dateMiseEnService}
              onChange={setDateMiseEnService}
            />
            <TextField
              label="Fin de garantie"
              type="date"
              value={dateFinGarantie}
              onChange={setDateFinGarantie}
            />
          </>
        }
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
          {errors.champs && (
            <p className="text-destructive text-sm">{errors.champs}</p>
          )}
        </div>
      )}
    </FormDialog>
  )
}
