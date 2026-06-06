import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyGamme, gammeNatures, gammeSchema } from '../schemas'
import type { GammeFormValues } from '../schemas'
import { useCreateGamme, useUpdateGamme } from '../mutations'
import { referentielsQueries } from '../queries'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { TextareaField } from '@/components/common/textarea-field'
import type { Database } from '@/lib/database.types'

type Gamme = Database['public']['Tables']['gammes']['Row']

const NATURE_LABEL: Record<(typeof gammeNatures)[number], string> = {
  controle_reglementaire: 'Contrôle réglementaire',
  maintenance_preventive: 'Maintenance préventive',
}

interface GammeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  gamme?: Gamme | null
}

function initialValues(gamme: Gamme | null | undefined): GammeFormValues {
  if (!gamme) return emptyGamme
  return {
    nom: gamme.nom,
    nature: gamme.nature,
    periodicite_id: String(gamme.periodicite_id),
    prestataire_id: gamme.prestataire_id,
    description: gamme.description ?? '',
  }
}

export function GammeFormDialog({
  open,
  onOpenChange,
  siteId,
  gamme,
}: GammeFormDialogProps) {
  const isEdit = Boolean(gamme)
  const { session } = useAuth()
  const create = useCreateGamme()
  const update = useUpdateGamme()
  const { data: periodicites = [] } = useQuery(
    referentielsQueries.periodicites(),
  )
  const { data: prestataires = [] } = useQuery(prestatairesQueries.list())
  const [values, setValues] = useState<GammeFormValues>(() =>
    initialValues(gamme),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set<K extends keyof GammeFormValues>(
    key: K,
    value: GammeFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = gammeSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (gamme) {
        await update.mutateAsync({ id: gamme.id, values: parsed.data })
        toast.success('Gamme modifiée')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          siteId,
          createdBy: session.user.id,
          values: parsed.data,
        })
        toast.success('Gamme créée')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Modifier la gamme' : 'Nouvelle gamme'}
          </DialogTitle>
          <DialogDescription>
            Renseigne la nature, la périodicité (semaines ISO) et le prestataire
            par défaut.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <TextField
            label="Nom"
            value={values.nom}
            onChange={(v) => set('nom', v)}
            error={errors.nom}
            required
          />

          <SelectField
            label="Nature"
            required
            id="gamme_nature"
            value={values.nature}
            onChange={(v) => set('nature', v as GammeFormValues['nature'])}
            error={errors.nature}
          >
            {gammeNatures.map((n) => (
              <option key={n} value={n}>
                {NATURE_LABEL[n]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Périodicité"
            required
            id="gamme_periodicite"
            value={values.periodicite_id}
            onChange={(v) => set('periodicite_id', v)}
            error={errors.periodicite_id}
          >
            <option value="">— Choisir une périodicité —</option>
            {periodicites.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.libelle}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Prestataire par défaut"
            required
            id="gamme_prestataire"
            value={values.prestataire_id}
            onChange={(v) => set('prestataire_id', v)}
            error={errors.prestataire_id}
          >
            <option value="">— Choisir un prestataire —</option>
            {prestataires.map((p) => (
              <option key={p.id} value={p.id}>
                {p.libelle}
              </option>
            ))}
          </SelectField>

          <TextareaField
            label="Description"
            id="gamme_description"
            value={values.description}
            onChange={(v) => set('description', v)}
            rows={3}
            error={errors.description}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
