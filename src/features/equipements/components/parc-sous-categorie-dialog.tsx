import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import { SelectField } from '@/components/common/fields/select-field'
import { ChampsListEditor } from '@/components/common/champs-list-editor'
import type { Categorie } from '@/features/categories/queries'

const parcSousCategorieSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire'),
  description: z.string(),
  miniatureId: z.string().nullable(),
  // '' = gabarit spécifique (défini ici) ; sinon id d'un modèle de site.
  modeleId: z.string(),
})

type ParcSousCategorieValues = z.input<typeof parcSousCategorieSchema>

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

function initialValues(
  categorie: Categorie | null | undefined,
): ParcSousCategorieValues {
  return {
    nom: categorie?.nom ?? '',
    description: categorie?.description ?? '',
    miniatureId: categorie?.miniature_id ?? null,
    modeleId: categorie?.modele_equipement_id ?? '',
  }
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

  const form = useForm<ParcSousCategorieValues>({
    resolver: zodResolver(parcSousCategorieSchema),
    defaultValues: initialValues(categorie),
  })

  // Caractéristiques d'un gabarit spécifique : liste DYNAMIQUE éditée hors
  // react-hook-form (persistée au fil de l'eau en édition, accumulée en création).
  const [champs, setChamps] = useState<Champ[]>(() =>
    categorie ? parseChamps(categorie.specifications) : [],
  )

  // « Occupé » inclut la persistance des caractéristiques : footer (Annuler/
  // Enregistrer) et éditeur de champs désactivés tant qu'une écriture est en vol
  // → pas de fermeture mid-propagation ni d'écritures concurrentes non sérialisées.
  const pending = form.formState.isSubmitting || persistChamps.isPending

  // '' = gabarit spécifique (défini ici) ; sinon id d'un modèle de site. Verrouillé
  // en édition : la valeur initiale est celle de la sous-catégorie existante.
  const modeleId = useWatch({ control: form.control, name: 'modeleId' })
  const specifique = modeleId === ''
  // Libellé du modèle fixé (édition liée à un modèle), pour l'afficher en lecture.
  const modeleNom = modeles.find((m) => m.id === modeleId)?.nom

  const submit = useSubmitDialog<ParcSousCategorieValues>({
    onSubmit: (data) => {
      if (categorie) {
        // Édition : nom / description / image. Les caractéristiques d'un gabarit
        // spécifique sont déjà enregistrées au fil de l'eau (handleChampsChange).
        return update.mutateAsync({
          id: categorie.id,
          nom: data.nom,
          description: data.description,
          miniatureId: data.miniatureId,
        })
      }
      // Création : la sous-catégorie n'existe pas encore → on valide et sérialise
      // les caractéristiques (gabarit spécifique) pour les écrire d'un bloc.
      const estSpecifique = data.modeleId === ''
      let preparedChamps: Champ[] = []
      if (estSpecifique) {
        const prepared = prepareChamps(champs)
        // Erreur de préparation → toast (via useSubmitDialog), modal laissé ouvert.
        if (!prepared.ok) throw new Error(prepared.error)
        preparedChamps = prepared.champs
      }
      return create.mutateAsync({
        nom: data.nom,
        parentId,
        siteId,
        description: data.description,
        miniatureId: data.miniatureId,
        modeleId: estSpecifique ? null : data.modeleId,
        specifications: estSpecifique ? serializeChamps(preparedChamps) : null,
      })
    },
    successMessage: isEdit ? 'Sous-catégorie modifiée' : 'Sous-catégorie créée',
    close: () => onOpenChange(false),
  })

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
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          isEdit
            ? 'Modifier la sous-catégorie d’équipements'
            : 'Nouvelle sous-catégorie d’équipements'
        }
        description="Les équipements de cette sous-catégorie partageront les mêmes caractéristiques et la même image."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={pending}
        size="lg"
      >
        <IdentiteFields
          control={form.control}
          nomName="nom"
          descriptionName="description"
          image={{ name: 'miniatureId', targetSiteId: siteId, canUpload: true }}
        />

        <SelectField
          control={form.control}
          name="modeleId"
          label="Gabarit des équipements"
          // Décision structurelle prise à la création : non modifiable ensuite.
          disabled={isEdit}
          options={modeles.map((m) => ({
            value: m.id,
            label: `Modèle : ${m.nom}`,
          }))}
          // « Spécifique » est la valeur PAR DÉFAUT et un choix porteur de sens :
          // en item à `value: ''` elle ne s'affichait jamais dans le déclencheur
          // (Radix y voit « pas de valeur »), le champ semblait donc vide alors
          // qu'il portait le choix le plus courant.
          optionAucune="Spécifique (définir les caractéristiques ici)"
        />

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
          <p className="text-sm text-muted-foreground">
            Les caractéristiques sont héritées du modèle
            {modeleNom ? ` « ${modeleNom} »` : ''} et se modifient dans la
            Bibliothèque.
          </p>
        )}
      </FormDialog>
    </Form>
  )
}
