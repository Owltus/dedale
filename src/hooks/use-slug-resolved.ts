import { useEffect, useRef, useState } from 'react'

/**
 * Résout une entité par son slug d'URL dans une liste, avec REPLI PAR ID.
 *
 * Mémorise l'id ET le slug de la dernière entité résolue ; si CE MÊME slug ne
 * matche plus — cas typique : on RENOMME l'entité ouverte, son slug change sous
 * une URL inchangée — on retombe sur elle par son id et on resynchronise l'URL
 * (`replace`) vers le slug frais, au lieu d'éjecter l'utilisateur vers un écran
 * « introuvable ».
 *
 * GARDE-FOU (même règle que `use-leaf-resync.ts`) : le repli ne vaut QUE pour le
 * slug qui avait résolu. Une navigation vers une AUTRE URL périmée (deep-link,
 * favori, back/forward, entité supprimée hier) rend `null` — donc l'écran
 * « introuvable » — et ne réécrit RIEN. Sans cela l'écran mentirait : il
 * affirmerait, par le seul fait de s'afficher, que le lien reçu désigne la fiche
 * précédemment ouverte.
 *
 * `segOf(item)` DOIT produire le MÊME segment qu'à la génération du lien (mêmes
 * frères → symétrie `segOfUnique`). À appeler INCONDITIONNELLEMENT (passer
 * `items = data ?? []` en attendant le chargement).
 *
 * CONTRAT DES CALLBACKS : `segOf` et `renavigate` sont lus par REF, jamais mis en
 * dépendance de l'effet. La réécriture d'URL est un ÉVÉNEMENT (le slug vient de
 * devenir périmé), pas un effet de chaque rendu : des callbacks recréés à chaque
 * rendu — ce que font les appelants qui referment sur la fratrie fraîche — ne
 * rejouent donc PAS la navigation. Les appelants mémoïsent tout de même ce qu'ils
 * peuvent (`onSlugChange` des routes, `useCallback` sur `navigate`).
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
  // Dernier couple (id, slug) résolu, conservé en ÉTAT (lisible pendant le rendu,
  // contrairement à un ref) pour retomber sur l'entité quand SON slug change.
  const [dernier, setDernier] = useState<{ id: string; slug: string } | null>(
    null,
  )

  // Pattern React « ajuster un state PENDANT le rendu » (https://react.dev/learn/
  // you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes) : pas
  // d'effet (évite un render en cascade), React bascule directement sur la valeur.
  if (bySlug && (bySlug.id !== dernier?.id || slug !== dernier.slug)) {
    setDernier({ id: bySlug.id, slug })
  }

  // Repli : le MÊME segment est devenu irrésolu (l'entité ouverte a été renommée
  // sous nos yeux) → on la garde ouverte. Une navigation vers une AUTRE URL
  // périmée doit rendre « introuvable », pas la fiche précédente.
  const repli = slug === dernier?.slug ? dernier : null
  const resolved =
    bySlug ?? (repli ? (items.find((i) => i.id === repli.id) ?? null) : null)

  // Callbacks lus par ref : leur IDENTITÉ ne doit pas déclencher de navigation
  // (cf. « contrat des callbacks »). L'effet de synchronisation est déclaré AVANT
  // celui de navigation → dans un même commit, la ref est à jour quand il tire.
  const callbacks = useRef({ segOf, renavigate })
  useEffect(() => {
    callbacks.current = { segOf, renavigate }
  })

  useEffect(() => {
    // Slug périmé mais entité retrouvée par id → réécrit l'URL sur le slug frais.
    if (!bySlug && resolved) {
      const { segOf: segFrais, renavigate: naviguer } = callbacks.current
      naviguer(segFrais(resolved))
    }
  }, [bySlug, resolved])

  return resolved
}
