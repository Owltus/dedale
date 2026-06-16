import { useCallback, useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'

// API typée de la route SPLAT `/localisations/<bâtiment>/<niveau>`.
const route = getRouteApi('/_app/localisations/$')

/**
 * Accès brut à la navigation par CHEMIN d'URL de la page Localisations :
 * `/localisations/<bâtiment>/<niveau>` (segments slugifiés). Contrairement à la
 * Bibliothèque/aux Équipements (arbre HOMOGÈNE de `categories`), la localisation
 * est un arbre HÉTÉROGÈNE (tables `batiments`/`niveaux`/`locaux`) : la RÉSOLUTION
 * des segments se fait dans l'explorateur (contre les requêtes de chaque palier).
 * Ce hook ne porte que les segments + la navigation.
 */
export function useLocalisationsDrill(): {
  /** Segments du chemin (0 = racine, [bât], [bât, niveau]). */
  segs: string[]
  /** Navigue vers un chemin (PUSH) : `[]` racine, `[bât]`, `[bât, niveau]`. */
  goTo: (segs: string[]) => void
} {
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  const segs = useMemo(
    () => (_splat ?? '').split('/').filter(Boolean),
    [_splat],
  )
  const goTo = useCallback(
    (next: string[]) => {
      void navigate({
        to: '/localisations/$',
        params: { _splat: next.join('/') },
      })
    },
    [navigate],
  )
  return { segs, goTo }
}
