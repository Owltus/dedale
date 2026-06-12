import { useCallback, useEffect, useMemo, useRef } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { segOfUnique, slugify } from '@/lib/slug'

// API typée de la route SPLAT porteuse du chemin lisible
// (`/bibliotheque/<onglet>/<élément>`, segments slugifiés). Via `getRouteApi`
// (et non un import du module de route) pour ne PAS inverser la dépendance
// features → routes : la route reste la seule à connaître la feature.
const route = getRouteApi('/_app/bibliotheque/$')

/**
 * Navigation à UN niveau portée par le CHEMIN d'URL, pour un onglet de la
 * Bibliothèque : soit la liste (racine), soit un élément ouvert (détail), sous
 * `/bibliotheque/<onglet>/<élément slugifié>` — plus de state ni de search
 * param. Calque le patron de l'onglet Gammes pour les onglets à descente simple
 * (Modèles d'équipements : catégorie → modèles ; Modèles d'opérations :
 * modèle → opérations) : retour navigateur pas-à-pas, liens partageables, et
 * re-clic de l'onglet = retour à la racine (géré par la route).
 *
 * `items` = TOUS les éléments ouvrables, NON filtrés par périmètre, pour que le
 * segment se résolve quel que soit le filtre courant (Commun / site / Tout).
 *
 * GÉNÉRATION (`open`) et RÉSOLUTION (`selected`) sont VOLONTAIREMENT asymétriques :
 * `open` écrit le segment via `segOfUnique` (slug pur, ou suffixé `~<id8>` en cas
 * de collision entre frères au moment du clic), tandis que `selected` RELIT le
 * segment tel qu'il a été écrit plutôt que de recalculer `segOfUnique` sur
 * l'ensemble courant. Recalculer rendrait la résolution dépendante de l'état de
 * collision LIVE : l'apparition/disparition temps réel d'un homonyme parmi les
 * frères ferait basculer le segment attendu et éjecterait l'élément ouvert vers
 * la racine sans action de l'utilisateur. La relecture tolérante évite ce rebond
 * et garde les liens partageables valides dans le temps.
 *
 * RENOMMAGE de l'élément ouvert : son slug change (édition depuis la barre
 * d'onglet, ou réception realtime), donc le segment d'URL ne le résout plus.
 * Plutôt que d'éjecter vers la racine, on RE-SYNCHRONISE l'URL : on mémorise
 * l'`id` du dernier élément résolu et, si le segment cesse de résoudre alors que
 * cet élément existe toujours, on réécrit l'URL (REPLACE, pas une entrée
 * d'historique) sur son slug frais — le détail reste ouvert. S'il a disparu
 * (supprimé), on retombe proprement sur la racine.
 */
export function useBiblioDrill<T extends { id: string; nom: string }>(
  onglet: string,
  items: T[],
): {
  /** Élément ouvert (résolu depuis l'URL), ou `null` à la racine / lien cassé. */
  selected: T | null
  /** Ouvre un élément (PUSH : entrée d'historique). */
  open: (item: T) => void
} {
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  // segments[0] = l'onglet (résolu par la route) ; segments[1] = l'élément ouvert.
  const seg = (_splat ?? '').split('/').filter(Boolean)[1]

  // Relecture TOLÉRANTE du segment (cf. en-tête) : un suffixe `~<id8>` se résout
  // par préfixe d'id (stable même si la collision disparaît ensuite) — le `~` est
  // hors de l'alphabet de `slugify`, donc fiable ; sinon on tente l'id complet
  // (repli « slug vide » de `segOfUnique`) puis le slug du nom (1re
  // correspondance, stable même si une collision apparaît plus tard).
  const selected = useMemo<T | null>(() => {
    if (seg === undefined) return null
    const tilde = seg.lastIndexOf('~')
    if (tilde >= 0) {
      const idPrefix = seg.slice(tilde + 1)
      return items.find((it) => it.id.slice(0, 8) === idPrefix) ?? null
    }
    return (
      items.find((it) => it.id === seg) ??
      items.find((it) => slugify(it.nom) === seg) ??
      null
    )
  }, [seg, items])

  // Identité (id) du dernier élément résolu : socle de la re-synchro sur renommage.
  const lastIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (selected !== null) lastIdRef.current = selected.id
  }, [selected])

  // Segment présent mais non résolu : si l'élément existe encore par id (il a
  // juste été renommé → nouveau slug), on réécrit l'URL sur son slug frais
  // (REPLACE) sans fermer le détail ; s'il a disparu, on laisse retomber à la
  // racine (lien cassé / suppression).
  useEffect(() => {
    if (seg === undefined || selected !== null) return
    const id = lastIdRef.current
    if (id === null) return
    const fresh = items.find((it) => it.id === id)
    if (!fresh) return
    void navigate({
      to: '/bibliotheque/$',
      params: { _splat: `${onglet}/${segOfUnique(fresh, items)}` },
      replace: true,
    })
  }, [seg, selected, items, navigate, onglet])

  const open = useCallback(
    (item: T) => {
      void navigate({
        to: '/bibliotheque/$',
        params: { _splat: `${onglet}/${segOfUnique(item, items)}` },
      })
    },
    [navigate, onglet, items],
  )

  return { selected, open }
}
