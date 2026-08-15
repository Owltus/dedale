import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { emptyGamme, gammeSchema } from '../schemas'
import type { GammeFormValues } from '../schemas'
import { useCreateGamme, useUpdateGamme } from '../mutations'
import { gammesQueries, referentielsQueries } from '../queries'
import type { SousCategorieGamme } from '../queries'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { categoriesQueries } from '@/features/categories/queries'
import { useAuth } from '@/auth'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import { RadioField } from '@/components/common/fields/radio-field'
import { SelectField } from '@/components/common/fields/select-field'
import { SwitchField } from '@/components/common/fields/switch-field'
import type { Database } from '@/lib/database.types'

type Gamme = Database['public']['Tables']['gammes']['Row']

interface GammeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  gamme?: Gamme | null
  /**
   * Sous-catégorie pré-sélectionnée à la CRÉATION (ex. on crée une gamme depuis la
   * sous-catégorie ouverte dans l'explorateur Plan de maintenance). Ignoré en
   * édition (la gamme porte déjà sa `categorie_id`).
   */
  presetCategorieId?: string | null
}

function initialValues(
  gamme: Gamme | null | undefined,
  presetCategorieId?: string | null,
): GammeFormValues {
  if (!gamme)
    return presetCategorieId
      ? { ...emptyGamme, categorie_id: presetCategorieId }
      : emptyGamme
  return {
    nom: gamme.nom,
    nature: gamme.nature,
    periodicite_id: String(gamme.periodicite_id),
    // Une gamme réelle de site a toujours un prestataire (obligatoire) ; garde-
    // fou de typage depuis que la colonne est nullable (templates communs).
    prestataire_id: gamme.prestataire_id ?? '',
    categorie_id: gamme.categorie_id,
    description: gamme.description ?? '',
    miniature_id: gamme.miniature_id,
    est_active: gamme.est_active,
  }
}

/** Sous-catégories regroupées par catégorie racine parente, triées par nom. */
function groupByParent(
  sousCategories: SousCategorieGamme[],
): { parentId: string; parentNom: string; subs: SousCategorieGamme[] }[] {
  const groups = new Map<
    string,
    { parentId: string; parentNom: string; subs: SousCategorieGamme[] }
  >()
  for (const sc of sousCategories) {
    const group = groups.get(sc.parentId) ?? {
      parentId: sc.parentId,
      parentNom: sc.parentNom,
      subs: [],
    }
    group.subs.push(sc)
    groups.set(sc.parentId, group)
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      subs: [...g.subs].sort((a, b) => a.nom.localeCompare(b.nom)),
    }))
    .sort((a, b) => a.parentNom.localeCompare(b.parentNom))
}

