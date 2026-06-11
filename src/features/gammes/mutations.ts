import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gammesQueries } from './queries'
import {
  gammeBiblioSchema,
  gammeSchema,
  operationSchema,
  type GammeBiblioFormValues,
  type GammeFormValues,
  type OperationFormValues,
} from './schemas'

function gammePayload(values: GammeFormValues) {
  const v = gammeSchema.parse(values)
  return {
    nom: v.nom,
    nature: v.nature,
    periodicite_id: Number(v.periodicite_id),
    prestataire_id: v.prestataire_id,
    // Sous-catégorie obligatoire (garantie non vide par le schéma).
    categorie_id: v.categorie_id,
    description: v.description || null,
  }
}

// Payload d'une gamme-template de Bibliothèque : ajoute la catégorie (requise)
// et résout la portée → `site_id` (commun = NULL inviolable, ou un site).
function gammeBiblioPayload(
  values: GammeBiblioFormValues,
  siteId: string | null,
) {
  const v = gammeBiblioSchema.parse(values)
  return {
    nom: v.nom,
    nature: v.nature,
    periodicite_id: Number(v.periodicite_id),
    // Un template commun n'a PAS de prestataire (il dépend du site, renseigné
    // après copie) → NULL. Le champ a été retiré du formulaire de template.
    prestataire_id: v.prestataire_id || null,
    description: v.description || null,
    categorie_id: v.categorie_id,
    site_id: v.portee === 'entreprise' ? null : siteId,
  }
}

export function useCreateGamme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string
      createdBy: string
      values: GammeFormValues
    }) => {
      const { data } = await supabase
        .from('gammes')
        .insert({
          ...gammePayload(values),
          site_id: siteId,
          created_by: createdBy,
        })
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

export function useUpdateGamme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: GammeFormValues
    }) => {
      const { data } = await supabase
        .from('gammes')
        .update(gammePayload(values))
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

export function useDeleteGamme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('gammes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

// --- Gammes-templates (Bibliothèque) ---

/** Crée une gamme-template (commun ou site) avec sa catégorie obligatoire. */
export function useCreateGammeBiblio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string | null
      createdBy: string
      values: GammeBiblioFormValues
    }) => {
      const { data } = await supabase
        .from('gammes')
        .insert({
          ...gammeBiblioPayload(values, siteId),
          created_by: createdBy,
        })
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

/** Édite une gamme-template (nom, nature, périodicité, prestataire, catégorie, portée). */
export function useUpdateGammeBiblio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      siteId,
      values,
    }: {
      id: string
      siteId: string | null
      values: GammeBiblioFormValues
    }) => {
      const { data } = await supabase
        .from('gammes')
        .update(gammeBiblioPayload(values, siteId))
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

/**
 * Copie une gamme PAR VALEUR vers le site cible via la RPC dédiée
 * (`copier_gamme` : gamme + opérations spécifiques + liaisons `gamme_modeles`,
 * modèles partagés). Le `siteCible` est CHOISI par l'appelant :
 * - intra-site (« Dupliquer ») → le site courant ;
 * - commun → mon site (« Copier vers un site ») → un site accessible choisi.
 * La RPC arbitre les droits (accès au site cible) → 42501 à catcher côté UI.
 */
export function useCopierGamme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sourceGammeId,
      siteCible,
    }: {
      sourceGammeId: string
      siteCible: string
    }) => {
      const { data } = await supabase
        .rpc('copier_gamme', {
          p_source_gamme_id: sourceGammeId,
          p_site_cible: siteCible,
        })
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

// --- Opérations ---

function operationPayload(
  values: OperationFormValues,
  requiresSeuils: boolean,
) {
  const v = operationSchema.parse(values)
  return {
    nom: v.nom,
    ordre: v.ordre === '' ? 0 : Number(v.ordre),
    type_operation_id: Number(v.type_operation_id),
    // Unité et seuils n'ont de sens que pour un type « mesure ».
    unite_id: requiresSeuils && v.unite_id ? Number(v.unite_id) : null,
    seuil_minimum:
      requiresSeuils && v.seuil_minimum !== '' ? Number(v.seuil_minimum) : null,
    seuil_maximum:
      requiresSeuils && v.seuil_maximum !== '' ? Number(v.seuil_maximum) : null,
    description: v.description || null,
  }
}

export function useCreateOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      gammeId,
      values,
      requiresSeuils,
    }: {
      gammeId: string
      values: OperationFormValues
      requiresSeuils: boolean
    }) => {
      const { data } = await supabase
        .from('operations')
        .insert({
          ...operationPayload(values, requiresSeuils),
          gamme_id: gammeId,
        })
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

export function useUpdateOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      requiresSeuils,
    }: {
      id: string
      values: OperationFormValues
      requiresSeuils: boolean
    }) => {
      const { data } = await supabase
        .from('operations')
        .update(operationPayload(values, requiresSeuils))
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

export function useDeleteOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('operations').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

// --- Liaison modèles d'opération (gamme_modeles) ---

/**
 * Lie en masse des modèles d'opération à une gamme (INSERT `gamme_modeles`).
 * La PK composite empêche les doublons (filtrés en amont côté UI) ; la RLS et
 * les triggers (scope, modèle non vide) arbitrent → erreurs à catcher côté UI.
 */
export function useLierModelesOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      gammeId,
      modeleIds,
    }: {
      gammeId: string
      modeleIds: string[]
    }) => {
      await supabase
        .from('gamme_modeles')
        .insert(
          modeleIds.map((modele_operation_id) => ({
            gamme_id: gammeId,
            modele_operation_id,
          })),
        )
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

/**
 * Détache un modèle d'opération d'une gamme (DELETE de la seule ligne de
 * liaison ; le modèle lui-même n'est jamais supprimé). Un trigger peut refuser
 * (dernière source d'opération d'une gamme préventive active) → erreur à catcher.
 */
export function useDelierModeleOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      gammeId,
      modeleId,
    }: {
      gammeId: string
      modeleId: string
    }) => {
      await supabase
        .from('gamme_modeles')
        .delete()
        .eq('gamme_id', gammeId)
        .eq('modele_operation_id', modeleId)
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}

// --- Liaison équipements ---

/** Synchronise la liste des équipements liés à une gamme (ajouts + retraits). */
export function useSyncGammeEquipements() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      gammeId,
      current,
      selected,
    }: {
      gammeId: string
      current: string[]
      selected: string[]
    }) => {
      const toAdd = selected.filter((id) => !current.includes(id))
      const toRemove = current.filter((id) => !selected.includes(id))

      if (toAdd.length > 0) {
        await supabase
          .from('gammes_equipements')
          .insert(
            toAdd.map((equipement_id) => ({
              gamme_id: gammeId,
              equipement_id,
            })),
          )
          .throwOnError()
      }
      if (toRemove.length > 0) {
        await supabase
          .from('gammes_equipements')
          .delete()
          .eq('gamme_id', gammeId)
          .in('equipement_id', toRemove)
          .throwOnError()
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gammesQueries.all() }),
  })
}
