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
import { Label } from '@/components/ui/label'
import { TextField } from '@/components/common/text-field'
import type { Database } from '@/lib/database.types'

type Gamme = Database['public']['Tables']['gammes']['Row']

const SELECT_CLASS =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]'

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

          <div className="grid gap-2">
            <Label htmlFor="gamme_nature">Nature *</Label>
            <select
              id="gamme_nature"
              value={values.nature}
              onChange={(e) =>
                set('nature', e.target.value as GammeFormValues['nature'])
              }
              aria-invalid={errors.nature ? true : undefined}
              className={SELECT_CLASS}
            >
              {gammeNatures.map((n) => (
                <option key={n} value={n}>
                  {NATURE_LABEL[n]}
                </option>
              ))}
            </select>
            {errors.nature && (
              <p className="text-destructive text-sm">{errors.nature}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gamme_periodicite">Périodicité *</Label>
            <select
              id="gamme_periodicite"
              value={values.periodicite_id}
              onChange={(e) => set('periodicite_id', e.target.value)}
              aria-invalid={errors.periodicite_id ? true : undefined}
              className={SELECT_CLASS}
            >
              <option value="">— Choisir une périodicité —</option>
              {periodicites.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.libelle}
                </option>
              ))}
            </select>
            {errors.periodicite_id && (
              <p className="text-destructive text-sm">
                {errors.periodicite_id}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gamme_prestataire">Prestataire par défaut *</Label>
            <select
              id="gamme_prestataire"
              value={values.prestataire_id}
              onChange={(e) => set('prestataire_id', e.target.value)}
              aria-invalid={errors.prestataire_id ? true : undefined}
              className={SELECT_CLASS}
            >
              <option value="">— Choisir un prestataire —</option>
              {prestataires.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.libelle}
                </option>
              ))}
            </select>
            {errors.prestataire_id && (
              <p className="text-destructive text-sm">
                {errors.prestataire_id}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gamme_description">Description</Label>
            <textarea
              id="gamme_description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
            {errors.description && (
              <p className="text-destructive text-sm">{errors.description}</p>
            )}
          </div>

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