export function GammeFormDialog({
  open,
  onOpenChange,
  siteId,
  gamme,
  presetCategorieId,
}: GammeFormDialogProps) {
  const isEdit = Boolean(gamme)
  const { session } = useAuth()
  const create = useCreateGamme()
  const update = useUpdateGamme()
  const { data: periodicites = [] } = useQuery(
    referentielsQueries.periodicites(),
  )
  const { data: prestataires = [] } = useQuery(prestatairesQueries.list())
  const sousCategoriesQuery = useQuery(gammesQueries.sousCategories(siteId))
  const sousCategories = useMemo(
    () => sousCategoriesQuery.data ?? [],
    [sousCategoriesQuery.data],
  )
  const form = useForm<GammeFormValues>({
    resolver: zodResolver(gammeSchema),
    defaultValues: initialValues(gamme, presetCategorieId),
  })
  const submit = useSubmitDialog<GammeFormValues>({
    onSubmit: async (data) => {
      if (gamme) {
        await update.mutateAsync({ id: gamme.id, values: data })
        return
      }
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      await create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Gamme modifiée' : 'Gamme créée',
    close: () => onOpenChange(false),
  })

  // Sous-catégorie réellement assignée (édition) : si elle est masquée (inactive)
  // elle n'est pas dans la liste → on la lit pour la réinjecter, afin que le
  // select reflète la valeur réelle de la gamme.
  const assignedId = gamme?.categorie_id ?? null
  const assignedMissing =
    assignedId !== null && !sousCategories.some((sc) => sc.id === assignedId)
  const { data: assignedCategorie } = useQuery(
    categoriesQueries.byId(assignedMissing ? assignedId : null),
  )

  // Impasse : aucune sous-catégorie de gamme dans ce périmètre. La page Gammes
  // n'en crée pas → on guide vers la Bibliothèque et on bloque la soumission
  // quand aucune valeur n'est sélectionnable (champ requis).
  const aucuneSousCategorie =
    !sousCategoriesQuery.isPending && sousCategories.length === 0
  const aucuneOption = aucuneSousCategorie && !assignedMissing

  // Sous-catégories regroupées par catégorie racine. Le Select thémé ne gère pas
  // les `<optgroup>` → on aplatit en préfixant le libellé par le domaine parent
  // (`Domaine › Sous-catégorie`) pour conserver le regroupement et lever les
  // homonymes entre domaines.
  const groupedSousCategories = useMemo(
    () => groupByParent(sousCategories),
    [sousCategories],
  )

  const periodiciteOptions = [
    ...periodicites.map((p) => ({ value: String(p.id), label: p.libelle })),
  ]
  const prestataireOptions = [
    ...prestataires.map((p) => ({ value: p.id, label: p.libelle })),
  ]
  const categorieOptions = [
    ...(assignedMissing && assignedId
      ? [
          {
            value: assignedId,
            label: `${assignedCategorie?.nom ?? 'Sous-catégorie actuelle'} (actuelle)`,
          },
        ]
      : []),
    ...groupedSousCategories.flatMap((group) =>
      group.subs.map((sc) => ({
        value: sc.id,
        label: `${group.parentNom} › ${sc.nom}`,
      })),
    ),
  ]

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier la gamme' : 'Nouvelle gamme'}
        description="Renseigne la nature, la périodicité (semaines ISO) et le prestataire par défaut."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        submitDisabled={aucuneOption}
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

        <RadioField
          control={form.control}
          name="nature"
          label="Nature"
          required
          options={[
            {
              value: 'controle_reglementaire',
              label: 'Contrôle réglementaire',
              description: 'Attend des documents justificatifs.',
            },
            {
              value: 'maintenance_preventive',
              label: 'Maintenance préventive',
            },
          ]}
        />

        {isEdit && (
          <SwitchField
            control={form.control}
            name="est_active"
            label="Gamme active"
            description="Une gamme inactive ne génère plus d’ordres de travail."
          />
        )}

        <SelectField
          control={form.control}
          name="periodicite_id"
          label="Périodicité"
          required
          options={periodiciteOptions}
          placeholder="— Choisir une périodicité —"
        />

        <SelectField
          control={form.control}
          name="prestataire_id"
          label="Prestataire par défaut"
          required
          options={prestataireOptions}
          placeholder="— Choisir un prestataire —"
        />

        <div className="grid gap-2">
          <SelectField
            control={form.control}
            name="categorie_id"
            label="Sous-catégorie"
            required
            options={categorieOptions}
            placeholder="— Choisir une sous-catégorie —"
            hint={
              isEdit && !aucuneSousCategorie
                ? 'Choisir une autre sous-catégorie déplace la gamme.'
                : undefined
            }
          />
          {aucuneSousCategorie && (
            <p className="text-sm text-muted-foreground">
              Aucune sous-catégorie de gamme dans ce périmètre. Pour en créer,
              passe par{' '}
              <span className="font-medium">
                Bibliothèque › Plan de maintenance
              </span>
              .
            </p>
          )}
        </div>
      </FormDialog>
    </Form>
  )
}
