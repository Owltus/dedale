import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import type { Database } from '@/lib/database.types'
import { useUpdateOperationExecution } from './mutations'
import { useOperationsEditor } from './use-operations-editor'

/**
 * Gardes de SAISIE de l'éditeur d'opérations d'un OT. Ce qui est vérifié ici :
 * ce qui part vers la base — un enregistrement refusé n'écrit RIEN, un
 * enregistrement accepté écrit exactement ce que le technicien a saisi.
 *
 * Le hook n'est branché ni au réseau, ni au routeur, ni aux toasts : ces trois
 * dépendances sont remplacées, car aucune ne participe à la décision testée.
 */

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ status: 'idle' }),
}))
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('./mutations', () => ({
  useUpdateOperationExecution: vi.fn(),
}))

/** Arguments observés d'une écriture d'opération (le reste ne nous dit rien). */
interface EcritureOp {
  statut: string
  valeurMesuree: number | null
}

const erreur = vi.mocked(toast.error)
const ecrire = vi.fn<(p: EcritureOp) => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: 'op-1' }),
)
vi.mocked(useUpdateOperationExecution).mockReturnValue({
  mutateAsync: ecrire,
} as unknown as ReturnType<typeof useUpdateOperationExecution>)

beforeEach(() => {
  ecrire.mockClear()
  erreur.mockClear()
})

type OperationExecution =
  Database['public']['Tables']['operations_execution']['Row']
type OtRow = Database['public']['Tables']['ordres_travail']['Row']

/** OT en cours : ni verrouillé, ni rouvert (pas de re-clôture automatique). */
const OT = { id: 'ot-1', statut: 'en_cours' } as OtRow

/**
 * Opération d'exécution minimale. Par défaut une MESURE (elle porte une unité,
 * cf. `estMesureExecution`) en attente et sans valeur relevée.
 */
function op(partiel: Partial<OperationExecution> = {}): OperationExecution {
  return {
    id: 'op-1',
    nom: 'Relevé compteur eau',
    statut: 'en_attente',
    valeur_mesuree: null,
    date_execution: null,
    commentaires: null,
    unite_symbole: 'm³',
    unite_nom: null,
    seuil_minimum: null,
    seuil_maximum: null,
    index_depose: null,
    index_pose: null,
    date_remplacement: null,
    ...partiel,
  } as OperationExecution
}

/** Monte l'éditeur sur une seule opération, puis applique une saisie dessus. */
function editeur(operation: OperationExecution) {
  const { result } = renderHook(() =>
    useOperationsEditor({
      ot: OT,
      otId: OT.id,
      operations: [operation],
      canManage: true,
      onglet: 'operations',
      onRecloturer: vi.fn(),
    }),
  )
  /** Applique une saisie sur l'opération (par-dessus ses valeurs « serveur »). */
  const saisir = (
    saisie: Partial<ReturnType<typeof result.current.opEdit>>,
  ): void => {
    act(() => {
      result.current.setEdits({
        [operation.id]: { ...result.current.opEdit(operation), ...saisie },
      })
    })
  }
  /** Déclenche l'enregistrement groupé (le bouton disquette / Ctrl+S). */
  const enregistrer = async (): Promise<void> => {
    await act(async () => {
      await result.current.saveAllOps()
    })
  }
  return { saisir, enregistrer }
}

