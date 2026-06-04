import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { otsPourObservationQueries } from '../queries'
import {
  GRAVITES,
  LIBELLES_GRAVITE,
  LIBELLES_SOURCE,
  SOURCES,
  emptyObservationCreate,
  observationCreateSchema,
} from '../schemas'
import type { ObservationCreateValues, ObservationSource } from '../schemas'
import { useCreateObservation } from '../mutations'
import { errorMessage, fieldErrors } from '@/lib/form'
import { TextField } from '@/components/common/text-field'
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

interface ObservationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  createdBy: string
}

const selectClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]'

/**
 * Création d'une observation rattachée (optionnellement) à un OT du site.
 * Le rattachement à un équipement est dérivé de l'OT choisi. Un contrôle
 * réglementaire impose un OT (CHECK backend, doublé d'une validation Zod).
 */
export function ObservationFormDialog({
  open,
  onOpenChange,
  siteId,
  createdBy,
}: ObservationFormDialogProps) {
  const { data: ots = [] } = useQuery(otsPourObservationQueries.list(siteId))
  const create = useCreateObservation()
  const [values, setValues] = useState<ObservationCreateValues>(() =>
    emptyObservationCreate(),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  function set<K extends keyof ObservationCreateValues>(
    key: K,
    value: ObservationCreateValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = observationCreateSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})

    try {
      await create.mutateAsync({
        siteId,
        createdBy,
        values: parsed.data,
      })
      toast.success('Observation créée')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle observation</DialogTitle>
          <DialogDescription>
            Réserve ou non-conformité de sécurité. Rattachez-la à un ordre de
            travail si elle découle d'un contrôle.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="obs-source">Source *</Label>
            <select
              id="obs-source"
              value={values.source}
              onChange={(e) =>
                set('source', e.target.value as ObservationSource)
              }
              className={selectClass}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LIBELLES_SOURCE[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="obs-gravite">Gravité *</Label>
            <select
              id="obs-gravite"
              value={values.gravite}
              onChange={(e) =>
                set(
                  'gravite',
                  e.target.value as ObservationCreateValues['gravite'],
                )
              }
              className={selectClass}
            >
              {GRAVITES.map((g) => (
                <option key={g} value={g}>
                  {LIBELLES_GRAVITE[g]}
                </option>
              ))}
            </select>
          </div>

          <TextField
            id="obs-description"
            label="Description"
            required
            value={values.description}
            onChange={(description) => set('description', description)}
            error={errors.description}
          />

          <TextField
            id="obs-echeance"
            label="Échéance"
            type="date"
            value={values.echeance}
            onChange={(echeance) => set('echeance', echeance)}
            error={errors.echeance}
          />

          <div className="grid gap-2">
            <Label htmlFor="obs-ot">
              Ordre de travail
              {values.source === 'controle_reglementaire' ? ' *' : ''}
            </Label>
            <select
              id="obs-ot"
              value={values.ot_id}
              onChange={(e) => set('ot_id', e.target.value)}
              aria-invalid={errors.ot_id ? true : undefined}
              className={selectClass}
            >
              <option value="">— Aucun —</option>
              {ots.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nom_gamme}
                  {o.nom_equipement ? ` — ${o.nom_equipement}` : ''}
                </option>
              ))}
            </select>
            {errors.ot_id && (
              <p className="text-destructive text-sm">{errors.ot_id}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Création…' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
