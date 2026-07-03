import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { gammesPourOtQueries } from '../queries'
import { emptyOtCreate, otCreateSchema } from '../schemas'
import type { OtCreateFormValues } from '../schemas'
import { useCreateOt } from '../mutations'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { SelectField } from '@/components/common/fields/select-field'

interface OtCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  createdBy: string
  /**
   * Gamme PRÉ-SÉLECTIONNÉE et verrouillée (ex. création depuis la fiche gamme :
   * l'OT est forcément pour cette gamme). Le sélecteur est alors désactivé. Omis
   * → sélecteur libre (page Ordres de travail).
   */
  presetGammeId?: string
}

/**
 * Génère un OT depuis une gamme du site. L'utilisateur choisit la gamme + la
 * date prévue ; le backend fige les snapshots, résout le prestataire effectif
 * et génère les opérations. L'anti-doublon (1 OT actif par gamme) est attrapé.
 */
export function OtCreateDialog({
  open,
  onOpenChange,
  siteId,
  createdBy,
  presetGammeId,
}: OtCreateDialogProps) {
  const { data: gammes = [] } = useQuery(gammesPourOtQueries.list(siteId))
  const create = useCreateOt()
  const form = useForm<OtCreateFormValues>({
    resolver: zodResolver(otCreateSchema),
    defaultValues: presetGammeId
      ? { ...emptyOtCreate(), gamme_id: presetGammeId }
      : emptyOtCreate(),
  })
  const submit = useSubmitDialog<OtCreateFormValues>({
    onSubmit: (data) => {
      // Gamme + prestataire garantis par les garde-fous de `valider` (sinon le
      // dialog reste ouvert avec une erreur de champ) : on peut résoudre sans risque.
      const gamme = gammes.find((g) => g.id === data.gamme_id)!
      return create.mutateAsync({
        siteId,
        createdBy,
        gammeId: gamme.id,
        datePrevue: data.date_prevue,
        nature: gamme.nature,
        // Prestataire garanti non vide par le garde-fou ci-dessous (colonne
        // nullable depuis que les gammes peuvent être copiées de templates).
        prestataireId: gamme.prestataire_id!,
        nomGamme: gamme.nom,
        libellePeriodicite: gamme.periodicites.libelle,
      })
    },
    successMessage: 'Ordre de travail créé',
    close: () => onOpenChange(false),
  })

  // Garde-fous MÉTIER avant l'écriture : gamme trouvée + prestataire renseigné.
  // Depuis la migration 007 le prestataire d'une gamme de site est nullable (une
  // gamme copiée d'un template n'en a pas) : on bloque AVANT l'INSERT plutôt que
  // d'envoyer un UUID vide. Échec → erreur de CHAMP sous le sélecteur (dialog
  // laissé ouvert, pas de toast).
  function valider(data: OtCreateFormValues) {
    const gamme = gammes.find((g) => g.id === data.gamme_id)
    if (!gamme) {
      form.setError('gamme_id', { message: 'Gamme introuvable' })
      return
    }
    if (!gamme.prestataire_id) {
      form.setError('gamme_id', {
        message:
          'Cette gamme n’a pas de prestataire. Renseigne-le dans la fiche gamme avant de créer un OT.',
      })
      return
    }
    return submit(data)
  }

  const gammeOptions = gammes.map((g) => ({ value: g.id, label: g.nom }))

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Nouvel ordre de travail"
        description="Génère un OT depuis une gamme. Les opérations et les informations figées sont créées automatiquement."
        onSubmit={() => void form.handleSubmit(valider)()}
        submitLabel="Créer"
        pendingLabel="Création…"
        pending={form.formState.isSubmitting}
      >
        <SelectField
          control={form.control}
          name="gamme_id"
          label="Gamme"
          required
          disabled={presetGammeId !== undefined}
          options={gammeOptions}
          placeholder="— Sélectionner une gamme —"
          hint={
            gammes.length === 0
              ? "Aucune gamme active sur ce site. Créez d'abord une gamme avec au moins une opération."
              : undefined
          }
        />

        <DateField
          control={form.control}
          name="date_prevue"
          label="Date prévue"
          required
        />
      </FormDialog>
    </Form>
  )
}