describe('useOperationsEditor — une mesure terminée exige sa valeur', () => {
  // ORACLE (5c, D-ter) : une mesure DÉCLARÉE TERMINÉE porte sa valeur. Sans ce
  // garde, `valeur_mesuree` partait à NULL : le relevé s'affichait « fait »,
  // disparaissait des graphiques (`releves/queries.ts` filtre
  // `.not('valeur_mesuree','is',null)`), et personne ne savait laquelle
  // manquait. 20 relevés réels avaient atteint cet état.
  it('refuse d’enregistrer, et n’écrit rien, quand la valeur est vide', async () => {
    const { saisir, enregistrer } = editeur(op())
    saisir({ statut: 'terminee', valeur: '' })
    await enregistrer()

    expect(ecrire).not.toHaveBeenCalled()
    expect(erreur).toHaveBeenCalledWith(
      'Valeur mesurée manquante : Relevé compteur eau',
    )
  })

  // ORACLE : des espaces ne sont pas une valeur — le garde lit la saisie
  // `trim()ée`, comme sa sœur qui refuse une valeur non numérique.
  it('une saisie blanche ne vaut pas une valeur', async () => {
    const { saisir, enregistrer } = editeur(op())
    saisir({ statut: 'terminee', valeur: '   ' })
    await enregistrer()

    expect(ecrire).not.toHaveBeenCalled()
  })

  // ORACLE : le garde ne mord QUE sur « terminee ». « Non applicable » est un
  // état terminal LÉGITIMEMENT sans valeur ; « en cours » ne prétend rien.
  it.each(['non_applicable', 'en_cours'])(
    'laisse passer le statut « %s » sans valeur',
    async (statut) => {
      const { saisir, enregistrer } = editeur(op())
      saisir({ statut, valeur: '' })
      await enregistrer()

      expect(erreur).not.toHaveBeenCalled()
      expect(ecrire).toHaveBeenCalledTimes(1)
      expect(ecrire.mock.calls[0]?.[0]).toMatchObject({
        statut,
        valeurMesuree: null,
      })
    },
  )

  // ORACLE (condition d'entrée de 5c) : les relevés DÉJÀ enregistrés dans cet
  // état — 20 en production, tous sur des OT clôturés donc repris après
  // réouverture — doivent rester REPRENABLES. Le garde ne doit pas produire des
  // opérations qu'on ne peut ni laisser ni corriger : sans la valeur, que
  // personne ne connaît plus, il reste deux sorties, toutes deux terminales ou
  // neutres, et toutes deux acceptées.
  it.each(['non_applicable', 'en_attente'])(
    'un relevé ancien, terminé sans valeur, se reprend en « %s »',
    async (statut) => {
      const ancien = op({ statut: 'terminee', valeur_mesuree: null })
      const { saisir, enregistrer } = editeur(ancien)
      saisir({ statut, valeur: '' })
      await enregistrer()

      expect(erreur).not.toHaveBeenCalled()
      expect(ecrire.mock.calls[0]?.[0]).toMatchObject({
        statut,
        valeurMesuree: null,
      })
    },
  )

  // ORACLE : et il se reprend aussi par la valeur, si elle est retrouvée.
  it('un relevé ancien se reprend aussi en saisissant sa valeur', async () => {
    const ancien = op({ statut: 'terminee', valeur_mesuree: null })
    const { saisir, enregistrer } = editeur(ancien)
    saisir({ valeur: '87' })
    await enregistrer()

    expect(erreur).not.toHaveBeenCalled()
    expect(ecrire.mock.calls[0]?.[0]).toMatchObject({
      statut: 'terminee',
      valeurMesuree: 87,
    })
  })

  // ORACLE : une opération SANS unité ni seuils n'est pas une mesure — la
  // terminer n'appelle aucune valeur (c'est le cas le plus fréquent : une
  // vérification visuelle).
  it('une opération qui n’est pas une mesure se termine sans valeur', async () => {
    const { saisir, enregistrer } = editeur(op({ unite_symbole: null }))
    saisir({ statut: 'terminee', valeur: '' })
    await enregistrer()

    expect(erreur).not.toHaveBeenCalled()
    expect(ecrire).toHaveBeenCalledTimes(1)
  })

  // ORACLE : le même défaut par une autre porte. `Number('Infinity')` n'est pas
  // NaN : la valeur franchissait la garde « non numérique », puis
  // `JSON.stringify(Infinity)` vaut `null` — la mesure repartait terminée SANS
  // valeur, malgré le garde. `Number.isFinite` ferme les deux portes d'un mot,
  // comme le fait déjà `consoOperation`.
  it.each(['Infinity', '-Infinity'])(
    'refuse la valeur « %s », qui repartirait en NULL',
    async (valeur) => {
      const { saisir, enregistrer } = editeur(op())
      saisir({ statut: 'terminee', valeur })
      await enregistrer()

      expect(ecrire).not.toHaveBeenCalled()
      expect(erreur).toHaveBeenCalledWith(
        'Valeur mesurée invalide : Relevé compteur eau',
      )
    },
  )

  // ORACLE : le chemin nominal reste intact — une valeur saisie part en nombre.
  it('une mesure terminée AVEC sa valeur s’enregistre', async () => {
    const { saisir, enregistrer } = editeur(op())
    saisir({ statut: 'terminee', valeur: '1234.5' })
    await enregistrer()

    expect(erreur).not.toHaveBeenCalled()
    expect(ecrire.mock.calls[0]?.[0]).toMatchObject({
      statut: 'terminee',
      valeurMesuree: 1234.5,
    })
  })
})
