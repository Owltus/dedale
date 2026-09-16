import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { useSubmitDialog } from './use-submit-dialog'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const succes = vi.mocked(toast.success)
const echec = vi.mocked(toast.error)

/**
 * ORACLES de `useSubmitDialog` (JSDoc du hook + doctrine backend) :
 *  O1. SUCCÈS : la mutation reçoit les données VALIDÉES, toast de succès, puis
 *      fermeture, puis `onSuccess` — dans cet ordre.
 *  O2. ÉCHEC : le dialog RESTE OUVERT (l'utilisateur doit pouvoir corriger), le
 *      message serveur est TRADUIT (SQLSTATE), et la promesse rendue à
 *      `form.handleSubmit` RÉSOUT : un rejet remonterait en promesse non gérée et
 *      laisserait `isSubmitting` dans un état douteux.
 *  O3. L'état de soumission n'est PAS géré ici : le verrou anti-double-envoi est
 *      celui de react-hook-form (`formState.isSubmitting`), le hook ne fait que
 *      la plomberie try/catch.
 */

interface Valeurs {
  nom: string
}
const valeurs: Valeurs = { nom: 'Nouvelle gamme' }

beforeEach(() => {
  succes.mockClear()
  echec.mockClear()
})

describe('useSubmitDialog — succès (O1)', () => {
  it('enchaîne mutation → toast → fermeture → onSuccess', async () => {
    const ordre: string[] = []
    const onSubmit = vi.fn((data: Valeurs) => {
      ordre.push(`submit:${data.nom}`)
      return Promise.resolve({ id: 'gamme-1' })
    })
    succes.mockImplementation(() => {
      ordre.push('toast')
      return 'id-toast'
    })
    const close = vi.fn(() => {
      ordre.push('close')
    })
    const onSuccess = vi.fn(() => {
      ordre.push('onSuccess')
    })

    const { result } = renderHook(() =>
      useSubmitDialog<Valeurs, { id: string }>({
        onSubmit,
        successMessage: 'Gamme créée',
        close,
        onSuccess,
      }),
    )
    await result.current(valeurs)

    expect(onSubmit).toHaveBeenCalledWith(valeurs)
    expect(succes).toHaveBeenCalledWith('Gamme créée')
    expect(onSuccess).toHaveBeenCalledWith({ id: 'gamme-1' })
    expect(ordre).toEqual([
      'submit:Nouvelle gamme',
      'toast',
      'close',
      'onSuccess',
    ])
  })

  it('fabrique le message de succès à partir du résultat de la mutation', async () => {
    const { result } = renderHook(() =>
      useSubmitDialog<Valeurs, { nom: string }>({
        onSubmit: () => Promise.resolve({ nom: 'Ronde hebdo' }),
        successMessage: (r) => `« ${r.nom} » enregistrée`,
        close: vi.fn(),
      }),
    )
    await result.current(valeurs)
    expect(succes).toHaveBeenCalledWith('« Ronde hebdo » enregistrée')
  })
})

describe('useSubmitDialog — échec (O2)', () => {
  it('laisse le dialog ouvert et traduit le refus RLS (42501)', async () => {
    const rls = Object.assign(new Error('permission denied for table'), {
      code: '42501',
    })
    const close = vi.fn()
    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useSubmitDialog<Valeurs>({
        onSubmit: () => Promise.reject(rls),
        successMessage: 'Gamme créée',
        close,
        onSuccess,
      }),
    )

    // O2 : ne rejette pas (sinon promesse non gérée côté RHF).
    await expect(result.current(valeurs)).resolves.toBeUndefined()
    expect(echec).toHaveBeenCalledWith(
      'Action impossible : élément hors de votre périmètre, ou déjà modifié.',
    )
    expect(close).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(succes).not.toHaveBeenCalled()
  })

  it('traduit un doublon (23505) et une contrainte CHECK connue (23514)', async () => {
    const doublon = Object.assign(new Error('duplicate key'), { code: '23505' })
    const check = Object.assign(
      new Error(
        'new row violates check constraint "dates_coherentes" on table "ordres_travail"',
      ),
      { code: '23514' },
    )
    const { result, rerender } = renderHook(
      ({ e }: { e: Error }) =>
        useSubmitDialog<Valeurs>({
          onSubmit: () => Promise.reject(e),
          successMessage: 'Enregistré',
          close: vi.fn(),
        }),
      { initialProps: { e: doublon } },
    )
    await result.current(valeurs)
    expect(echec).toHaveBeenCalledWith('Un élément identique existe déjà.')

    rerender({ e: check })
    await result.current(valeurs)
    // Machine à états : le message métier doit remplacer le jargon Postgres.
    expect(echec).toHaveBeenLastCalledWith(
      'Dates incohérentes : la clôture serait antérieure au démarrage. Corrigez les dates d’exécution des opérations.',
    )
  })

  it('honore un traducteur d’erreur surchargé', async () => {
    const { result } = renderHook(() =>
      useSubmitDialog<Valeurs>({
        onSubmit: () => Promise.reject(new Error('boum')),
        successMessage: 'Enregistré',
        close: vi.fn(),
        errorMessage: () => 'Transition interdite pour ce statut',
      }),
    )
    await result.current(valeurs)
    expect(echec).toHaveBeenCalledWith('Transition interdite pour ce statut')
  })

  it('reste utilisable après un échec (nouvel essai réussi)', async () => {
    let essai = 0
    const close = vi.fn()
    const onSubmit = vi.fn(() => {
      essai += 1
      return essai === 1
        ? Promise.reject(new Error('réseau'))
        : Promise.resolve(null)
    })
    const { result } = renderHook(() =>
      useSubmitDialog<Valeurs>({
        onSubmit,
        successMessage: 'Enregistré',
        close,
      }),
    )
    await result.current(valeurs)
    expect(close).not.toHaveBeenCalled()
    await result.current(valeurs)
    expect(close).toHaveBeenCalledTimes(1)
    expect(succes).toHaveBeenCalledWith('Enregistré')
  })
})

describe('useSubmitDialog — périmètre du hook (O3)', () => {
  it('ne porte AUCUN verrou interne : l’anti-double-envoi est celui de RHF', async () => {
    const onSubmit = vi.fn(() => Promise.resolve(null))
    const { result } = renderHook(() =>
      useSubmitDialog<Valeurs>({
        onSubmit,
        successMessage: 'Enregistré',
        close: vi.fn(),
      }),
    )
    // Contrat explicite du hook : « ne gère NI l'état, NI la validation ». Deux
    // appels = deux écritures — c'est `formState.isSubmitting` qui empêche le
    // second dans l'app, pas ce hook. Test de RÉGRESSION de ce partage des rôles.
    await Promise.all([result.current(valeurs), result.current(valeurs)])
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })
})
