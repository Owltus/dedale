import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Un maillon du fil d'Ariane : un libellé d'ANCÊTRE, cliquable (remonte au palier). */
export interface Crumb {
  label: string
  onClick: () => void
}

/**
 * Fil d'Ariane RÉUTILISABLE — source UNIQUE du rendu des ancêtres cliquables,
 * composé au-dessus des primitives shadcn/ui (`@/components/ui/breadcrumb`) pour la
 * sémantique/accessibilité (`<nav><ol>`, séparateurs présentés `aria-hidden`).
 *
 * ⚠️ COMPOSANT PARTAGÉ : le modifier ici change le fil d'Ariane de TOUTES les pages
 * (branché dans `PageHeader`, utilisé partout : pages, fiches, explorateurs à paliers,
 * pages à onglets). Ce n'est JAMAIS spécifique à une page : chaque page fournit ses
 * `items` ; le rendu est ici. Pour changer le fil d'UNE page, on change ses `items`.
 *
 * REPLI ADAPTATIF (tenir dans la largeur, quel que soit le nombre de niveaux) : on
 * n'affiche que le parent IMMÉDIAT (dernier ancêtre) ; tous les ancêtres antérieurs
 * sont repliés derrière un « … » :
 *   - un seul replié → « … » est un lien DIRECT vers lui (pas de menu pour un choix) ;
 *   - plusieurs → « … » ouvre un MENU listant chaque parent, tous cliquables.
 * Ex. `Plan › Transport › Ascenseur › [titre]` → `… › Ascenseur › [titre]` (le « … »
 * déroule Plan + Transport). Un seul ancêtre (liste → détail) est affiché tel quel. Le
 * nœud COURANT n'y figure pas — c'est le titre de la page. Liste vide → rien (racine).
 */
// Anneau de focus CLAVIER cohérent avec le reste de l'app (cf. `ui/button`) :
// on retire l'outline navigateur et on pose le même anneau `ring` visible.
const focusRing =
  'rounded-sm outline-hidden focus-visible:ring-ring/50 focus-visible:ring-[3px]'

export function Breadcrumb({ items }: { items: Crumb[] }) {
  const tail = items.at(-1)
  if (!tail) return null
  // Tous les ancêtres SAUF le parent immédiat → repliés derrière « … » (vide si 1 seul).
  const hidden = items.slice(0, -1)
  const soleHidden = hidden.length === 1 ? hidden[0] : undefined

  return (
    // `flex-nowrap` : le fil reste sur UNE ligne (il tronque, ne passe jamais à la
    // ligne) ; `min-w-0 shrink` pour céder la place au titre quand c'est serré.
    <BreadcrumbRoot className="min-w-0 shrink">
      <BreadcrumbList className="flex-nowrap gap-1.5 sm:gap-1.5">
        {hidden.length > 0 && (
          <>
            <BreadcrumbItem className="shrink-0">
              {soleHidden ? (
                // Un seul parent replié : lien direct (un clic = on y va).
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    onClick={soleHidden.onClick}
                    title={soleHidden.label}
                    aria-label={soleHidden.label}
                    className={`flex items-center ${focusRing}`}
                  >
                    <BreadcrumbEllipsis className="size-4" />
                  </button>
                </BreadcrumbLink>
              ) : (
                // Plusieurs parents repliés : menu déroulant, chacun cliquable.
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={`hover:text-foreground flex items-center ${focusRing}`}
                    aria-label="Afficher les niveaux parents"
                  >
                    <BreadcrumbEllipsis className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {hidden.map((c, i) => (
                      <DropdownMenuItem key={i} onClick={c.onClick}>
                        {c.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator className="shrink-0" />
          </>
        )}

        <BreadcrumbItem className="min-w-0">
          <BreadcrumbLink asChild>
            <button
              type="button"
              onClick={tail.onClick}
              title={tail.label}
              className={`min-w-0 truncate ${focusRing}`}
            >
              {tail.label}
            </button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {/* Séparateur FINAL : relie le fil au titre de la page (rendu hors du <nav>). */}
        <BreadcrumbSeparator className="shrink-0" />
      </BreadcrumbList>
    </BreadcrumbRoot>
  )
}
