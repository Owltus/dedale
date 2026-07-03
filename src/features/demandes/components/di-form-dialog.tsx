import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { diSchema, emptyDi } from '../schemas'
import { useCreateDemande } from '../mutations'
import { modelesDiQueries } from '../queries'
import { ModeleDiSelect } from './modele-di-select'
import { LocalEquipementFields } from '@/features/equipements/components/local-equipement-fields'
import { LocalSearchSelect } from '@/features/equipements/components/local-search-select'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'

interface DiFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
}

// Sentinelle : session expirée entre l'ouverture du modal et l'envoi. Levée
// depuis `onSubmit`, elle est traduite par `errorMessage` en un message dédié
// (sans polluer les autres erreurs serveur, traitées par `writeErrorMessage`).
const SESSION_EXPIREE = 'Session expirée, reconnecte-toi.'

/**
 * Création d'une demande d'intervention — UN seul écran, libellés sobres :
 *   - « Problème courant » (modèles de DI du site) : pré-remplit le constat.
 *   - « Localisation » en RECHERCHE intuitive (LocalSearchSelect) : on tape le nom
 *     d'une pièce, le chemin Bât › Étage lève les homonymes. Facultatif.
 *   - « Équipement » : TOUJOURS présent mais désactivé tant qu'aucun lieu n'est
 *     choisi (limité aux équipements de ce lieu). Facultatif.
 *   - « Constat » : champ libre obligatoire.
 * La date de constat est figée à aujourd'hui (non saisie, todayLocal côté schéma).
 */
export function DiFormDialog({ open, onOpenChange, siteId }: DiFormDialogProps) {
  const { session } = useAuth()
  const create = useCreateDemande()
  const { data: modeles = [] } = useQuery(modelesDiQueries.list(siteId))

  // Puce de modèle active (mise en évidence visuelle seulement).
  const [modeleId, setModeleId] = useState('')

  const form = useFormDialog({
    schema: diSchema,
    initialValues: () => emptyDi(),
    onSubmit: (data) => {
      if (!session) throw new Error(SESSION_EXPIREE)
      return create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: "Demande d'intervention créée",
    close: () => onOpenChange(false),
    errorMessage: (e) =>
      e instanceof Error && e.message === SESSION_EXPIREE
        ? SESSION_EXPIREE
        : writeErrorMessage(e),
  })

  // Sélection d'un « problème courant » (modèle) : pré-remplit le constat.
  function applyModele(id: string) {
    setModeleId(id)
    const m = modeles.find((x) => x.id === id)
    if (m) form.setValues((v) => ({ ...v, constat: m.constat_modele }))
  }

  // Saisie manuelle : on dé-surligne la puce (le texte ne correspond plus).
  function editConstat(value: string) {
    form.set('constat', value)
    setModeleId('')
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle demande d'intervention"
      onSubmit={() => void form.submit()}
      submitLabel="Envoyer ma demande"
      pendingLabel="Envoi…"
      pending={form.pending}
    >
      {modeles.length > 0 && (
        <ModeleDiSelect
          label="Problème courant"
          modeles={modeles}
          value={modeleId}
          onChange={applyModele}
        />
      )}

      {/* Cascade Localisation → Équipement (l'équipement se borne au lieu choisi). */}
      <LocalEquipementFields
        siteId={siteId}
        localId={form.values.local_id}
        equipementId={form.values.equipement_id}
        onChange={({ localId, equipementId }) =>
          form.setValues((v) => ({
            ...v,
            local_id: localId,
            equipement_id: equipementId,
          }))
        }
        errors={{
          local_id: form.errors.local_id,
          equipement_id: form.errors.equipement_id,
        }}
        equipementSelectId="di-equipement"
        renderLieu={(p) => (
          <LocalSearchSelect
            siteId={p.siteId}
            label="Localisation"
            value={p.value}
            onChange={p.onChange}
          />
        )}
      />

      <TextareaField
        id="di-constat"
        label="Constat"
        required
        rows={5}
        placeholder="Ex. éclairage du 2ᵉ étage à remplacer"
        value={form.values.constat}
        onChange={editConstat}
        error={form.errors.constat}
      />
    </FormDialog>
  )
}
