import { getRouteApi } from '@tanstack/react-router'
import { lienLocalisations } from './lien-lieu'

// API typée de la route SPLAT `/localisations/<bâtiment>/<niveau>/<lieu>`.
const route = getRouteApi('/_app/localisations/$')

/**
 * Accès brut à la navigation par CHEMIN d'URL de la page Localisations :
 * `/localisations/<bâtiment>/<niveau>/<lieu>` (segments slugifiés, le 3ᵉ ouvre
 * la fiche du lieu). Contrairement à la Bibliothèque/aux Équipements (arbre
 * HOMOGÈNE de `categories`), la localisation est un arbre HÉTÉROGÈNE (tables
 * `batiments`/`niveaux`/`locaux`) : la RÉSOLUTION des segments se fait dans
 * l'explorateur (contre les requêtes de chaque palier). Ce hook ne porte que
 * les segments + la navigation.
 */
export function useLocalisationsDrill(): {
  /** Segments du chemin (0 = racine, [bât], [bât, niveau], [bât, niveau, lieu]). */
  segs: string[]
  /** Navigue vers un chemin (PUSH) : `[]` racine, `[bât]`, `[bât, niveau]`, `[bât, niveau, lieu]`. */
  goTo: (segs: string[]) => void
} {
  // Directive : ce hook n'appelle aucun hook que React Compiler reconnaisse
  // (`route.useX()` ou calcul pur), le compilateur ne l'inférerait donc pas ;
  // on le lui fait compiler pour que ses valeurs gardent leur identité.
  'use memo'
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  const segs = (_splat ?? '').split('/').filter(Boolean)
  const goTo = (next: string[]) => {
    void navigate(lienLocalisations(next))
  }
  return { segs, goTo }
}
