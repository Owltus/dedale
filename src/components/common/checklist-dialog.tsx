import { useMemo, useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchInput } from '@/components/common/search-input'

export interface CheckRowProps {
  /** Titre (ligne principale, tronquée). */
  titre: ReactNode
  /** Sous-titre discret (ligne secondaire, tronquée). Masqué si vide. */
  sousTitre?: ReactNode
  /** Contenu à droite (ex. `<Badge>Commun</Badge>`). */
  badge?: ReactNode
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}

/**
 * Rangée COCHABLE : case à cocher + titre/sous-titre tronqués + badge optionnel.
 * Sous-brique de `ChecklistDialog`, exportée pour les listes cochables sur mesure
 * (invitations, copie de contenu…) qui ne veulent que la ligne, pas la modale.
 */
export function CheckRow({
  titre,
  sousTitre,
  badge,
  checked,
  onToggle,
  disabled,
}: CheckRowProps) {
  return (
    <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="size-4"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{titre}</span>
        {sousTitre != null && sousTitre !== '' && (
          <span className="text-muted-foreground truncate text-xs">
            {sousTitre}
          </span>
        )}
      </span>
      {badge}
    </label>
  )
}

export interface ChecklistItem {
  id: string
  /** Texte du titre (aussi filtré par la recherche). */
  titre: string
  /** Sous-titre affiché + filtré par la recherche. */
  sousTitre?: string
  /** Contenu à droite de la rangée (présentation seule, non filtré). */
  badge?: ReactNode
}

interface ChecklistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Éléments proposés (déjà filtrés « métier » par l'hôte : portée, exclusions…). */
  items: ChecklistItem[]
  /** Ids cochés à l'OUVERTURE (ré-amorcés à chaque passage fermé → ouvert). */
  initialSelected?: readonly string[]
  searchPlaceholder?: string
  /** Libellé du bouton de validation, selon le nombre de cochés (ex. `Lier (3)`). */
  submitLabel: (count: number) => string
  /** Libellé pendant l'envoi (défaut « Enregistrement… »). */
  pendingLabel?: string
  /**
   * Envoi des ids cochés. L'hôte gère ses toasts ; une résolution FERME la
   * modale, une erreur levée la laisse OUVERTE (saisie préservée).
   */
  onSubmit: (ids: string[]) => Promise<unknown>
  /** Envoi en cours (désactive les boutons, affiche `pendingLabel`). */
  pending?: boolean
  /** Exige au moins un coché pour activer la validation (défaut `false`). */
  requireSelection?: boolean
  /** Chargement de la liste : affiche des squelettes à la place. */
  loading?: boolean
  /** État d'erreur de la liste (ex. `<ErrorState onRetry=… />`) : rendu à sa place. */
  error?: ReactNode
  /** Message quand AUCUN élément n'est proposé (défaut « Aucun élément. »). */
  empty?: ReactNode
  /** Message quand la recherche ne matche rien (défaut : `empty`). */
  noResults?: ReactNode
}

/**
 * Modale de MULTI-SÉLECTION cochable avec recherche : en-tête, champ de recherche,
 * liste bornée défilante (squelette / erreur / vide gérés), pied Annuler +
 * validation compteur. Volontairement SANS `<form>` (« Entrée » dans la recherche
 * ne doit pas valider) — d'où une coquille `Dialog` brute plutôt que `FormDialog`.
 * La sélection et la recherche sont réamorcées à chaque ouverture. Construite sur
 * `SearchInput` + `CheckRow`.
 */
export function ChecklistDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  initialSelected = [],
  searchPlaceholder = 'Rechercher…',
  submitLabel,
  pendingLabel = 'Enregistrement…',
  onSubmit,
  pending = false,
  requireSelection = false,
  loading = false,
  error,
  empty = 'Aucun élément.',
  noResults,
}: ChecklistDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected),
  )
  const [search, setSearch] = useState('')

  // Réamorçage à la transition d'OUVERTURE (false → true) : sélection = valeurs
  // initiales, recherche vidée. Pattern « ajuster l'état pendant le rendu » — un
  // refresh de données pendant que la modale est ouverte ne la réinitialise pas.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSelected(new Set(initialSelected))
      setSearch('')
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q === '') return items
    return items.filter(
      (it) =>
        it.titre.toLowerCase().includes(q) ||
        (it.sousTitre ?? '').toLowerCase().includes(q),
    )
  }, [items, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (requireSelection && selected.size === 0) return
    try {
      await onSubmit([...selected])
      onOpenChange(false)
    } catch {
      // Échec géré par l'hôte (toast dans onSubmit) ; on garde la modale ouverte.
    }
  }

  // Corps de la liste bornée : squelette pendant le chargement, nœud d'erreur,
  // message « vide / aucun résultat », sinon les rangées cochables.
  let corps: ReactNode
  if (loading) {
    corps = (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  } else if (error != null) {
    corps = error
  } else if (filtered.length === 0) {
    corps = (
      <p className="text-muted-foreground p-4 text-center text-sm">
        {items.length === 0 ? empty : (noResults ?? empty)}
      </p>
    )
  } else {
    corps = (
      <ul className="divide-y">
        {filtered.map((it) => (
          <li key={it.id}>
            <CheckRow
              titre={it.titre}
              sousTitre={it.sousTitre}
              badge={it.badge}
              checked={selected.has(it.id)}
              onToggle={() => toggle(it.id)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={searchPlaceholder}
        />

        <div className="max-h-72 overflow-y-auto rounded-md border">{corps}</div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending || (requireSelection && selected.size === 0)}
          >
            {pending ? pendingLabel : submitLabel(selected.size)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
