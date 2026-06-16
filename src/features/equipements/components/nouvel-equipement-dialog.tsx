import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCreateEquipementParc } from '../mutations'
import { equipementsQueries } from '../queries'
import { errorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { ChampValeurInput } from '@/components/common/champ-valeur-input'
import type { Champ, ChampValeur } from '@/lib/champs'

interface NouvelEquipementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Sous-catégorie de parc où ranger l'équipement. */
  categorieId: string
  /** Gabarit hérité de la sous-catégorie. */
  template: {
    /** Nom proposé par défaut (nom du modèle, sinon vide). */
    nomDefaut: string
    /** Caractéristiques (champs) à remplir. */
    champs: Champ[]
    /** Image héritée (modèle ou sous-catégorie), posée automatiquement. */
    miniatureId: string | null
    /** Modèle source (lien `copie_depuis`), ou null si gabarit spécifique. */
    modeleId: string | null
  }
}

/**
 * Création ÉPURÉE d'un équipement dans une sous-catégorie : Nom + Emplacement +
 * caractéristiques héritées (à renseigner). PAS d'image (héritée), PAS de code
 * inventaire, PAS de catégorie (on est déjà dans la sous-catégorie).
 */
export function NouvelEquipementDialog({
  open,
  onOpenChange,
  siteId,
  categorieId,
  template,
}: NouvelEquipementDialogProps) {
  const create = useCreateEquipementParc()
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  const [nom, setNom] = useState(template.nomDefaut)
  const [localId, setLocalId] = useState('')
  // Données « de base » standard de l'équipement.
  const [dateMiseEnService, setDateMiseEnService] = useState('')
  const [dateFinGarantie, setDateFinGarantie] = useState('')
  // Caractéristiques héritées : valeur initialisée sur le défaut du gabarit.
  const [champs, setChamps] = useState<Champ[]>(() =>
    template.champs.map((c) => ({ ...c, valeur: c.valeur ?? c.defaut ?? null })),
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
        (c.valeur === null || c.valeur === undefined || c.valeur === ''),
    )
    if (manquant) next.champs = `Le champ « ${manquant.cle} » est obligatoire.`
    if (next.nom || next.local || next.champs) {
      setErrors(next)
      return
    }
    setErrors({})
    try {
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
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvel équipement"
      onSubmit={() => void handleSubmit()}
      submitLabel="Créer"
      pendingLabel="Création…"
      pending={create.isPending}
    >
      <TextField
        label="Nom"
        value={nom}
        onChange={setNom}
        error={errors.nom}
        required
      />
      <SelectField
        label="Emplacement"
        required
        id="nouvel_equipement_local"
        value={localId}
        onChange={setLocalId}
        error={errors.local}
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
          value={dateMiseEnService}
          onChange={setDateMiseEnService}
        />
        <TextField
          label="Fin de garantie"
          type="date"
          value={dateFinGarantie}
          onChange={setDateFinGarantie}
        />
      </div>
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
