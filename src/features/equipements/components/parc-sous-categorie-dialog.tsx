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
  // '' = aucun modèle de départ ; sinon l'id du modèle dont les caractéristiques
  // viennent d'être RECOPIÉES ci-dessous. Rien de tout cela n'est enregistré en
  // base : la copie est un point de départ, jamais un lien.
  sourceModeleId: z.string(),
  // '' = aucune (le type seul) ; sinon la clé (Champ.cle) de la caractéristique
  // collée au type dans les listes (ex. « Extincteur N°1 »).
  valeurPrincipale: z.string(),
  // '' = aucun badge ; sinon la clé (Champ.cle) d'une seconde caractéristique
  // affichée en badge à côté du nom (ex. « CO2 »).
  valeurSecondaire: z.string(),
  // '' = aucun second badge ; sinon la clé (Champ.cle) d'une troisième
  // caractéristique affichée en badge sous celui de valeurSecondaire.
  valeurTertiaire: z.string(),
})

type ParcSousCategorieValues = z.input<typeof parcSousCategorieSchema>

interface ParcSousCategorieDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Catégorie parente (niveau 1) sous laquelle créer la sous-catégorie. */
  parentId: string
  /**
   * Modèles proposés comme point de départ : ceux DU SITE uniquement (le
   * catalogue commun se pioche depuis la Bibliothèque, qui en dépose une copie
   * sur le site). Leur gabarit est COPIÉ ici, jamais lié.
   */
  modeles: {
    id: string
    nom: string
    description: string | null
    champs: Champ[]
    miniatureId: string | null
  }[]
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
    // Toujours vide : le modèle n'est qu'une source de copie, pas un état de la
    // sous-catégorie — rien à réafficher en édition.
    sourceModeleId: '',
    valeurPrincipale: categorie?.valeur_principale ?? '',
    valeurSecondaire: categorie?.valeur_secondaire ?? '',
    valeurTertiaire: categorie?.valeur_tertiaire ?? '',
  }
}

