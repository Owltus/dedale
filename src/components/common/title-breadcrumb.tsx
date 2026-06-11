import { ChevronRight } from 'lucide-react'

export interface BreadcrumbAncestor {
  /** Clé React stable (id de l'élément, ou « racine »). */
  key: string
  label: string
  onClick: () => void
}

/**
 * Titre « fil d'Ariane » de la barre d'onglet : le segment COURANT fait office
 * de grand titre (`text-2xl`), précédé de ses ancêtres cliquables (petits,
 * atténués, séparés par des chevrons). Tout tronque (`min-w-0` / `truncate`)
 * pour ne jamais déborder sur mobile.
 *
 * Générique : réutilisable par tout onglet de la Bibliothèque via `useTabTitle`
 * (Gammes, Modèles d'équipements, Modèles d'opérations…). Sans ancêtre, rend le
 * seul titre courant — identique au titre par défaut d'un onglet.
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
          aria-label="Fil d'Ariane"
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
              <ChevronRight className="size-4 shrink-0" />
            </span>
          ))}
        </nav>
      )}
      <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
        {current}
      </h1>
    </div>
  )
}
