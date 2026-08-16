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
 * chaque descente. Les écrans SANS en-tête l'appellent eux-mêmes avec leur
 * propre titre — connexion, page introuvable, « aucun site assigné » — sans
 * quoi ils garderaient le titre de l'écran précédent.
 */
export function useDocumentTitle(titrePage?: string): void {
  const { pathname } = useLocation()

  useEffect(() => {
    const section = sectionDeChemin(pathname)
    const segments = [
      APP,
      section,
      // Ni vide, ni redondant avec la section. L'égalité stricte ne suffisait
      // pas : « Investissements (CapEx) » COMMENCE par « Investissements », et
      // l'onglet bégayait « Dédale · Investissements · Investissements (CapEx) ».
      titrePage?.trim() &&
      (section === null || !titrePage.trim().startsWith(section))
        ? titrePage.trim()
        : null,
    ].filter((s): s is string => Boolean(s))

    document.title = segments.join(' · ')
  }, [pathname, titrePage])
}
