import { useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import { sectionDeChemin } from '@/lib/nav'

/** Nom de l'application, en tête de tout titre d'onglet. */
const APP = 'Dédale'

/**
 * Compose le titre de l'onglet du navigateur : `Dédale · Section · Page`.
 *
 * L'onglet affichait « Dédale — GMAO » sur les dix-sept écrans : avec plusieurs
 * onglets ouverts, plus rien ne les distinguait. Il se lit maintenant du général
 * au particulier, comme un fil d'Ariane (ordre choisi par le PO).
 *
 * - `Dédale · Travaux` sur la liste des travaux ;
 * - `Dédale · Travaux · Remplacement copieur Sharp` sur une fiche.
 *
 * La SECTION vient du chemin (source unique `NAV_LABELS`), le dernier segment du
 * titre de la page. Quand les deux coïncident — une page liste, dont le titre EST
 * celui de sa section — le segment n'est pas répété.
 *
 * **Appelé par `PageHeader`**, que porte chaque écran : le titre suit donc
 * automatiquement, y compris dans les explorateurs à paliers où il change à
 * chaque descente. Les rares écrans sans en-tête (connexion) appellent le hook
 * sans argument pour retomber sur « Dédale » seul.
 */
export function useDocumentTitle(titrePage?: string): void {
  const { pathname } = useLocation()

  useEffect(() => {
    const section = sectionDeChemin(pathname)
    const segments = [
      APP,
      section,
      // Ni vide, ni identique à la section (« Travaux · Travaux »).
      titrePage?.trim() && titrePage.trim() !== section
        ? titrePage.trim()
        : null,
    ].filter((s): s is string => Boolean(s))

    document.title = segments.join(' · ')
  }, [pathname, titrePage])
}
