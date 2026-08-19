import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { evenementSchema, emptyEvenement } from '../schemas'
import type { EvenementFormValues } from '../schemas'
import { useCreateEvenement, useUpdateEvenement } from '../mutations'
import { evenementsQueries } from '../queries'
import { useQuery } from '@tanstack/react-query'
import {
  TachesMultiplesField,
  type TacheEntree,
} from '@/features/equipements/components/taches-multiples-field'
import { useAuth } from '@/auth'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { DateField } from '@/components/common/fields/date-field'
import { DescriptionField } from '@/components/common/fields/description-field'
import type { Database } from '@/lib/database.types'

type Evenement = Database['public']['Tables']['evenements']['Row']

interface EvenementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  evenement?: Evenement | null
  /** Appelé après une CRÉATION réussie (l'hôte redirige vers la fiche). */
  onCreated?: (evenement: Evenement) => void
}

export function EvenementFormDialog({
  open,
  onOpenChange,
  siteId,
  evenement,
  onCreated,
}: EvenementFormDialogProps) {
  const isEdit = Boolean(evenement)
  const { session } = useAuth()
  const create = useCreateEvenement()
  const update = useUpdateEvenement()
  // En édition, les lieux DÉJÀ enregistrés préremplissent le tableau — pas de
  // requête en création (rien à charger, le tableau démarre vide).
  const { data: lieuxExistants } = useQuery({
    ...evenementsQueries.lieux(evenement?.id ?? ''),
    enabled: isEdit,
  })

  // `taches` est un état REACT LOCAL, hors react-hook-form : le pont habituel
  // `useWatch`/`setValue` (cf. `TachesMultiplesField`, utilisé tel quel côté
  // Travaux) s'est révélé instable ici pour un CHARGEMENT EN MASSE —
  // plusieurs lignes peuplées d'un coup par un effet, comme en édition. Le
  // rendu final gardait par intermittence une entrée à moitié vide alors que
  // la donnée chargée était complète (course interne à react-hook-form sur un
  // champ tableau hors `useFieldArray`). `TachesMultiplesField` restant un
  // composant contrôlé `value`/`onChange` ordinaire, un état React classique
  // n'a pas ce problème.
  //
  // Peuplé PENDANT le rendu (patron « ajuster l'état pendant le rendu » de
  // React, pas un `useEffect`) : dès que `lieuxExistants` change de référence
  // — la requête vient de résoudre — on resynchronise `taches` avant que ce
  // rendu ne s'affiche, sans rendu intermédiaire visible ni course d'effets.
  // Initialiseur PARESSEUX indispensable : le dialogue remonte à neuf à
  // chaque ouverture (`key={dlg.dialogKey}`), et la requête est alors souvent
  // déjà résolue en cache (chargée pendant que le dialogue était fermé) — sans
  // lui, `taches` démarrait toujours vide et la transition ci-dessous ne se
  // déclenchait jamais (les deux états partaient déjà synchronisés).
  // 090 (étape « création rapide ») : toute tâche existante préremplit
  // désormais cet éditeur, AVEC ou SANS lieu — `id` inclus, indispensable au
  // DIFF par identifiant de `useUpdateEvenement` (D11).
  function depuisLieuxExistants(
    lieux: NonNullable<typeof lieuxExistants>,
  ): TacheEntree[] {
    return lieux.map((l) => ({
      id: l.id,
      libelle: l.libelle,
      local_id: l.local_id ?? '',
      equipement_id: l.equipement_id ?? '',
    }))
  }
  const [taches, setTaches] = useState<TacheEntree[]>(() =>
    depuisLieuxExistants(lieuxExistants ?? []),
  )
  const [lieuxExistantsVus, setLieuxExistantsVus] = useState(lieuxExistants)
  if (lieuxExistants !== lieuxExistantsVus) {
    setLieuxExistantsVus(lieuxExistants)
    if (lieuxExistants) {
      setTaches(depuisLieuxExistants(lieuxExistants))
    }
  }

  const form = useForm<EvenementFormValues>({
    resolver: zodResolver(evenementSchema),
    values: evenement
      ? {
          titre: evenement.titre,
          description: evenement.description ?? '',
          date_evenement: evenement.date_evenement,
          // Jamais peuplé ici — `taches` est un état à part, cf. plus haut.
          taches: [],
        }
      : undefined,
    defaultValues: emptyEvenement(isoLocale(new Date())),
  })

  const submit = useSubmitDialog<EvenementFormValues, Evenement | null>({
    onSubmit: async (data) => {
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      if (evenement) {
        await update.mutateAsync({
          id: evenement.id,
          values: data,
          taches,
          createdBy: session.user.id,
          existants: (lieuxExistants ?? []).map((l) => ({
            id: l.id,
            libelle: l.libelle,
            local_id: l.local_id ?? '',
            equipement_id: l.equipement_id ?? '',
          })),
        })
        return null
      }
      return create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: { ...data, taches },
      })
    },
    successMessage: isEdit ? 'Événement modifié' : 'Événement consigné',
    close: () => onOpenChange(false),
    onSuccess: (cree) => {
      if (cree && onCreated) onCreated(cree)
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier l’événement' : 'Consigner un événement'}
        description="Ce qui s’est passé dans l’établissement. Le lieu est facultatif — tu peux en ajouter plusieurs."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Consigner'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        size="lg"
      >
        <TextField control={form.control} name="titre" label="Titre" required />
        <DateField
          control={form.control}
          name="date_evenement"
          label="Date de l’événement"
          required
        />
        <DescriptionField control={form.control} name="description" rows={5} />

        {/* 086 : une ou plusieurs tâches (090, généralisées), ajoutées/
            retouchées directement ici — « meilleur des deux mondes »
            (décision PO) : la commodité déjà présente (choisir le lieu depuis
            ce formulaire) étendue au multi-tâches (comme Travaux). État
            local, cf. le commentaire sur `taches` plus haut — pas de pont
            react-hook-form ici. */}
        <TachesMultiplesField
          siteId={siteId}
          value={taches}
          onChange={setTaches}
        />
      </FormDialog>
    </Form>
  )
}
