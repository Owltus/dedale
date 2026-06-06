import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { diSchema, emptyDi } from '../schemas'
import type { DiFormValues } from '../schemas'
import { useCreateDemande } from '../mutations'
import { modelesDiQueries } from '../queries'
import { equipementsQueries } from '@/features/equipements/queries'
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

interface DiFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
}

export function DiFormDialog({
  open,
  onOpenChange,
  siteId,
}: DiFormDialogProps) {
  const { session } = useAuth()
  const create = useCreateDemande()
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))
  const { data: prestataires = [] } = useQuery(prestatairesQueries.list())
  const { data: modeles = [] } = useQuery(modelesDiQueries.list(siteId))

  const [values, setValues] = useState<DiFormValues>(() => emptyDi())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [modeleId, setModeleId] = useState('')

  function set(key: keyof DiFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  // Suggestion rapide : pré-remplit le constat depuis un modèle de DI du site.
  function applyModele(id: string) {
    setModeleId(id)
    const modele = modeles.find((m) => m.id === id)
    if (modele) set('constat', modele.constat_modele)
  }

  async function handleSubmit() {
    const parsed = diSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    if (!session) {
      toast.error('Session expirée, reconnecte-toi.')
      return
    }
    try {
      await create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: parsed.data,
      })
      toast.success("Demande d'intervention créée")
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle demande d'intervention</DialogTitle>
          <DialogDescription>
            Décris le constat. Le lieu, l'équipement et le prestataire sont
            optionnels.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          {modeles.length > 0 && (
            <SelectField
              id="di-modele"
              label="Suggestion rapide"
              value={modeleId}
              onChange={applyModele}
            >
              <option value="">Aucun modèle</option>
              {modeles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
            </SelectField>
          )}

          <TextareaField
            id="di-constat"
            label="Constat"
            required
            rows={4}
            value={values.constat}
            onChange={(v) => set('constat', v)}
            error={errors.constat}
          />

          <TextField
            label="Date de constat"
            type="date"
            value={values.date_constat}
            onChange={(v) => set('date_constat', v)}
            error={errors.date_constat}
            required
          />

          <SelectField
            id="di-local"
            label="Localisation"
            value={values.local_id}
            onChange={(v) => set('local_id', v)}
          >
            <option value="">Aucune</option>
            {locaux.map((l) => (
              <option key={l.local_id} value={l.local_id ?? ''}>
                {l.chemin_court ?? l.local_nom}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="di-equipement"
            label="Équipement"
            value={values.equipement_id}
            onChange={(v) => set('equipement_id', v)}
          >
            <option value="">Aucun</option>
            {equipements.map((eq) => (
              <option key={eq.id} value={eq.id ?? ''}>
                {eq.nom}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="di-prestataire"
            label="Prestataire"
            value={values.prestataire_id}
            onChange={(v) => set('prestataire_id', v)}
          >
            <option value="">Aucun</option>
            {prestataires.map((p) => (
              <option key={p.id} value={p.id}>
                {p.libelle}
              </option>
            ))}
          </SelectField>

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
