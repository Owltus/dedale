import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ajouterSemaines,
  fenetreSemaines,
  lundiDeLaSemaine,
  type SemaineIso,
} from '@/features/planning/semaines'

/** Pas des flèches / clavier : 4 semaines (~1 mois) par bond — petit pas régulier pour
 *  un défilement doux et lisible, indépendant de la largeur de l'écran. */
const PAS_NAV = 4

export interface FenetreTemporelle {
  /** Semaine placée AU MILIEU de la fenêtre (passé à gauche, futur à droite). */
  centre: Date
  /** Lundi de la 1ʳᵉ semaine visible (centre − moitié de la fenêtre). */
  ancre: Date
  /** Les `nbSemaines` semaines ISO visibles, de l'ancre vers le futur. */
  semaines: SemaineIso[]
  /** Recule le centre d'un bond (`PAS_NAV`). */
  reculer: () => void
  /** Avance le centre d'un bond (`PAS_NAV`). */
  avancer: () => void
  /** Recentre sur la semaine courante. */
  revenirAujourdhui: () => void
  /** Positionne le centre sur une date arbitraire (calé au lundi par l'appelant si besoin). */
  setCentre: (d: Date) => void
}

/**
 * Fenêtre temporelle glissante (centre + dérivés `ancre`/`semaines` + navigation
 * flèches/clavier), factorisée depuis le planning pour être RÉUTILISÉE par le
 * tableau de bord (barres + future frise).
 *
 * ⚠️ UN SEUL listener clavier : le hook installe un `keydown` sur `window`. Si deux
 * consommateurs (barres ET frise) montaient CHACUN leur propre `useFenetreTemporelle`,
 * il y aurait DEUX listeners → double bond (8 semaines au lieu de 4). Règle : le
 * `centre` doit être PARTAGÉ — l'orchestrateur monte le hook UNE fois et passe la
 * `FenetreTemporelle` en props aux enfants ; un enfant ne crée sa propre fenêtre que
 * s'il n'en reçoit pas (mode autonome). Voir `cadran-barres-planning.tsx`.
 *
 * `ancre`/`semaines` dépendent de `nbSemaines` → recentrage automatique au
 * redimensionnement (le nombre de colonnes change, le centre reste fixe).
 */
export function useFenetreTemporelle({
  nbSemaines,
}: {
  nbSemaines: number
}): FenetreTemporelle {
  // Défaut : la semaine courante (lundi de minuit local).
  const [centre, setCentre] = useState(() => lundiDeLaSemaine(new Date()))

  // Ancre = lundi de la 1ʳᵉ semaine visible : on recule de la moitié de la fenêtre
  // pour centrer `centre`. Recentrage automatique au redimensionnement (nbSemaines).
  const ancre = useMemo(
    () => ajouterSemaines(centre, -Math.floor(nbSemaines / 2)),
    [centre, nbSemaines],
  )
  const semaines = useMemo(
    () => fenetreSemaines(ancre, nbSemaines),
    [ancre, nbSemaines],
  )

  // Décalage du centre par les flèches / le clavier (PAS_NAV = 4 s. ≈ 1 mois).
  // `ajouterSemaines` est CALENDAIRE (insensible au changement d'heure, cf. semaines.ts)
  // → le centre reste pile sur le lundi de minuit, même en naviguant très loin.
  const reculer = useCallback(
    () => setCentre((c) => ajouterSemaines(c, -PAS_NAV)),
    [],
  )
  const avancer = useCallback(
    () => setCentre((c) => ajouterSemaines(c, PAS_NAV)),
    [],
  )
  const revenirAujourdhui = useCallback(
    () => setCentre(lundiDeLaSemaine(new Date())),
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      )
        return
      if (e.key === 'ArrowLeft') setCentre((c) => ajouterSemaines(c, -PAS_NAV))
      else if (e.key === 'ArrowRight')
        setCentre((c) => ajouterSemaines(c, PAS_NAV))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return {
    centre,
    ancre,
    semaines,
    reculer,
    avancer,
    revenirAujourdhui,
    setCentre,
  }
}
