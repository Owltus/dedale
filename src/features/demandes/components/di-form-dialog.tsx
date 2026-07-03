import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { diSchema, emptyDi } from '../schemas'
import type { DiFormValues } from '../schemas'
import { useCreateDemande } from '../mutations'
import { modelesDiQueries } from '../queries'
import { ModeleDiSelect } from './modele-di-select'
import { LocalEquipementFields } from '@/features/equipements/components/local-equipement-fields'
import { LocalSearchSelect } from '@/features/equipements/components/local-search-select'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { Textarea } from '@/components/ui/textarea'

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

  const form = useForm<DiFormValues>({
    resolver: zodResolver(diSchema),
    defaultValues: emptyDi(),
  })
  const submit = useSubmitDialog<DiFormValues>({
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

  // La cascade Localisation → Équipement est pilotée par un composant impératif
  // (value/onChange) : on lit l'état RHF via `useWatch` et on l'écrit via `setValue`.
  const localId = useWatch({ control: form.control, name: 'local_id' })
  const equipementId = useWatch({ control: form.control, name: 'equipement_id' })

  // Sélection d'un « problème courant » (modèle) : pré-remplit le constat.
  function applyModele(id: string) {
    setModeleId(id)
    const m = modeles.find((x) => x.id === id)
    if (m) form.setValue('constat', m.constat_modele)
  }

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Nouvelle demande d'intervention"
        description="Décrivez le problème constaté ; choisir un problème courant pré-remplit le constat."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Envoyer ma demande"
        pendingLabel="Envoi…"
        pending={form.formState.isSubmitting}
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
          localId={localId}
          equipementId={equipementId}
          onChange={({ localId, equipementId }) => {
            form.setValue('local_id', localId)
            form.setValue('equipement_id', equipementId)
          }}
          errors={{
            local_id: form.formState.errors.local_id?.message,
            equipement_id: form.formState.errors.equipement_id?.message,
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

        {/* Constat : la saisie manuelle dé-surligne la puce de modèle (le texte ne
            correspond plus). Champ contrôlé à la main pour porter cet effet de bord. */}
        <FormField
          control={form.control}
          name="constat"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Constat *</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  placeholder="Ex. éclairage du 2ᵉ étage à remplacer"
                  value={field.value}
                  onChange={(e) => {
                    field.onChange(e.target.value)
                    setModeleId('')
                  }}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>
    </Form>
  )
}
