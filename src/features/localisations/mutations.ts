import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  blockingReason,
  fetchBlockingChildren,
  localisationsQueries,
} from './queries'
import {
  batimentSchema,
  localSchema,
  niveauSchema,
  type BatimentFormValues,
  type LocalFormValues,
  type NiveauFormValues,
} from './schemas'

// --- Bâtiments ---

function batimentPayload(values: BatimentFormValues) {
  const v = batimentSchema.parse(values)
  return {
    nom: v.nom,
    description: v.description || null,
    miniature_id: v.miniature_id,
  }
}

export function useCreateBatiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      values,
    }: {
      siteId: string
      values: BatimentFormValues
    }) => {
      const { data } = await supabase
        .from('batiments')
        .insert({ ...batimentPayload(values), site_id: siteId })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}

export function useUpdateBatiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: BatimentFormValues
    }) => {
      const { data } = await supabase
        .from('batiments')
        .update(batimentPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}

export function useDeleteBatiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Filet de sécurité : refuser si au moins un niveau est rattaché (la
      // confirmation le bloque déjà en amont, ceci couvre une course/contournement).
      const { count } = await fetchBlockingChildren({ kind: 'batiment', id })
      if (count > 0) throw new Error(blockingReason('batiment', count))
      // Suppression définitive (hard-delete).
      await supabase
        .from('batiments')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}

// --- Niveaux ---

function niveauPayload(values: NiveauFormValues) {
  const v = niveauSchema.parse(values)
  return {
    nom: v.nom,
    description: v.description || null,
    miniature_id: v.miniature_id,
    ...(v.ordre === undefined ? {} : { ordre: v.ordre }),
  }
}

export function useCreateNiveau() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      batimentId,
      values,
    }: {
      batimentId: string
      values: NiveauFormValues
    }) => {
      const { data } = await supabase
        .from('niveaux')
        .insert({ ...niveauPayload(values), batiment_id: batimentId })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}

export function useUpdateNiveau() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: NiveauFormValues
    }) => {
      const { data } = await supabase
        .from('niveaux')
        .update(niveauPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}

export function useDeleteNiveau() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Filet de sécurité : refuser si au moins un local est rattaché.
      const { count } = await fetchBlockingChildren({ kind: 'niveau', id })
      if (count > 0) throw new Error(blockingReason('niveau', count))
      // Suppression définitive (hard-delete).
      await supabase
        .from('niveaux')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}

// --- Locaux ---

function localPayload(values: LocalFormValues) {
  const v = localSchema.parse(values)
  return {
    nom: v.nom,
    description: v.description || null,
    surface_m2: v.surface_m2 ?? null,
    type_local_id: v.type_local_id ?? null,
    miniature_id: v.miniature_id,
    chauffe_climatise: v.chauffe_climatise,
  }
}

export function useCreateLocal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      niveauId,
      values,
    }: {
      niveauId: string
      values: LocalFormValues
    }) => {
      const { data } = await supabase
        .from('locaux')
        .insert({ ...localPayload(values), niveau_id: niveauId })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}

export function useUpdateLocal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: LocalFormValues
    }) => {
      const { data } = await supabase
        .from('locaux')
        .update(localPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}

export function useDeleteLocal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Filet de sécurité : `equipements.local_id` est en RESTRICT → un local
      // contenant des équipements ne peut PAS être supprimé (la base refuse).
      const { count } = await fetchBlockingChildren({ kind: 'local', id })
      if (count > 0) throw new Error(blockingReason('local', count))
      // Suppression définitive (hard-delete).
      await supabase
        .from('locaux')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: localisationsQueries.all() }),
  })
}
