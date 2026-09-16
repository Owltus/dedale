import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { useConfirmDelete } from './use-confirm-delete'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const succes = vi.mocked(toast.success)
const echec = vi.mocked(toast.error)

/**
 * ORACLES de `useConfirmDelete` (JSDoc du hook + doctrine backend) :
 *  O1. `demander` ouvre la confirmation, `annuler` la referme sans supprimer.
 *  O2. SUCCÈS : la suppression s'exécute UNE fois, toast de succès, dialog fermé,
 *      `onSuccess` appelé APRÈS.
 *  O3. ÉCHEC : l'état reste COHÉRENT — `pending` retombe à faux (jamais bloqué en
 *      « en cours »), le dialog reste OUVERT pour réessayer, et l'erreur est
 *      remontée TRADUITE (doctrine : un refus RLS 42501 est une erreur à
 *      présenter proprement, pas un plantage).
 *  O4. DOUBLE DÉCLENCHEMENT : l'action ne doit s'exécuter qu'UNE fois (une
 *      suppression n'est pas idempotente côté UX : le 2e appel échoue et affiche
 *      une erreur à l'utilisateur alors que tout s'est bien passé).
 */

interface Site {
  id: string
  nom: string
}
const site: Site = { id: 'site-1', nom: 'Hôtel de ville' }

/** Promesse pilotée depuis le test (pour observer l'état PENDANT l'attente). */
function differee() {
  let resoudre: () => void = () => undefined
  let rejeter: (e: unknown) => void = () => undefined
  const promesse = new Promise<void>((res, rej) => {
    resoudre = () => {
      res()
    }
    rejeter = rej
  })
  return { promesse, resoudre, rejeter }
}

beforeEach(() => {
  succes.mockClear()
  echec.mockClear()
})

describe('useConfirmDelete — ouverture / fermeture (O1)', () => {
  it('demander ouvre le dialog sur l’élément, annuler le referme', () => {
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({
        onDelete: () => Promise.resolve(),
        successMessage: 'Site supprimé',
      }),
    )
    expect(result.current.toDelete).toBeNull()
    expect(result.current.dialogProps.open).toBe(false)

    act(() => {
      result.current.demander(site)
    })
    expect(result.current.toDelete).toBe(site)
    expect(result.current.dialogProps.open).toBe(true)

    act(() => {
      result.current.annuler()
    })
    expect(result.current.toDelete).toBeNull()
    expect(result.current.dialogProps.open).toBe(false)
  })

  it('onOpenChange(false) referme, onOpenChange(true) ne rouvre rien tout seul', () => {
    const onDelete = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({ onDelete, successMessage: 'Site supprimé' }),
    )
    act(() => {
      result.current.demander(site)
    })
    act(() => {
      result.current.dialogProps.onOpenChange(false)
    })
    expect(result.current.toDelete).toBeNull()

    act(() => {
      result.current.dialogProps.onOpenChange(true)
    })
    // O1 : l'ouverture ne s'invente pas d'élément à supprimer.
    expect(result.current.toDelete).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('confirmer sans élément demandé est un no-op', async () => {
    const onDelete = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({ onDelete, successMessage: 'Site supprimé' }),
    )
    await act(async () => {
      result.current.confirmer()
      await Promise.resolve()
    })
    expect(onDelete).not.toHaveBeenCalled()
    expect(succes).not.toHaveBeenCalled()
  })
})

describe('useConfirmDelete — succès (O2)', () => {
  it('supprime une fois, notifie, ferme, puis appelle onSuccess', async () => {
    const ordre: string[] = []
    const onDelete = vi.fn((s: Site) => {
      ordre.push(`delete:${s.id}`)
      return Promise.resolve()
    })
    succes.mockImplementation(() => {
      ordre.push('toast')
      return 'id-toast'
    })
    const onSuccess = vi.fn(() => {
      ordre.push('onSuccess')
    })

    const { result } = renderHook(() =>
      useConfirmDelete<Site>({
        onDelete,
        successMessage: 'Site supprimé',
        onSuccess,
      }),
    )
    act(() => {
      result.current.demander(site)
    })
    await act(async () => {
      result.current.confirmer()
      await Promise.resolve()
    })

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(site)
    expect(succes).toHaveBeenCalledWith('Site supprimé')
    expect(result.current.toDelete).toBeNull()
    expect(result.current.pending).toBe(false)
    // O2 : `onSuccess` (ex. navigation de repli) arrive APRÈS toast et fermeture.
    expect(ordre).toEqual(['delete:site-1', 'toast', 'onSuccess'])
  })

  it('accepte un message de succès contextualisé', async () => {
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({
        onDelete: () => Promise.resolve(),
        successMessage: (s) => `Site « ${s.nom} » supprimé`,
      }),
    )
    act(() => {
      result.current.demander(site)
    })
    await act(async () => {
      result.current.confirmer()
      await Promise.resolve()
    })
    expect(succes).toHaveBeenCalledWith('Site « Hôtel de ville » supprimé')
  })

  it('reste « en cours » pendant l’attente puis retombe (O2)', async () => {
    const { promesse, resoudre } = differee()
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({
        onDelete: () => promesse,
        successMessage: 'Site supprimé',
      }),
    )
    act(() => {
      result.current.demander(site)
    })
    act(() => {
      result.current.confirmer()
    })
    expect(result.current.pending).toBe(true)
    expect(result.current.dialogProps.loading).toBe(true)

    await act(async () => {
      resoudre()
      await promesse
    })
    expect(result.current.pending).toBe(false)
  })
})

