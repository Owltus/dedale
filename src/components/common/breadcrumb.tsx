import { ChevronRight } from 'lucide-react'

/** Un maillon du fil d'Ariane : un libellé d'ANCÊTRE, cliquable (remonte au palier). */
export interface Crumb {
  label: string
  onClick: () => void
}

/**
 * Fil d'Ariane RÉUTILISABLE — source UNIQUE du rendu des ancêtres cliquables.
 *
 * ⚠️ COMPOSANT PARTAGÉ : le modifier ici change le fil d'Ariane de TOUTES les pages
 * (il est branché dans `PageHeader`, lui-même utilisé par toutes les pages, fiches,
 * explorateurs à paliers et pages à onglets). Ce n'est JAMAIS spécifique à une seule
 * page : chaque page ne fournit QUE ses maillons (`items`) ; le rendu, lui, est ici.
 * Pour changer le fil d'UNE seule page, il ne faut PAS toucher ce fichier — il faut
 * changer les `items` passés par cette page.
 *
 * REPLI ADAPTATIF (pour tenir dans la largeur quel que soit le nombre de niveaux) :
 * on n'affiche QUE le parent IMMÉDIAT (dernier ancêtre) ; tous les ancêtres antérieurs
 * sont repliés en un seul « … » cliquable (retour à la RACINE, chemin complet en
 * info-bulle). Exemples : `Plan › Transport › Ascenseur › [titre]` → `… › Ascenseur ›
 * [titre]` ; `Plan › Transport › [titre]` → `… › Transport › [titre]`. Un seul ancêtre
 * (pages liste → détail) est affiché tel quel. Le nœud COURANT n'y figure pas — c'est
 * le titre de la page. Liste vide → rien (page racine).
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const tail = items.at(-1)
  if (!tail) return null
  // Tous les ancêtres SAUF le parent immédiat → repliés sous « … » (vide si 1 seul).
  const hidden = items.slice(0, -1)
  const root = hidden[0]
  return (
    <nav
      aria-label="Fil d’Ariane"
      className="flex min-w-0 shrink items-center gap-1.5"
    >
      {hidden.length > 0 && root && (
        <span className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            // « … » remonte à la RACINE (1er ancêtre) ; info-bulle = chemin replié.
            onClick={root.onClick}
            title={hidden.map((c) => c.label).join(' › ')}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            …
          </button>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </span>
      )}
      <span className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={tail.onClick}
          title={tail.label}
          className="text-muted-foreground hover:text-foreground truncate text-sm"
        >
          {tail.label}
        </button>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
      </span>
    </nav>
  )
}
