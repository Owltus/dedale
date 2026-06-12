import { ChevronRight } from 'lucide-react'

export interface BreadcrumbAncestor {
  /** Clé React stable (id de l’élément, ou « racine »). */
  key: string
  label: string
  onClick: () => void
}

/**
 * Fil d’Ariane de la barre d’onglet, affiché quand on a DESCENDU dans un onglet
 * (catégorie ouverte, modèle ouvert, gamme ouverte…). DISCRET : tous les segments
 * à la même taille (`text-sm`) ; le segment courant ne se distingue que par le
 * gras et la couleur pleine, les ancêtres étant atténués, cliquables et séparés
 * par des chevrons.
 *
 * La RACINE d’un onglet n’utilise PAS ce composant : le panneau renvoie `null`
 * via `useTabTitle`, et la barre affiche alors le libellé de l’onglet en grand
 * titre (cf. Tabs). Tout tronque (`min-w-0` / `truncate`) pour ne jamais déborder
 * sur mobile.
 *
 * Générique : réutilisable par tout onglet de la Bibliothèque (Gammes, Modèles
 * d’équipements, Modèles d’opérations…).
 */
export function TitleBreadcrumb({
  ancestors,
  current,
}: {
  ancestors: BreadcrumbAncestor[]
  current: string
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      {ancestors.length > 0 && (
        <nav
          aria-label="Fil d’Ariane"
          className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm"
        >
          {ancestors.map((a) => (
            <span key={a.key} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={a.onClick}
                className="hover:text-foreground truncate"
              >
                {a.label}
              </button>
              <ChevronRight className="size-3.5 shrink-0" />
            </span>
          ))}
        </nav>
      )}
      <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight">
        {current}
      </h1>
    </div>
  )
}
