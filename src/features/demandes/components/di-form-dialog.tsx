import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { diSchema, emptyDi } from '../schemas'
import type { DiFormValues } from '../schemas'
import { useCreateDemande } from '../mutations'
import { modelesDiQueries } from '../queries'
import { equipementsQueries } from '@/features/equipements/queries'
import { ModeleDiSelect } from './modele-di-select'
import { LocalSearchSelect } from '@/features/equipements/components/local-search-select'
import { useAuth } from '@/auth'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'
import { SelectField } from '@/components/common/select-field'

interface DiFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
}

/**
 * Création d'une demande d'intervention — UN seul écran, libellés sobres :
 *   - « Problème courant » (modèles de DI du site) : pré-remplit le constat.
 *   - « Localisation » en RECHERCHE intuitive (LocalSearchSelect) : on tape le nom
 *     d'une pièce, le chemin Bât › Étage lève les homonymes. Facultatif.
 *   - « Constat » : champ libre obligatoire.
 *   - « Équipement » : TOUJOURS présent mais désactivé tant qu'aucun lieu n'est
 *     choisi (limité aux équipements de ce lieu). Facultatif.
 * La date de constat est figée à aujourd'hui (non saisie, todayLocal côté schéma).
 */
export function DiFormDialog({ open, onOpenChange, siteId }: DiFormDialogProps) {
  const { session } = useAuth()
  const create = useCreateDemande()
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))
  const { data: modeles = [] } = useQuery(modelesDiQueries.list(siteId))

  const [values, setValues] = useState<DiFormValues>(() => emptyDi())
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Puce de modèle active (mise en évidence visuelle seulement).
  const [modeleId, setModeleId] = useState('')

  function set(key: keyof DiFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  // Sélection d'un « problème courant » (modèle) : pré-remplit le constat.
  function applyModele(id: string) {
    setModeleId(id)
    const m = modeles.find((x) => x.id === id)
    if (m) {
      setValues((v) => ({ ...v, constat: m.constat_modele }))
      setErrors((e) => ({ ...e, constat: '' }))
    }
  }

  // Saisie manuelle : on dé-surligne la puce (le texte ne correspond plus).
  function editConstat(value: string) {
    set('constat', value)
    setModeleId('')
  }

  // Choisir un lieu réinitialise l'équipement (il doit appartenir au lieu).
  function setLocal(localId: string) {
    setValues((v) => ({ ...v, local_id: localId, equipement_id: '' }))
  }

  // Équipements DU lieu choisi (sinon liste vide → champ masqué).
  const equipementsDuLocal = useMemo(
    () =>
      values.local_id === ''
        ? []
        : equipements.filter((e) => e.local_id === values.local_id),
    [equipements, values.local_id],
  )

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
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle demande d'intervention"
      onSubmit={() => void handleSubmit()}
      submitLabel="Envoyer ma demande"
      pendingLabel="Envoi…"
      pending={create.isPending}
    >
      {modeles.length > 0 && (
        <ModeleDiSelect
          label="Problème courant"
          modeles={modeles}
          value={modeleId}
          onChange={applyModele}
        />
      )}

      <LocalSearchSelect
        siteId={siteId}
        label="Localisation"
        value={values.local_id}
        onChange={setLocal}
      />

      <TextareaField
        id="di-constat"
        label="Constat"
        required
        rows={5}
        placeholder="Ex. éclairage du 2ᵉ étage à remplacer"
        value={values.constat}
        onChange={editConstat}
        error={errors.constat}
      />

      {/* Équipement : TOUJOURS présent, mais DÉSACTIVÉ tant qu'aucun lieu n'est
          choisi (la liste se limite ensuite aux équipements de ce lieu). */}
      <SelectField
        id="di-equipement"
        label="Équipement"
        value={values.equipement_id}
        onChange={(v) => set('equipement_id', v)}
        disabled={values.local_id === ''}
      >
        <option value="">Aucun</option>
        {equipementsDuLocal.map((eq) => (
          <option key={eq.id ?? ''} value={eq.id ?? ''}>
            {eq.nom}
          </option>
        ))}
      </SelectField>
    </FormDialog>
  )
}
