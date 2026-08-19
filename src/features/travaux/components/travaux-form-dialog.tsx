import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { travauxSchema, emptyTravaux } from '../schemas'
import type { TravauxFormValues } from '../schemas'
import { useCreateTravaux, useUpdateTravaux } from '../mutations'
import { travauxQueries } from '../queries'
import { useAuth } from '@/auth'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import {
  TachesMultiplesField,
  type TacheEntree,
} from '@/features/equipements/components/taches-multiples-field'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { DescriptionField } from '@/components/common/fields/description-field'
import type { Database } from '@/lib/database.types'

type Travaux = Database['public']['Tables']['interventions_travaux']['Row']

interface TravauxFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  travaux?: Travaux | null
  /**
   * Appelé après une CRÉATION réussie, avec le travail créé. L'hôte (liste)
   * s'en sert pour rediriger vers la fiche où l'on ajoute les tâches.
   */
  onCreated?: (travaux: Travaux) => void
}

function initialValues(travaux: Travaux | null | undefined): TravauxFormValues {
  if (!travaux) return emptyTravaux()
  // taches : jamais peuplé ici — état à part, cf. plus bas.
  return {
    titre: travaux.titre,
    description: travaux.description ?? '',
    taches: [],
  }
}

export function TravauxFormDialog({
  open,
  onOpenChange,
  siteId,
  travaux,
  onCreated,
}: TravauxFormDialogProps) {
  const isEdit = Boolean(travaux)
  const { session } = useAuth()
  const create = useCreateTravaux()
  const update = useUpdateTravaux()
  // En édition, les zones DÉJÀ enregistrées préremplissent le tableau.
  const { data: tachesExistantes } = useQuery({
    ...travauxQueries.taches(travaux?.id ?? ''),
    enabled: isEdit,
  })

  // `taches` est un état REACT LOCAL, hors react-hook-form — même patron que
  // côté Événements (`EvenementFormDialog`) : le pont `useWatch`/`setValue`
  // sur un tableau s'est révélé instable pour un chargement en masse (rendu
  // final gardant parfois une entrée à moitié vide alors que la donnée
  // chargée était complète). Peuplé PENDANT le rendu (patron « ajuster
  // l'état pendant le rendu » de React, pas un `useEffect`) : dès que
  // `tachesExistantes` change de référence — la requête vient de résoudre —
  // on resynchronise `taches` avant que ce rendu ne s'affiche. L'initialiseur
  // paresseux est indispensable : le dialogue remonte à neuf à chaque
  // ouverture (`key={dlg.dialogKey}`), et la requête est alors souvent déjà
  // résolue en cache (chargée pendant que le dialogue était fermé).
  // 090 (étape « création rapide ») : toute tâche existante préremplit
  // désormais cet éditeur, AVEC ou SANS lieu — `id` inclus, indispensable au
  // DIFF par identifiant de `useUpdateTravaux` (D11).
  function depuisTachesExistantes(
    taches: NonNullable<typeof tachesExistantes>,
  ): TacheEntree[] {
    return taches.map((t) => ({
      id: t.id,
      libelle: t.libelle,
      local_id: t.local_id ?? '',
      equipement_id: t.equipement_id ?? '',
    }))
  }
  const [taches, setTaches] = useState<TacheEntree[]>(() =>
    depuisTachesExistantes(tachesExistantes ?? []),
  )
  const [tachesExistantesVues, setTachesExistantesVues] =
    useState(tachesExistantes)
  if (tachesExistantes !== tachesExistantesVues) {
    setTachesExistantesVues(tachesExistantes)
    if (tachesExistantes) {
      setTaches(depuisTachesExistantes(tachesExistantes))
    }
  }

  const form = useForm<TravauxFormValues>({
    resolver: zodResolver(travauxSchema),
    defaultValues: initialValues(travaux),
  })

  const submit = useSubmitDialog<TravauxFormValues, Travaux | null>({
    onSubmit: async (data) => {
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      if (travaux) {
        await update.mutateAsync({
          id: travaux.id,
          values: data,
          taches,
          createdBy: session.user.id,
          existants: (tachesExistantes ?? []).map((t) => ({
            id: t.id,
            libelle: t.libelle,
            local_id: t.local_id ?? '',
            equipement_id: t.equipement_id ?? '',
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
    successMessage: isEdit ? 'Travaux modifié' : 'Travaux créé',
    close: () => onOpenChange(false),
    // Redirection vers la fiche uniquement après une CRÉATION (édition → null).
    onSuccess: (created) => {
      if (created) onCreated?.(created)
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le travaux' : 'Nouveau travaux'}
        description="Ajoute, modifie ou retire directement une ou plusieurs tâches — ici ou depuis la fiche."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        // Pas de grille à deux colonnes ici : les deux champs sont de la saisie
        // libre, ils prennent donc toute la largeur (patron de dimensionnement).
        // C'est la LARGEUR du dialogue qui manquait.
        size="lg"
      >
        <TextField control={form.control} name="titre" label="Titre" required />
        {/* La description d'un travaux n'est pas un champ d'appoint : on y
            consigne le déroulé du chantier, souvent sur plusieurs lignes
            (livraison, mise en service, enlèvement…). Deux lignes obligeaient à
            se relire par une fente. */}
        <DescriptionField control={form.control} name="description" rows={5} />
        {/* Tâches ajoutées/retouchées directement ici, en création COMME en
            modification — « meilleur des deux mondes » (décision PO) :
            symétrique avec Événements, qui fait de même. */}
        <TachesMultiplesField
          siteId={siteId}
          value={taches}
          onChange={setTaches}
        />
      </FormDialog>
    </Form>
  )
}