/**
 * Formulaire UNIQUE création + édition d'une SOUS-catégorie de parc, identique dans
 * les deux cas : Nom + Description + Image + GABARIT dont héritent ses équipements.
 *
 * Le gabarit vit TOUJOURS sur la sous-catégorie (`specifications`) : on peut le
 * saisir de zéro, ou partir d'un modèle de la Bibliothèque (commun OU du site),
 * dont les caractéristiques sont alors RECOPIÉES dans l'éditeur ci-dessous. La
 * copie est un point de départ modifiable : la sous-catégorie ne garde aucun lien
 * vers le modèle, et modifier ce dernier plus tard ne la touche pas. C'est ce qui
 * permet de piocher directement un modèle commun (« BAES ») sans devoir d'abord
 * l'exporter vers le site — la base refuse en effet qu'une sous-catégorie de site
 * POINTE vers un modèle commun (`check_categorie_modele`).
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

  // Sous-catégorie HÉRITÉE d'un ancien gabarit lié à un modèle (avant la bascule
  // en copie) : son gabarit se gère en Bibliothèque, on ne l'édite pas ici.
  const lieAUnModele = Boolean(categorie?.modele_equipement_id)
  // Caractéristiques éligibles comme valeur principale/secondaire/tertiaire :
  // celles du gabarit de la sous-catégorie (liste DYNAMIQUE `champs`).
  const champsCandidats = champs
  // Chaque niveau exclut les caractéristiques déjà choisies aux niveaux
  // précédents (les badges afficheraient sinon deux fois la même valeur).
  const valeurPrincipale = useWatch({
    control: form.control,
    name: 'valeurPrincipale',
  })
  const valeurSecondaire = useWatch({
    control: form.control,
    name: 'valeurSecondaire',
  })
  const champsSecondaireCandidats = champsCandidats.filter(
    (c) => c.cle !== valeurPrincipale,
  )
  const champsTertiaireCandidats = champsCandidats.filter(
    (c) => c.cle !== valeurPrincipale && c.cle !== valeurSecondaire,
  )

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
          valeurPrincipale: data.valeurPrincipale || null,
          valeurSecondaire: data.valeurSecondaire || null,
          valeurTertiaire: data.valeurTertiaire || null,
        })
      }
      // Création : la sous-catégorie n'existe pas encore → on valide et sérialise
      // les caractéristiques pour les écrire d'un bloc. Le gabarit est TOUJOURS
      // porté par la sous-catégorie, qu'il ait été saisi ici ou recopié d'un
      // modèle (`modeleId` reste donc null : aucun lien).
      const prepared = prepareChamps(champs)
      // Erreur de préparation → toast (via useSubmitDialog), modal laissé ouvert.
      if (!prepared.ok) throw new Error(prepared.error)
      return create.mutateAsync({
        nom: data.nom,
        parentId,
        siteId,
        description: data.description,
        miniatureId: data.miniatureId,
        modeleId: null,
        specifications: serializeChamps(prepared.champs),
        valeurPrincipale: data.valeurPrincipale || null,
        valeurSecondaire: data.valeurSecondaire || null,
        valeurTertiaire: data.valeurTertiaire || null,
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

  /**
   * Choix d'un modèle de départ : ses caractéristiques sont RECOPIÉES dans
   * l'éditeur (elles remplacent celles en cours) ; son nom, sa description et son
   * image servent de défaut tant que la sous-catégorie n'a rien saisi — une
   * valeur déjà écrite n'est JAMAIS écrasée. Rien n'est lié : le modèle peut
   * ensuite changer ou disparaître sans effet ici. « Aucun » ne fait rien —
   * effacer un gabarit déjà saisi serait une perte silencieuse.
   */
  function appliquerModele(id: string) {
    const modele = modeles.find((m) => m.id === id)
    if (!modele) return
    handleChampsChange(modele.champs.map((c) => ({ ...c })))
    // `shouldValidate` : le nom repris efface l'erreur « Le nom est obligatoire »
    // si elle était déjà affichée.
    if (!form.getValues('nom').trim())
      form.setValue('nom', modele.nom, { shouldValidate: true })
    if (!form.getValues('description').trim() && modele.description)
      form.setValue('description', modele.description)
    if (!form.getValues('miniatureId') && modele.miniatureId) {
      form.setValue('miniatureId', modele.miniatureId)
    }
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

        {!lieAUnModele && modeles.length > 0 && (
          <SelectField
            control={form.control}
            name="sourceModeleId"
            label="Partir d’un modèle"
            options={modeles.map((m) => ({ value: m.id, label: m.nom }))}
            // Valeur PAR DÉFAUT et choix porteur de sens : en item à `value: ''`
            // elle ne s'afficherait jamais dans le déclencheur (Radix y voit
            // « pas de valeur »), le champ semblerait vide alors qu'il porte le
            // cas courant.
            optionAucune="Aucun (caractéristiques définies ici)"
            onValueChange={appliquerModele}
            hint="Reprend le nom, la description, l’image et les caractéristiques du modèle (sans écraser ce que tu as déjà saisi) ; tu peux tout ajuster ensuite. La sous-catégorie reste indépendante du modèle."
          />
        )}

        {!lieAUnModele && modeles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun modèle d’équipement sur ce site. Définis les caractéristiques
            ci-dessous, ou va d’abord en chercher un dans la Bibliothèque
            (onglet « Modèles d’équipements », bouton « Importer depuis le
            commun ») : la copie déposée sur le site apparaîtra alors ici.
          </p>
        )}

        <SelectField
          control={form.control}
          name="valeurPrincipale"
          label="Valeur principale"
          options={champsCandidats.map((c) => ({ value: c.cle, label: c.cle }))}
          optionAucune="Aucune (le type seul, ex. « Extincteur »)"
          hint="La caractéristique dont la valeur est collée au nom dans les listes (ex. « Extincteur N°1 »)."
        />

        <SelectField
          control={form.control}
          name="valeurSecondaire"
          label="Valeur secondaire"
          options={champsSecondaireCandidats.map((c) => ({
            value: c.cle,
            label: c.cle,
          }))}
          optionAucune="Aucune (pas de badge)"
          hint="Une seconde caractéristique affichée en badge à côté du nom (ex. « CO2 »)."
        />

        <SelectField
          control={form.control}
          name="valeurTertiaire"
          label="Valeur tertiaire"
          options={champsTertiaireCandidats.map((c) => ({
            value: c.cle,
            label: c.cle,
          }))}
          optionAucune="Aucune (pas de second badge)"
          hint="Une troisième caractéristique, affichée en second badge sous celui de la valeur secondaire."
        />

        {lieAUnModele ? (
          <p className="text-sm text-muted-foreground">
            Les caractéristiques de cette sous-catégorie sont héritées d’un
            modèle et se modifient dans la Bibliothèque.
          </p>
        ) : (
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
                : 'Aucune caractéristique. Ajoute des champs (ex. Puissance, Marque…) ou pars d’un modèle ci-dessus ; les équipements de cette sous-catégorie en hériteront.'
            }
          />
        )}
      </FormDialog>
    </Form>
  )
}
