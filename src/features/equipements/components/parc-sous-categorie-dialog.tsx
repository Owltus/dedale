import { useState } from 'react'
import { toast } from 'sonner'
import {
  useCreateParcSousCategorie,
  useUpdateParcSousCategorie,
  useUpdateParcSousCategorieChamps,
} from '../mutations'
import {
  parseChamps,
  prepareChamps,
  serializeChamps,
  type Champ,
} from '@/lib/champs'
import { writeErrorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { SelectField } from '@/components/common/select-field'
import { ChampsListEditor } from '@/components/common/champs-list-editor'
import type { Categorie } from '@/features/categories/queries'

interface ParcSousCategorieDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Catégorie parente (niveau 1) sous laquelle créer la sous-catégorie. */
  parentId: string
  /** Modèles DU SITE proposés (un modèle commun doit d'abord être exporté). */
  modeles: { id: string; nom: string }[]
  /** Sous-catégorie à MODIFIER. Absent = création. */
  categorie?: Categorie | null
  /**
   * Équipements de la sous-catégorie (édition d'un gabarit spécifique) : mis à jour
   * par propagation à l'enregistrement. Ignoré en création.
   */
  equipements?: { id: string; specifications: unknown }[]
}

/**
 * Formulaire UNIQUE création + édition d'une SOUS-catégorie de parc, identique dans
 * les deux cas : Nom + Description + Image + GABARIT dont héritent ses équipements :
 * - « Spécifique » → caractéristiques définies ICI (comme un modèle, mais local :
 *   rien ne va dans la Bibliothèque ; en édition elles se propagent aux équipements) ;
 * - un MODÈLE du site → les équipements en sont des copies (gabarit géré en Biblio).
 *
 * Le TYPE de gabarit (modèle ↔ spécifique) est une décision STRUCTURELLE prise à la
 * création : en édition il est verrouillé (affiché, non modifiable).
 */
