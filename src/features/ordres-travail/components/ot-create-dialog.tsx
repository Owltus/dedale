import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { gammesPourOtQueries } from '../queries'
import { emptyOtCreate, otCreateSchema } from '../schemas'
import { useCreateOt } from '../mutations'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { FormDialog } from '@/components/common/form-dialog'

interface OtCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  createdBy: string
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
}: OtCreateDialogProps) {
  const { data: gammes = [] } = useQuery(gammesPourOtQueries.list(siteId))
  const create = useCreateOt()
  const [values, setValues] = useState(emptyOtCreate())
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleSubmit() {
    const parsed = otCreateSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})

    const gamme = gammes.find((g) => g.id === parsed.data.gamme_id)
    if (!gamme) {
      setErrors({ gamme_id: 'Gamme introuvable' })
      return
    }

    // Depuis la migration 007 le prestataire d'une gamme de site est nullable
    // (une gamme copiée d'un template n'en a pas) : on bloque AVANT l'INSERT
    // plutôt que d'envoyer un UUID vide et de récolter une erreur Postgres brute.
    if (!gamme.prestataire_id) {
      setErrors({
        gamme_id:
          'Cette gamme n’a pas de prestataire. Renseigne-le dans la fiche gamme avant de créer un OT.',
      })
      return
    }

    try {
      await create.mutateAsync({
        siteId,
        createdBy,
        gammeId: gamme.id,
        datePrevue: parsed.data.date_prevue,
        nature: gamme.nature,
        // Prestataire garanti non vide par le garde-fou ci-dessus (colonne
        // nullable depuis que les gammes peuvent être copiées de templates).
        prestataireId: gamme.prestataire_id,
        nomGamme: gamme.nom,
        libellePeriodicite: gamme.periodicites.libelle,
      })
      toast.success('Ordre de travail créé')
      onOpenChange(false)
    } catch (e) {
      // Anti-doublon, gamme sans opération, gamme inactive… → erreur backend.
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvel ordre de travail"
      description="Génère un OT depuis une gamme. Les opérations et les informations figées sont créées automatiquement."
      onSubmit={() => void handleSubmit()}
      submitLabel="Créer"
      pendingLabel="Création…"
      pending={create.isPending}
    >
      <div className="grid gap-2">
        <SelectField
          label="Gamme"
          required
          value={values.gamme_id}
          onChange={(gamme_id) => setValues((v) => ({ ...v, gamme_id }))}
          error={errors.gamme_id}
        >
          <option value="">— Sélectionner une gamme —</option>
          {gammes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nom}
            </option>
          ))}
        </SelectField>
        {gammes.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Aucune gamme active sur ce site. Créez d'abord une gamme avec au
            moins une opération.
          </p>
        )}
      </div>

      <TextField
        id="ot-date"
        label="Date prévue"
        type="date"
        required
        value={values.date_prevue}
        onChange={(date_prevue) => setValues((v) => ({ ...v, date_prevue }))}
        error={errors.date_prevue}
      />
    </FormDialog>
  )
}
