/**
 * Faux client Supabase qui ENREGISTRE les requêtes au lieu de les envoyer, pour
 * figer le comportement des mutations (tests de gel) : quelles tables, dans quel
 * ordre, avec quelles valeurs — et ce qui se passe quand une étape échoue.
 *
 * Usage (dans un test) :
 *   const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
 *   vi.mock('@/lib/supabase', () => ({ supabase: clientEnregistreur(enr) }))
 *   enr.courant = nouvelEnregistreur({ reponses: [...], echecA: 2 })
 *
 * Chaque requête se termine par `.throwOnError()` (convention du projet) : c'est
 * là qu'elle est « envoyée ». La n-ième requête (1-indexée) peut échouer
 * (`echecA`) ; les réponses sont distribuées dans l'ordre (`reponses`).
 */
export interface RequeteEnregistree {
  /** `from('table')`, `rpc('fonction')` ou `storage.from('bucket')`. */
  cible: string
  /** Appels chaînés : [méthode, ...arguments]. */
  appels: [string, ...unknown[]][]
}

export interface Enregistreur {
  requetes: RequeteEnregistree[]
  reponses: unknown[]
  echecA: number | null
  erreur: { message: string; code: string }
}

export function nouvelEnregistreur(
  options: {
    reponses?: unknown[]
    echecA?: number
    erreur?: { message: string; code: string }
  } = {},
): Enregistreur {
  return {
    requetes: [],
    reponses: options.reponses ?? [],
    echecA: options.echecA ?? null,
    erreur: options.erreur ?? { message: 'échec simulé', code: 'XX000' },
  }
}

/** Le client à renvoyer par `vi.mock('@/lib/supabase', …)`. */
export function clientEnregistreur(porteur: { courant: Enregistreur | null }) {
  const demarrer = (cible: string) => {
    const enr = porteur.courant
    if (!enr) throw new Error('Enregistreur non initialisé')
    const requete: RequeteEnregistree = { cible, appels: [] }
    enr.requetes.push(requete)
    const rang = enr.requetes.length
    const chaine: Record<string, unknown> = new Proxy(
      {},
      {
        get(_c, methode: string) {
          if (methode === 'then') return undefined
          if (methode === 'throwOnError') {
            return () => {
              requete.appels.push(['throwOnError'])
              if (enr.echecA === rang) {
                return Promise.reject(
                  Object.assign(new Error(enr.erreur.message), enr.erreur),
                )
              }
              const data = enr.reponses[rang - 1] ?? null
              return Promise.resolve({ data, error: null })
            }
          }
          return (...args: unknown[]) => {
            requete.appels.push([methode, ...args])
            return chaine
          }
        },
      },
    )
    return chaine
  }
  return {
    from: (table: string) => demarrer(`from:${table}`),
    rpc: (fonction: string, args?: unknown) => {
      const c = demarrer(`rpc:${fonction}`)
      porteur.courant!.requetes.at(-1)!.appels.push(['args', args])
      return c
    },
  }
}

/** Résumé lisible : « from:table insert », pour comparer des séquences. */
export function sequence(enr: Enregistreur): string[] {
  return enr.requetes.map((r) => {
    const verbe = r.appels.find(([m]) =>
      ['insert', 'update', 'delete', 'upsert', 'select', 'args'].includes(m),
    )
    return `${r.cible} ${verbe ? verbe[0] : '?'}`
  })
}
