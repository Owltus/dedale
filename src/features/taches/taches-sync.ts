import type { TacheEntree } from './components/taches-multiples-field'

/**
 * Calcul (pur) de la synchronisation des tâches d'un parent, partagé par
 * Travaux (`travaux_taches`) et Événements (`evenements_lieux`) : deux tables
 * distinctes en base, même forme, seule la clé étrangère vers le parent
 * change. Les requêtes restent dans les hooks, chacun sur sa table typée (un
 * `.from()` générique sur les deux tables ne se type pas sans cast).
 */

/** Champs communs d'une ligne à insérer, avant clé étrangère et auteur. */
export interface ChampsTache {
  libelle: string
  local_id: string | null
  equipement_id: string | null
  ordre: number
}

/** Tâche existante en base, telle que le formulaire d'édition la connaît. */
export interface TacheExistante {
  id: string
  libelle: string
  local_id: string
  equipement_id: string
}

/** Ligne réellement saisie : libellé ou lieu renseigné. */
function estSaisie(t: TacheEntree) {
  return t.libelle.trim() !== '' || t.local_id !== ''
}

function champs(t: TacheEntree, ordre: number): ChampsTache {
  return {
    libelle: t.libelle.trim() || 'Tâche',
    local_id: t.local_id || null,
    equipement_id: t.equipement_id || null,
    ordre,
  }
}

/**
 * Création : tâches à insérer avec le parent. Une ligne sans libellé NI lieu
 * est ignorée (l'usager a pu ajouter puis abandonner une ligne).
 */
export function tachesACreer(taches: TacheEntree[]): ChampsTache[] {
  return taches.filter(estSaisie).map((t, i) => champs(t, i))
}

/**
 * Édition : DIFF sur `id` (D11, 090) — jamais delete-all/insert-all, qui
 * remettrait chaque tâche conservée à « en attente » (son statut d'avancement
 * n'existe QUE dans sa ligne). L'appelant applique, dans cet ordre et un par
 * un : les retraits, les ajouts (numérotés après les existants), puis les
 * modifications des tâches conservées dont le libellé/lieu/équipement a
 * changé — seuls ces champs bougent, le statut reste intact.
 */
export function diffTaches(taches: TacheEntree[], existants: TacheExistante[]) {
  const existantsParId = new Map(existants.map((e) => [e.id, e]))
  const idsConserves = new Set(
    taches.filter((t) => t.id != null).map((t) => t.id!),
  )

  const aSupprimer = existants
    .filter((e) => !idsConserves.has(e.id))
    .map((e) => e.id)

  const aAjouter = taches
    .filter((t) => estSaisie(t) && t.id == null)
    .map((t, i) => champs(t, existants.length + i))

  const aModifier: {
    id: string
    champs: Pick<ChampsTache, 'libelle' | 'local_id' | 'equipement_id'>
  }[] = []
  for (const t of taches) {
    if (t.id == null) continue
    const existant = existantsParId.get(t.id)
    if (!existant) continue
    const libelle = t.libelle.trim() || 'Tâche'
    const localId = t.local_id || ''
    const equipementId = t.equipement_id || ''
    if (
      existant.libelle !== libelle ||
      existant.local_id !== localId ||
      existant.equipement_id !== equipementId
    ) {
      aModifier.push({
        id: t.id,
        champs: {
          libelle,
          local_id: localId || null,
          equipement_id: equipementId || null,
        },
      })
    }
  }

  return { aSupprimer, aAjouter, aModifier }
}
