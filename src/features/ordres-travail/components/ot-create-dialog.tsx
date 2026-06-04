import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { gammesPourOtQueries } from '../queries'
import { emptyOtCreate, otCreateSchema } from '../schemas'
import { useCreateOt } from '../mutations'
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

    try {
      await create.mutateAsync({
        siteId,
        createdBy,
        gammeId: gamme.id,
        datePrevue: parsed.data.date_prevue,
        nature: gamme.nature,
        prestataireId: gamme.prestataire_id,
        nomGamme: gamme.nom,
        libellePeriodicite: gamme.periodicites.libelle,
      })
      toast.success('Ordre de travail créé')
      onOpenChange(false)
    } catch (e) {
      // Anti-doublon, gamme sans opération, gamme inactive… → erreur backend.
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvel ordre de travail</DialogTitle>
          <DialogDescription>
            Génère un OT depuis une gamme. Les opérations et les informations
            figées sont créées automatiquement.
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
            <Label htmlFor="ot-gamme">Gamme *</Label>
            <select
              id="ot-gamme"
              value={values.gamme_id}
              onChange={(e) =>
                setValues((v) => ({ ...v, gamme_id: e.target.value }))
              }
              aria-invalid={errors.gamme_id ? true : undefined}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
            >
              <option value="">— Sélectionner une gamme —</option>
              {gammes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
            {errors.gamme_id && (
              <p className="text-destructive text-sm">{errors.gamme_id}</p>
            )}
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
            onChange={(date_prevue) =>
              setValues((v) => ({ ...v, date_prevue }))
            }
            error={errors.date_prevue}
          />

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