describe('useConfirmDelete — échec (O3)', () => {
  it('laisse l’état cohérent, dialog ouvert, message traduit', async () => {
    // 42501 = refus RLS (hors périmètre) : doctrine « à catcher et présenter ».
    const rls = Object.assign(new Error('permission denied'), { code: '42501' })
    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({
        onDelete: () => Promise.reject(rls),
        successMessage: 'Site supprimé',
        onSuccess,
      }),
    )
    act(() => {
      result.current.demander(site)
    })
    await act(async () => {
      result.current.confirmer()
      await Promise.resolve()
    })

    // O3 : pas bloqué en « en cours », dialog encore ouvert, erreur traduite.
    expect(result.current.pending).toBe(false)
    expect(result.current.dialogProps.loading).toBe(false)
    expect(result.current.toDelete).toBe(site)
    expect(result.current.dialogProps.open).toBe(true)
    expect(echec).toHaveBeenCalledWith(
      'Action impossible : élément hors de votre périmètre, ou déjà supprimé.',
    )
    expect(succes).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('traduit 23503 (FK RESTRICT) : conteneur non vide', async () => {
    const fk = Object.assign(new Error('violates foreign key'), {
      code: '23503',
    })
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({
        onDelete: () => Promise.reject(fk),
        successMessage: 'Site supprimé',
      }),
    )
    act(() => {
      result.current.demander(site)
    })
    await act(async () => {
      result.current.confirmer()
      await Promise.resolve()
    })
    expect(echec).toHaveBeenCalledWith(
      'Cet élément est encore lié à d’autres données : dissociez-les d’abord.',
    )
  })

  it('honore un traducteur d’erreur surchargé', async () => {
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({
        onDelete: () => Promise.reject(new Error('boum')),
        successMessage: 'Site supprimé',
        errorMessage: () => 'Message métier maison',
      }),
    )
    act(() => {
      result.current.demander(site)
    })
    await act(async () => {
      result.current.confirmer()
      await Promise.resolve()
    })
    expect(echec).toHaveBeenCalledWith('Message métier maison')
  })

  it('reste réessayable après un échec (O3)', async () => {
    let tentative = 0
    const onDelete = vi.fn(() => {
      tentative += 1
      return tentative === 1
        ? Promise.reject(new Error('réseau'))
        : Promise.resolve()
    })
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({ onDelete, successMessage: 'Site supprimé' }),
    )
    act(() => {
      result.current.demander(site)
    })
    await act(async () => {
      result.current.confirmer()
      await Promise.resolve()
    })
    await act(async () => {
      result.current.confirmer()
      await Promise.resolve()
    })
    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(succes).toHaveBeenCalledWith('Site supprimé')
    expect(result.current.toDelete).toBeNull()
  })
})

describe('useConfirmDelete — double déclenchement (O4)', () => {
  it('ignore un second confirmer pendant l’attente (garde `pending`)', async () => {
    const { promesse, resoudre } = differee()
    const onDelete = vi.fn(() => promesse)
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({ onDelete, successMessage: 'Site supprimé' }),
    )
    act(() => {
      result.current.demander(site)
    })
    act(() => {
      result.current.confirmer()
    })
    // Deuxième clic APRÈS re-rendu (cas réel de deux clics successifs).
    act(() => {
      result.current.confirmer()
    })
    expect(onDelete).toHaveBeenCalledTimes(1)

    await act(async () => {
      resoudre()
      await promesse
    })
  })

  // RÉGRESSION COUVERTE (O4) : la garde lisait `pending` dans la closure du
  // rendu courant (et non une ref), si bien que tant que React n'avait pas
  // re-rendu, les deux appels voyaient `pending === false` et `onDelete` partait
  // DEUX fois. Reproduction réelle : `dialogProps.onConfirm` câblé à la fois sur
  // le clic du bouton et sur le `submit` du formulaire parent (bubbling à
  // travers le portail, piège déjà rencontré sur les FormDialog imbriqués) →
  // double DELETE, dont le second affiche une erreur à l'utilisateur alors que
  // tout s'est bien passé. Le hook garde désormais une `pendingRef` synchrone.
  it('n’exécute l’action qu’une fois si confirmer est appelé deux fois dans le même tick', async () => {
    const { promesse, resoudre } = differee()
    const onDelete = vi.fn(() => promesse)
    const { result } = renderHook(() =>
      useConfirmDelete<Site>({ onDelete, successMessage: 'Site supprimé' }),
    )
    act(() => {
      result.current.demander(site)
    })
    act(() => {
      result.current.confirmer()
      result.current.confirmer()
    })
    expect(onDelete).toHaveBeenCalledTimes(1)

    await act(async () => {
      resoudre()
      await promesse
    })
  })
})
