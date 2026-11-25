import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  clientEnregistreur,
  nouvelEnregistreur,
  sequence,
  type Enregistreur,
} from '@/test/supabase-enregistreur'
import { utilisateursQueries } from './queries'
import {
  useAnonymizeUser,
  useAssignSite,
  useChangerAccesClaude,
  useCreerCompte,
  useSetUserPassword,
  useToggleActif,
  useUnassignSite,
  useUpdateUser,
  useUpdateUserEmail,
} from './mutations'

/**
 * Gestion des comptes : création (Edge Function `invite_user`, jamais
 * d'écriture directe dans auth.users), changement de rôle et de profil, sites,
 * kill-switch. Comportement ACTUEL ; les écarts fautifs sont en `it.fails`.
 */
const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({
  supabase: { ...clientEnregistreur(enr), functions: { invoke } },
}))

const USER = '11111111-1111-1111-1111-111111111111'
const SITE = '22222222-2222-2222-2222-222222222222'
const REFUS = {
  message: 'Modification du rôle réservée à un admin',
  code: '42501',
}

function harnais() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidations = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { wrapper, invalidations }
}

async function jouer<V>(
  utiliser: () => {
    mutate: (v: V) => void
    isSuccess: boolean
    isError: boolean
    error: unknown
  },
  variables: V,
  attendre: 'succes' | 'echec' = 'succes',
) {
  const { wrapper, invalidations } = harnais()
  const { result } = renderHook(utiliser, { wrapper })
  result.current.mutate(variables)
  await waitFor(() =>
    expect(
      attendre === 'succes' ? result.current.isSuccess : result.current.isError,
    ).toBe(true),
  )
  return { result, invalidations }
}

const appels = (n: number) => enr.courant!.requetes[n]!.appels

const compte = {
  email: '  Jean.Dupont@Exemple.FR ',
  nom_complet: '  Jean Dupont ',
  role: 'technicien' as const,
  site_ids: [SITE],
  password: ' mot de passe à espaces ',
  password_confirm: ' mot de passe à espaces ',
}

describe('useCreerCompte (Edge Function invite_user)', () => {
  it('appelle invite_user : e-mail normalisé, nom nettoyé, mot de passe INTACT, sans écrire en base, puis invalidation', async () => {
    enr.courant = nouvelEnregistreur()
    invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
    const { invalidations } = await jouer(() => useCreerCompte(), compte)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('invite_user', {
      body: {
        email: 'jean.dupont@exemple.fr',
        password: ' mot de passe à espaces ',
        role: 'technicien',
        nom_complet: 'Jean Dupont',
        site_ids: [SITE],
      },
    })
    // Pas de password_confirm envoyé, aucune requête PostgREST.
    expect(enr.courant.requetes).toEqual([])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: utilisateursQueries.all(),
    })
  })

  it('erreur HTTP avec corps { error } : le message du serveur remonte, rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur()
    invoke.mockReset().mockResolvedValue({
      data: { error: 'Un compte existe déjà avec cet e-mail.' },
      error: new Error('Edge Function returned a non-2xx status code'),
    })
    const { result, invalidations } = await jouer(
      () => useCreerCompte(),
      compte,
      'echec',
    )
    expect(result.current.error).toBeInstanceOf(Error)
    expect((result.current.error as Error).message).toBe(
      'Un compte existe déjà avec cet e-mail.',
    )
    expect(invalidations).not.toHaveBeenCalled()
  })

  it('réponse 200 portant { error } : traitée comme un échec', async () => {
    enr.courant = nouvelEnregistreur()
    invoke
      .mockReset()
      .mockResolvedValue({ data: { error: 'Rôle non autorisé' }, error: null })
    const { result, invalidations } = await jouer(
      () => useCreerCompte(),
      compte,
      'echec',
    )
    expect((result.current.error as Error).message).toBe('Rôle non autorisé')
    expect(invalidations).not.toHaveBeenCalled()
  })

  it('erreur HTTP dont le corps est dans context (Response JSON) : message lu dans la réponse', async () => {
    enr.courant = nouvelEnregistreur()
    const erreur = Object.assign(new Error('non-2xx'), {
      context: new Response(JSON.stringify({ error: 'Accès refusé' }), {
        status: 403,
      }),
    })
    invoke.mockReset().mockResolvedValue({ data: null, error: erreur })
    const { result } = await jouer(() => useCreerCompte(), compte, 'echec')
    expect((result.current.error as Error).message).toBe('Accès refusé')
  })
})