export function ParcSousCategorieDialog({
  open,
  onOpenChange,
  siteId,
  parentId,
  modeles,
  categorie,
  equipements = [],
}: ParcSousCategorieDialogProps) {
  const isEdit = Boolean(categorie)
  const create = useCreateParcSousCategorie()
  const update = useUpdateParcSousCategorie()
  // Caractéristiques d'un gabarit spécifique EXISTANT : enregistrées au fil de l'eau.
  const persistChamps = useUpdateParcSousCategorieChamps()
  // « Occupé » inclut la persistance des caractéristiques : footer (Annuler/
  // Enregistrer) et éditeur de champs désactivés tant qu'une écriture est en vol
  // → pas de fermeture mid-propagation ni d'écritures concurrentes non sérialisées.
  const pending =
    create.isPending || update.isPending || persistChamps.isPending

  const [nom, setNom] = useState(categorie?.nom ?? '')
  const [description, setDescription] = useState(categorie?.description ?? '')
  const [miniatureId, setMiniatureId] = useState<string | null>(
    categorie?.miniature_id ?? null,
  )
  // '' = gabarit spécifique (défini ici) ; sinon id d'un modèle de site. Verrouillé
  // en édition : la valeur initiale est celle de la sous-catégorie existante.
  const [modeleId, setModeleId] = useState(
    categorie?.modele_equipement_id ?? '',
  )
  const [champs, setChamps] = useState<Champ[]>(() =>
    categorie ? parseChamps(categorie.specifications) : [],
  )
  const [errors, setErrors] = useState<{ nom?: string }>({})

  const specifique = modeleId === ''
  // Libellé du modèle fixé (édition liée à un modèle), pour l'afficher en lecture.
  const modeleNom = modeles.find((m) => m.id === modeleId)?.nom

  async function handleSubmit() {
    if (!nom.trim()) {
      setErrors({ nom: 'Le nom est obligatoire' })
      return
    }
    setErrors({})

    try {
      if (categorie) {
        // Édition : nom / description / image. Les caractéristiques d'un gabarit
        // spécifique sont déjà enregistrées au fil de l'eau (handleChampsChange).
        await update.mutateAsync({
          id: categorie.id,
          nom,
          description,
          miniatureId,
        })
        toast.success('Sous-catégorie modifiée')
      } else {
        // Création : la sous-catégorie n'existe pas encore → on valide et sérialise
        // les caractéristiques (gabarit spécifique) pour les écrire d'un bloc.
        let preparedChamps: Champ[] = []
        if (specifique) {
          const prepared = prepareChamps(champs)
          if (!prepared.ok) {
            toast.error(prepared.error)
            return
          }
          preparedChamps = prepared.champs
        }
        await create.mutateAsync({
          nom,
          parentId,
          siteId,
          description,
          miniatureId,
          modeleId: specifique ? null : modeleId,
          specifications: specifique ? serializeChamps(preparedChamps) : null,
        })
        toast.success('Sous-catégorie créée')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  /**
   * Changement de la liste des caractéristiques. Sous-catégorie EXISTANTE (édition)
   * → enregistrement IMMÉDIAT (+ propagation aux équipements), le modal reste ouvert
   * pour en ajouter d'autres. CRÉATION (pas encore d'id) → on accumule en mémoire,
   * écrit au clic sur « Créer ». Mise à jour optimiste, revert si l'écriture échoue.
   */
  function handleChampsChange(next: Champ[]) {
    const previous = champs
    setChamps(next)
    if (!categorie) return
    const prepared = prepareChamps(next)
    if (!prepared.ok) {
      toast.error(prepared.error)
      setChamps(previous)
      return
    }
    persistChamps.mutate(
      { id: categorie.id, champs: prepared.champs, equipements },
      {
        onSuccess: () => toast.success('Caractéristiques enregistrées'),
        onError: (e) => {
          toast.error(writeErrorMessage(e))
          setChamps(previous)
        },
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEdit
          ? 'Modifier la sous-catégorie d’équipements'
          : 'Nouvelle sous-catégorie d’équipements'
      }
      description="Les équipements de cette sous-catégorie partageront les mêmes caractéristiques et la même image."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
      contentClassName="sm:max-w-2xl"
    >
      <IdentiteFields
        nom={{ value: nom, onChange: setNom, error: errors.nom }}
        description={{ value: description, onChange: setDescription }}
        image={{
          value: miniatureId,
          onChange: setMiniatureId,
          targetSiteId: siteId,
          canUpload: true,
        }}
      />

      <SelectField
        label="Gabarit des équipements"
        id="parc_subcat_source"
        value={modeleId}
        onChange={setModeleId}
        // Décision structurelle prise à la création : non modifiable ensuite.
        disabled={isEdit}
      >
        <option value="">Spécifique (définir les caractéristiques ici)</option>
        {modeles.map((m) => (
          <option key={m.id} value={m.id}>
            Modèle : {m.nom}
          </option>
        ))}
      </SelectField>

      {specifique ? (
        <ChampsListEditor
          champs={champs}
          onChange={handleChampsChange}
          pending={pending}
          deleteImpactHint={
            categorie && equipements.length > 0
              ? `Sa valeur sera aussi retirée de ${String(equipements.length)} équipement${
                  equipements.length > 1 ? 's' : ''
                } de cette sous-catégorie.`
              : undefined
          }
          emptyHint={
            categorie
              ? 'Aucune caractéristique. Ajoute des champs (ex. Puissance, Marque…) ; ils s’enregistrent aussitôt et les équipements de cette sous-catégorie en héritent.'
              : 'Aucune caractéristique. Ajoute des champs (ex. Puissance, Marque…) ; les équipements de cette sous-catégorie en hériteront.'
          }
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          Les caractéristiques sont héritées du modèle
          {modeleNom ? ` « ${modeleNom} »` : ''} et se modifient dans la
          Bibliothèque.
        </p>
      )}
    </FormDialog>
  )
}
