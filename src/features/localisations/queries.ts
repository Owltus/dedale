import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const localisationsQueries = {
  all: () => ['localisations'] as const,

  /** Bâtiments actifs d'un site. */
  batiments: (siteId: string | null) =>
    queryOptions({
      queryKey: [...localisationsQueries.all(), 'batiments', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('batiments')
          .select('*')
          .eq('site_id', siteId!)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Niveaux actifs d'un bâtiment. */
  niveaux: (batimentId: string | null) =>
    queryOptions({
      queryKey: [...localisationsQueries.all(), 'niveaux', batimentId] as const,
      enabled: batimentId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('niveaux')
          .select('*')
          .eq('batiment_id', batimentId!)
          .order('ordre')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Locaux actifs d'un niveau. */
  locaux: (niveauId: string | null) =>
    queryOptions({
      queryKey: [...localisationsQueries.all(), 'locaux', niveauId] as const,
      enabled: niveauId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('locaux')
          .select('*')
          .eq('niveau_id', niveauId!)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Surface roulée par bâtiment du site (somme des locaux). */
  batimentsSurface: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...localisationsQueries.all(),
        'batiments-surface',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_batiments_surface')
          .select('batiment_id, surface_m2, surface_chauffee_m2')
          .eq('site_id', siteId!)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Surface roulée par niveau d'un bâtiment (somme des locaux). */
  niveauxSurface: (batimentId: string | null) =>
    queryOptions({
      queryKey: [
        ...localisationsQueries.all(),
        'niveaux-surface',
        batimentId,
      ] as const,
      enabled: batimentId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_niveaux_surface')
          .select('niveau_id, surface_m2, surface_chauffee_m2')
          .eq('batiment_id', batimentId!)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Types de locaux actifs (référentiel global), pour le dropdown. */
  typesLocaux: () =>
    queryOptions({
      queryKey: [...localisationsQueries.all(), 'types-locaux'] as const,
      staleTime: 5 * 60_000,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('types_locaux')
          .select('*')
          .eq('actif', true)
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Enfants BLOQUANTS d'une entité avant suppression (FK RESTRICT) : niveaux
   * d'un bâtiment, locaux d'un niveau, équipements d'un local. Sert à EXPLIQUER
   * en amont pourquoi la suppression est refusée (nombre + noms) plutôt que de
   * laisser la base renvoyer une erreur opaque. `null` = aucune cible → désactivée.
   * `staleTime: 0` → re-vérifie à chaque ouverture (l'utilisateur a pu vider
   * l'entité entre deux essais).
   */
  blockingChildren: (target: DeleteTarget | null) =>
    queryOptions({
      queryKey: [
        ...localisationsQueries.all(),
        'blocking',
        target?.kind ?? null,
        target?.id ?? null,
      ] as const,
      enabled: target !== null,
      staleTime: 0,
      queryFn: ({ signal }) => fetchBlockingChildren(target!, signal),
    }),

  /**
   * Liens d'un local supprimés EN CASCADE à sa suppression (DI, tâches de
   * travaux, documents) : ils ne BLOQUENT pas mais sont retirés silencieusement
   * → on les compte pour avertir. `null` = cible non-local → désactivée.
   */
  localCascade: (localId: string | null) =>
    queryOptions({
      queryKey: [
        ...localisationsQueries.all(),
        'local-cascade',
        localId,
      ] as const,
      enabled: localId !== null,
      staleTime: 0,
      queryFn: ({ signal }) => fetchLocalCascadeLinks(localId!, signal),
    }),
}

// --- Blocage de suppression (FK RESTRICT dans la hiérarchie des lieux) ---

export type DeleteKind = 'batiment' | 'niveau' | 'local'
export interface DeleteTarget {
  kind: DeleteKind
  id: string
}

const CONTAINER_NOUN: Record<DeleteKind, string> = {
  batiment: 'bâtiment',
  niveau: 'niveau',
  local: 'local',
}
const CHILD_NOUN: Record<DeleteKind, { sing: string; plur: string }> = {
  batiment: { sing: 'niveau', plur: 'niveaux' },
  niveau: { sing: 'local', plur: 'locaux' },
  local: { sing: 'équipement', plur: 'équipements' },
}

function toBlocking(data: { nom: string }[] | null) {
  const names = (data ?? []).map((r) => r.nom)
  return { count: names.length, names }
}

/**
 * Compte et NOMME les enfants qui empêchent la suppression d'une entité de la
 * hiérarchie des lieux (relations en `ON DELETE RESTRICT`). Le local n'est PAS
 * une feuille : `equipements.local_id` est RESTRICT. Charge la colonne `nom`
 * seule (charge utile minime) — la liste, tronquée à l'affichage, répond au
 * « mais quoi ? ». Utilisé par la confirmation (en amont) ET par les mutations
 * (filet de sécurité). La base reste l'arbitre réel.
 */
export async function fetchBlockingChildren(
  target: DeleteTarget,
  signal?: AbortSignal,
): Promise<{ count: number; names: string[] }> {
  switch (target.kind) {
    case 'batiment': {
      const q = supabase
        .from('niveaux')
        .select('nom')
        .eq('batiment_id', target.id)
        .order('nom')
      const { data } = await (signal ? q.abortSignal(signal) : q).throwOnError()
      return toBlocking(data)
    }
    case 'niveau': {
      const q = supabase
        .from('locaux')
        .select('nom')
        .eq('niveau_id', target.id)
        .order('nom')
      const { data } = await (signal ? q.abortSignal(signal) : q).throwOnError()
      return toBlocking(data)
    }
    case 'local': {
      const q = supabase
        .from('equipements')
        .select('nom')
        .eq('local_id', target.id)
        .order('nom')
      const { data } = await (signal ? q.abortSignal(signal) : q).throwOnError()
      return toBlocking(data)
    }
  }
}

/** Phrase de blocage : « Ce niveau contient 3 locaux. Vide-le d'abord… ». */
export function blockingReason(kind: DeleteKind, count: number): string {
  const noun = count > 1 ? CHILD_NOUN[kind].plur : CHILD_NOUN[kind].sing
  return `Ce ${CONTAINER_NOUN[kind]} contient ${String(count)} ${noun}. Vide-le d’abord pour pouvoir le supprimer.`
}

/** Titre de la liste des enfants bloquants : « Locaux à supprimer d'abord : ». */
export function blockingListTitle(kind: DeleteKind, count: number): string {
  const noun = count > 1 ? CHILD_NOUN[kind].plur : CHILD_NOUN[kind].sing
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} à supprimer d’abord :`
}

// --- Liens supprimés en CASCADE à la suppression d'un local (non bloquants) ---

export interface LocalCascadeLinks {
  di: number
  travaux: number
  documents: number
}

/**
 * Compte les liens d'un local retirés EN CASCADE à sa suppression (le local
 * lui-même n'est pas bloqué par eux) : demandes d'intervention, tâches de
 * travaux, documents rattachés. Sert à AVERTIR — les entités liées (DI, travaux,
 * documents) sont conservées, seuls les liens au local disparaissent.
 */
export async function fetchLocalCascadeLinks(
  localId: string,
  signal?: AbortSignal,
): Promise<LocalCascadeLinks> {
  const di = supabase
    .from('di_localisations')
    .select('local_id', { count: 'exact', head: true })
    .eq('local_id', localId)
  const travaux = supabase
    .from('travaux_taches')
    .select('local_id', { count: 'exact', head: true })
    .eq('local_id', localId)
  const documents = supabase
    .from('documents_locaux')
    .select('local_id', { count: 'exact', head: true })
    .eq('local_id', localId)
  const [r1, r2, r3] = await Promise.all([
    (signal ? di.abortSignal(signal) : di).throwOnError(),
    (signal ? travaux.abortSignal(signal) : travaux).throwOnError(),
    (signal ? documents.abortSignal(signal) : documents).throwOnError(),
  ])
  return {
    di: r1.count ?? 0,
    travaux: r2.count ?? 0,
    documents: r3.count ?? 0,
  }
}

function joinFr(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1] ?? ''}`
}

/**
 * Phrase d'avertissement de détachement en cascade d'un local (liens retirés,
 * entités conservées). `null` si aucun lien → on garde l'avertissement par défaut.
 */
export function localCascadeWarning(links: LocalCascadeLinks): string | null {
  const parts: string[] = []
  if (links.di > 0)
    parts.push(
      `${String(links.di)} demande${links.di > 1 ? 's' : ''} d’intervention`,
    )
  if (links.travaux > 0)
    parts.push(
      `${String(links.travaux)} tâche${links.travaux > 1 ? 's' : ''} de travaux`,
    )
  if (links.documents > 0)
    parts.push(`${String(links.documents)} document${links.documents > 1 ? 's' : ''}`)
  if (parts.length === 0) return null
  return `Ce local est référencé par ${joinFr(parts)} : ces liens seront retirés (les éléments eux-mêmes sont conservés).`
}