describe('useUpdateUser (profil et changement de rôle)', () => {
  it('changement de rôle : role_id dans le même UPDATE que le profil, ne relit QUE l’id (téléphone révoqué)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [[{ id: USER }]] })
    const { invalidations } = await jouer(() => useUpdateUser(), {
      id: USER,
      nom_complet: '  Jeanne ',
      telephone: '   ',
      role_id: 2,
    })
    expect(sequence(enr.courant)).toEqual(['from:users update'])
    expect(appels(0)[0]).toEqual([
      'update',
      { nom_complet: 'Jeanne', telephone: null, role_id: 2 },
    ])
    expect(appels(0)).toContainEqual(['eq', 'id', USER])
    // `select('id')` seul : un `.select()` nu demanderait telephone (SELECT
    // révoqué, RGPD) et ferait échouer tout l'UPDATE.
    expect(appels(0).filter(([m]) => m === 'select')).toEqual([
      ['select', 'id'],
    ])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: utilisateursQueries.all(),
    })
  })

  it('sans role_id (non-admin) : le rôle n’est pas dans le patch', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [[{ id: USER }]] })
    await jouer(() => useUpdateUser(), {
      id: USER,
      nom_complet: 'Jeanne',
      telephone: ' 06 00 00 00 00 ',
    })
    expect(appels(0)[0]).toEqual([
      'update',
      { nom_complet: 'Jeanne', telephone: '06 00 00 00 00' },
    ])
  })

  it('rôle refusé par la base (42501, trigger protect_users_sensitive_columns) : erreur remontée, rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { result, invalidations } = await jouer(
      () => useUpdateUser(),
      { id: USER, nom_complet: 'Jeanne', telephone: '', role_id: 1 },
      'echec',
    )
    expect(result.current.error).toMatchObject({ code: '42501' })
    expect(invalidations).not.toHaveBeenCalled()
  })

  it('un UPDATE filtré par la RLS (0 ligne, aucun code d’erreur — constaté sur la base locale : manager → admin = 204) échoue en PGRST116, rien d’invalidé', async () => {
    // La base renvoie « rien », sans erreur : c'est ce que fait PostgREST
    // quand la policy USING écarte la ligne.
    enr.courant = nouvelEnregistreur({ reponses: [[]] })
    const { result, invalidations } = await jouer(
      () => useUpdateUser(),
      { id: USER, nom_complet: 'Jeanne', telephone: '' },
      'echec',
    )
    // Code traduit par `writeErrorMessage` (« hors de votre périmètre »).
    expect(result.current.error).toMatchObject({ code: 'PGRST116' })
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('autres écritures de comptes', () => {
  it('useToggleActif : UPDATE est_actif seul', async () => {
    enr.courant = nouvelEnregistreur()
    const { invalidations } = await jouer(() => useToggleActif(), {
      id: USER,
      estActif: false,
    })
    expect(appels(0)[0]).toEqual(['update', { est_actif: false }])
    expect(appels(0)).toContainEqual(['eq', 'id', USER])
    expect(invalidations).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['aucun', { acces_ia: false, acces_ia_ecriture: false }],
    ['lecture', { acces_ia: true, acces_ia_ecriture: false }],
    ['ecriture', { acces_ia: true, acces_ia_ecriture: true }],
  ] as const)(
    'useChangerAccesClaude %s : les deux colonnes ensemble',
    async (niveau, colonnes) => {
      enr.courant = nouvelEnregistreur()
      await jouer(() => useChangerAccesClaude(), { id: USER, niveau })
      expect(appels(0)[0]).toEqual(['update', colonnes])
    },
  )

  it('useAnonymizeUser : RPC anonymize_user', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [null] })
    await jouer(() => useAnonymizeUser(), USER)
    expect(appels(0)[0]).toEqual(['args', { p_user_id: USER }])
  })

  it('useAssignSite / useUnassignSite : liaison user_sites', async () => {
    enr.courant = nouvelEnregistreur()
    await jouer(() => useAssignSite(), { userId: USER, siteId: SITE })
    expect(appels(0)[0]).toEqual(['insert', { user_id: USER, site_id: SITE }])
    enr.courant = nouvelEnregistreur()
    await jouer(() => useUnassignSite(), { userId: USER, siteId: SITE })
    expect(sequence(enr.courant)).toEqual(['from:user_sites delete'])
    expect(appels(0)).toContainEqual(['eq', 'user_id', USER])
    expect(appels(0)).toContainEqual(['eq', 'site_id', SITE])
  })

  it('useSetUserPassword : Edge Function set_user_password, mot de passe intact, aucune invalidation', async () => {
    invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
    const { invalidations } = await jouer(() => useSetUserPassword(), {
      userId: USER,
      password: ' Secret!2026 ',
    })
    expect(invoke).toHaveBeenCalledWith('set_user_password', {
      body: { user_id: USER, password: ' Secret!2026 ' },
    })
    expect(invalidations).not.toHaveBeenCalled()
  })

  it('useUpdateUserEmail : Edge Function update_user_email, e-mail normalisé', async () => {
    invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
    await jouer(() => useUpdateUserEmail(), {
      userId: USER,
      email: ' A@B.FR ',
    })
    expect(invoke).toHaveBeenCalledWith('update_user_email', {
      body: { user_id: USER, email: 'a@b.fr' },
    })
  })
})
