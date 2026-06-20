import { useEffect, useState } from 'react'

/**
 * Résout une entité par son slug d'URL dans une liste, avec REPLI PAR ID.
 *
 * Mémorise l'id de la dernière entité résolue ; si le slug ne matche plus — cas
 * typique : on RENOMME l'entité ouverte, son slug change — on retombe sur elle
 * par son id et on resynchronise l'URL (`replace`) vers le slug frais, au lieu
 * d'éjecter l'utilisateur vers un écran « introuvable ». Une entité réellement
 * supprimée (id absent de la liste) renvoie bien `null`.
 *
 * `segOf(item)` DOIT produire le MÊME segment qu'à la génération du lien (mêmes
 * frères → symétrie `segOfUnique`). À appeler INCONDITIONNELLEMENT (passer
 * `items = data ?? []` en attendant le chargement).
 *
 * Mutualisé par les fiches détail résolues par slug (investissements, travaux…).
 */
export function useSlugResolved<T extends { id: string }>(
  items: T[],
  slug: string,
  segOf: (item: T) => string,
  renavigate: (freshSlug: string) => void,
): T | null {
  const bySlug = items.find((item) => segOf(item) === slug) ?? null
  // Dernier id résolu, conservé en ÉTAT (lisible pendant le rendu, contrairement
  // à un ref) pour retomber sur l'entité quand son slug change (renommage).
  const [lastId, setLastId] = useState<string | null>(null)

  // Pattern React « ajuster un state PENDANT le rendu » (https://react.dev/learn/
  // you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes) : pas
  // d'effet (évite un render en cascade), React bascule directement sur la valeur.
  if (bySlug && bySlug.id !== lastId) {
    setLastId(bySlug.id)
  }

  // Repli : slug périmé mais l'entité (par id mémorisé) existe encore → on la
  // garde ouverte ; sinon (supprimée / deep-link invalide) → null.
  const resolved =
    bySlug ??
    (lastId !== null ? (items.find((item) => item.id === lastId) ?? null) : null)

  useEffect(() => {
    // Slug périmé mais entité retrouvée par id → réécrit l'URL sur le slug frais.
    if (!bySlug && resolved) renavigate(segOf(resolved))
  }, [bySlug, resolved, segOf, renavigate])

  return resolved
}
