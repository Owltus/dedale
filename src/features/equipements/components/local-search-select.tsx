import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Search, X } from 'lucide-react'
import { equipementsQueries } from '../queries'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Normalise pour une recherche TOLÉRANTE aux accents et à la casse. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Contexte hiérarchique « Bâtiment › Niveau » (sans le local), dans cet ORDRE.
 * Le bâtiment n'est mentionné que si le site en compte PLUSIEURS (`multiBatiment`)
 * — inutile de répéter l'unique bâtiment partout.
 */
function contextOf(
  l: { batiment_nom: string | null; niveau_nom: string | null },
  multiBatiment: boolean,
): string {
  return [multiBatiment ? l.batiment_nom : null, l.niveau_nom]
    .filter(Boolean)
    .join(' › ')
}

interface LocalSearchSelectProps {
  siteId: string
  /** `local_id` sélectionné, ou '' si aucun. */
  value: string
  onChange: (localId: string) => void
  label?: string
  required?: boolean
  error?: string
}

const MAX_SUGGESTIONS = 8

/**
 * Sélecteur de LIEU par RECHERCHE INTUITIVE (combobox) : on tape quelques lettres
 * du nom de la pièce → suggestions filtrées. Chaque ligne affiche le chemin dans
 * l'ordre « Bâtiment › Niveau » au-dessus du local, pour lever les homonymes
 * (plusieurs « Couloir » sur des niveaux différents). Le bâtiment est omis si le
 * site n'en a qu'UN. Pensé pour des utilisateurs non techniciens : pas besoin de
 * connaître la hiérarchie, on tape ce qu'on connaît.
 *
 * Une fois choisi, le champ AFFICHE « Bâtiment › Niveau › Local » (même ordre) :
 * le contexte reste visible SANS ligne supplémentaire sous le champ → la modale
 * ne grandit pas. Re-focus = sélection de tout le texte (onFocus) → retaper
 * repart d'une recherche propre. La liste s'ouvre en DROPDOWN FLOTTANT.
 */
export function LocalSearchSelect({
  siteId,
  value,
  onChange,
  label = 'Lieu',
  required = false,
  error,
}: LocalSearchSelectProps) {
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  const fieldId = useId()
  const boxRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  // Le site a-t-il PLUSIEURS bâtiments ? Sinon on n'affiche pas le bâtiment.
  const multiBatiment = useMemo(
    () => new Set(locaux.map((l) => l.batiment_id)).size > 1,
    [locaux],
  )

  // Valeur posée DE L'EXTÉRIEUR (pré-remplissage en édition) : le champ n'affiche
  // que `query`, on l'amorce donc UNE FOIS depuis le local déjà sélectionné —
  // sinon un lieu pourtant choisi apparaîtrait vide. (À la création, value='' →
  // jamais déclenché ; après un `pick`, query≠'' → idem.)
  const [seeded, setSeeded] = useState(false)
  if (!seeded && query === '' && value !== '' && locaux.length > 0) {
    const l = locaux.find((x) => x.local_id === value)
    if (l) {
      setSeeded(true)
      const ctx = contextOf(l, multiBatiment)
      const nom = l.local_nom ?? ''
      setQuery(ctx ? `${ctx} › ${nom}` : nom)
    }
  }

  // Suggestions : nom du local OU chemin contiennent la saisie (normalisée).
  const suggestions = useMemo(() => {
    const q = normalize(query.trim())
    if (q === '') return []
    return locaux
      .filter((l) => {
        const ctx = [l.batiment_nom, l.niveau_nom].filter(Boolean).join(' ')
        return normalize(`${l.local_nom ?? ''} ${ctx}`).includes(q)
      })
      .slice(0, MAX_SUGGESTIONS)
  }, [locaux, query])

  // Clic hors du composant → on referme la liste.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Sélection : on replie « Bâtiment › Niveau › Local » DANS le champ (pas de
  // ligne de confirmation en dessous → la modale ne grandit pas).
  function pick(l: (typeof locaux)[number]) {
    const ctx = contextOf(l, multiBatiment)
    const nom = l.local_nom ?? ''
    onChange(l.local_id ?? '')
    setQuery(ctx ? `${ctx} › ${nom}` : nom)
    setOpen(false)
  }

  function handleInput(text: string) {
    setQuery(text)
    setActive(0)
    setOpen(true)
    // Re-recherche → on déselectionne le lieu précédent.
    if (value !== '') onChange('')
  }

  function clear() {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const s = suggestions[active]
      if (s) pick(s)
    }
  }

  const showClear = query !== '' || value !== ''
  const showList = open && query.trim() !== ''
  // Loupe en recherche, épingle une fois un lieu choisi (repère visuel).
  const LeftIcon = value !== '' ? MapPin : Search

  return (
    <div className="grid gap-2" ref={boxRef}>
      <Label htmlFor={fieldId}>
        {label}
        {required ? ' *' : ''}
      </Label>

      <div className="relative">
        <LeftIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          id={fieldId}
          value={query}
          placeholder="Rechercher une pièce…"
          autoComplete="off"
          className="px-9"
          aria-invalid={error ? true : undefined}
          // Re-focus d'un lieu déjà choisi : tout sélectionner → retaper repart
          // d'une recherche vierge sans devoir effacer à la main.
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {showClear && (
          <button
            type="button"
            aria-label="Effacer le lieu"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
          >
            <X className="size-4" />
          </button>
        )}

        {/* Dropdown FLOTTANT : en surimpression (absolute), hauteur bornée + scroll
            interne → n'agrandit jamais la modale. */}
        {showList && (
          <div className="bg-card absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border p-1 shadow-md">
            {suggestions.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">
                Aucun résultat.
              </p>
            ) : (
              suggestions.map((l, i) => {
                const ctx = contextOf(l, multiBatiment)
                return (
                  <button
                    key={l.local_id ?? ''}
                    type="button"
                    // mousedown avant le blur : évite que le clic-extérieur ferme
                    // la liste avant que le clic n'aboutisse.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(l)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left',
                      i === active && 'bg-accent text-accent-foreground',
                    )}
                  >
                    {/* Ordre Bâtiment › Niveau AU-DESSUS du local. */}
                    {ctx && (
                      <span className="text-muted-foreground text-xs">
                        {ctx}
                      </span>
                    )}
                    <span className="text-sm font-medium">{l.local_nom}</span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
