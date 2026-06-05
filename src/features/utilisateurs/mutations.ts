import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utilisateursQueries } from './queries'
import { invokeFunction } from './edge'
import type { InviteFormValues } from './schemas'
import type { Database } from '@/lib/database.types'

type UserUpdate = Database['public']['Tables']['users']['Update']

/**
 * Invitation d'un nouvel utilisateur via l'Edge Function `invite_user`
 * (service_role côté serveur). Le front n'écrit JAMAIS directement dans
 * auth.users ni dans public.users : seul l'Edge Function pose les métadonnées
 * (role, nom_complet, created_by, site_ids) que le trigger consomme.
 */
export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: InviteFormValues): Promise<void> => {
      const res = await supabase.functions.invoke<{ error?: unknown }>(
        'invite_user',
        {
          body: {
            email: values.email.trim().toLowerCase(),
            role: values.role,
            nom_complet: values.nom_complet.trim(),
            site_ids: values.site_ids,
          },
        },
      )
      const data = res.data
      // supabase.functions.invoke ne throw pas sur un code HTTP >= 400 :
      // il faut inspecter `error` ET le corps JSON renvoyé par la fonction.
      if (res.error) {
        throw new Error(await edgeErrorMessage(res.error, data))
      }
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(String(data.error))
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: utilisateursQueries.all() }),
  })
}

/**
 * Active / désactive un compte (kill-switch `est_actif`). Côté base, ce champ
 * n'est modifiable que par un admin (trigger protect_users_sensitive_columns) :
 * un appel par un rôle inférieur renverra une erreur RLS/trigger.
 */
export function useToggleActif() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; estActif: boolean }) => {
      await supabase
        .from('users')
        .update({ est_actif: p.estActif })
        .eq('id', p.id)
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: utilisateursQueries.all() }),
  })
}

/**
 * Anonymisation RGPD (droit à l'effacement) via la RPC `anonymize_user`.
 * Réservée admin, auto-anonymisation interdite (contrôlé côté base). Remplace
 * les PII par des valeurs neutres et désactive le compte, en conservant la
 * trace métier dans l'historique.
 */
export function useAnonymizeUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase
        .rpc('anonymize_user', { p_user_id: id })
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: utilisateursQueries.all() }),
  })
}

/**
 * Extrait un message lisible d'une erreur d'Edge Function. `invoke` enveloppe
 * la réponse HTTP dans un FunctionsHttpError dont le corps porte notre
 * `{ error }` métier — on essaie de le récupérer pour un message clair.
 */
async function edgeErrorMessage(
  error: unknown,
  data: unknown,
): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data) {
    return String(data.error)
  }
  // FunctionsHttpError expose .context (la Response) ; on tente d'en lire le JSON.
  const ctx = (error as { context?: unknown }).context
  if (ctx instanceof Response) {
    try {
      const body: unknown = await ctx.clone().json()
      if (body && typeof body === 'object' && 'error' in body) {
        return String(body.error)
      }
    } catch {
      // corps non-JSON : on retombe sur le message générique ci-dessous.
    }
  }
  return error instanceof Error ? error.message : 'Échec de l’invitation'
}

/**
 * Met à jour le profil d'un utilisateur (nom, téléphone ; et role_id si fourni,
 * réservé admin par le trigger protect_users_sensitive_columns). La RLS limite
 * un manager à ses subordonnés sur ses sites ; sinon erreur 42501 catchée.
 */
export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      id: string
      nom_complet: string
      telephone: string
      role_id?: number
    }) => {
      const patch: UserUpdate = {
        nom_complet: p.nom_complet.trim(),
        telephone: p.telephone.trim() || null,
      }
      if (p.role_id !== undefined) patch.role_id = p.role_id
      // Pas de .select() : la colonne telephone est en SELECT révoqué (RGPD).
      await supabase.from('users').update(patch).eq('id', p.id).throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: utilisateursQueries.all() }),
  })
}

/** Attribue un site à un utilisateur (admin = tous ; manager = ses sites). */
export function useAssignSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { userId: string; siteId: string }) => {
      await supabase
        .from('user_sites')
        .insert({ user_id: p.userId, site_id: p.siteId })
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: utilisateursQueries.all() }),
  })
}

/** Retire un site d'un utilisateur. */
export function useUnassignSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { userId: string; siteId: string }) => {
      await supabase
        .from('user_sites')
        .delete()
        .eq('user_id', p.userId)
        .eq('site_id', p.siteId)
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: utilisateursQueries.all() }),
  })
}

/** Change l'e-mail d'un utilisateur via l'Edge Function (service_role, admin). */
export function useUpdateUserEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { userId: string; email: string }) => {
      await invokeFunction('update_user_email', {
        user_id: p.userId,
        email: p.email.trim().toLowerCase(),
      })
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: utilisateursQueries.all() }),
  })
}
