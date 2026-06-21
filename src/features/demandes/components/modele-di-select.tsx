import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Check, ChevronsUpDown, FileText } from 'lucide-react'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Modèle de DI tel qu'attendu par le sélecteur (sous-ensemble de la ligne). */
export interface ModeleDiOption {
  id: string
  libelle: string
  constat_modele: string
  miniature_id: string | null
}

interface ModeleDiSelectProps {
  label?: string
  modeles: ModeleDiOption[]
  /** id du modèle sélectionné, ou '' (aucun). */
  value: string
  onChange: (modeleId: string) => void
}

const THUMB = 'size-9 rounded'
const FALLBACK = <FileText className="size-5" />

/**
 * Sélecteur de « problème courant » (modèle de DI) AVEC VIGNETTE : un <select>
 * natif ne sait pas afficher d'image, on construit donc un dropdown custom.
 * Chaque modèle montre sa vignette (`miniature_id` → URL signée via
 * useMiniatureUrls) ou, à défaut, le masque d'image de MiniatureThumb — exactement
 * comme les cards. La liste s'ouvre en DROPDOWN FLOTTANT (surimpression, hauteur
 * bornée + scroll) → n'agrandit pas la modale. Clavier : ↑/↓ + Entrée + Échap.
 */
export function ModeleDiSelect({
  label = 'Problème courant',
  modeles,
  value,
  onChange,
}: ModeleDiSelectProps) {
  const { urlOf, refresh } = useMiniatureUrls()
  const fieldId = useId()
  const boxRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const selected = useMemo(
    () => modeles.find((m) => m.id === value) ?? null,
    [modeles, value],
  )

  // Index 0 = « Aucun », puis chaque modèle (décalé de 1).
  const count = modeles.length + 1
  const selectedIndex = value === '' ? 0 : modeles.findIndex((m) => m.id === value) + 1

  // Clic hors du composant → on referme.
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

  function openMenu() {
    setActive(selectedIndex < 0 ? 0 : selectedIndex)
    setOpen(true)
  }

  function selectIndex(i: number) {
    onChange(i === 0 ? '' : (modeles[i - 1]?.id ?? ''))
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) openMenu()
      else setActive((a) => Math.min(a + 1, count - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (open) setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) selectIndex(active)
      else openMenu()
    }
  }

  return (
    <div className="grid gap-2" ref={boxRef}>
      <Label htmlFor={fieldId}>{label}</Label>

      <div className="relative">
        <button
          id={fieldId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          className={cn(
            'border-input flex min-h-12 w-full items-center gap-2 rounded-md border bg-transparent px-2 py-1.5 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          )}
        >
          {selected ? (
            <>
              <MiniatureThumb
                url={urlOf(selected.miniature_id)}
                fallback={FALLBACK}
                onError={refresh}
                className={THUMB}
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {selected.libelle}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground flex-1">
              Aucun problème courant
            </span>
          )}
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </button>

        {open && (
          <ul
            role="listbox"
            className="bg-card absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border p-1 shadow-md"
          >
            {/* Ligne « Aucun » (index 0) : déselectionne le modèle. */}
            <li role="option" aria-selected={value === ''}>
              <button
                type="button"
                onClick={() => selectIndex(0)}
                onMouseEnter={() => setActive(0)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                  active === 0 && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="text-muted-foreground flex-1">Aucun</span>
                {value === '' && <Check className="size-4 shrink-0" />}
              </button>
            </li>

            {modeles.map((m, k) => {
              const i = k + 1
              const isSelected = m.id === value
              return (
                <li key={m.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => selectIndex(i)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left',
                      active === i && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <MiniatureThumb
                      url={urlOf(m.miniature_id)}
                      fallback={FALLBACK}
                      onError={refresh}
                      className={THUMB}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {m.libelle}
                      </span>
                      {m.constat_modele && (
                        <span className="text-muted-foreground truncate text-xs">
                          {m.constat_modele}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="size-4 shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
