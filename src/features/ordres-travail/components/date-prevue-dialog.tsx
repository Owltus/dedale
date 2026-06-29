import { useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormDialog } from '@/components/common/form-dialog'
import { libelleStatutOt } from '../schemas'
import type { Database } from '@/lib/database.types'

type OtOrigine = Database['public']['Enums']['ot_origine']

// Les deux origines, dans l'ordre d'affichage. Le libellé réutilise `libelleStatutOt`
// (source unique : Planifié / Programmé), garanti en phase avec le badge de statut.
const ORIGINES: OtOrigine[] = ['planifie', 'programme']

interface DatePrevueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Date prévue actuelle (ISO `YYYY-MM-DD`), pré-remplie dans le champ. */
  datePrevue: string
  /** Origine actuelle de l'OT (Programmé / Planifié), pré-sélectionnée. */
  origine: OtOrigine
  pending: boolean
  onConfirm: (valeurs: { datePrevue: string; origine: OtOrigine }) => void
}

/**
 * Replanifie un OT : date prévue + bascule de son TYPE (Programmé = généré par le
 * cycle de maintenance préventive / Planifié = date posée par un humain). On bloque
 * la validation tant qu'aucune date n'est saisie. La base valide la bascule d'origine
 * (cf `useUpdateDatePrevueOt`) — et déplacer la date d'un OT « Programmé » le repasse
 * automatiquement en « Planifié » (trigger backend).
 *
 * Date : `<input type="date">` NATIF (composant `Input` stylé) → segments jj/mm/aaaa,
 * flèches ↑↓, masque chiffres, accessible, sans réimplémentation. On masque
 * l'indicateur natif (moche) et on le remplace par un bouton calendrier shadcn propre
 * qui ouvre le SÉLECTEUR NATIF du navigateur via l'API standard `input.showPicker()`.
 * La valeur native est au format `YYYY-MM-DD`, exactement ce qu'attend le modal.
 */
export function DatePrevueDialog({
  open,
  onOpenChange,
  datePrevue,
  origine,
  pending,
  onConfirm,
}: DatePrevueDialogProps) {
  const [valeur, setValeur] = useState(datePrevue)
  const [origineValeur, setOrigineValeur] = useState<OtOrigine>(origine)
  const dateRef = useRef<HTMLInputElement>(null)

  function ouvrirCalendrier() {
    const el = dateRef.current
    if (!el) return
    // showPicker() : ouvre le calendrier NATIF du navigateur (API standard). Repli
    // sur focus si le navigateur ne le supporte pas (au pire : saisie au clavier).
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
      } catch {
        el.focus()
      }
    } else {
      el.focus()
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier la date prévue"
      description="Replanifie cet ordre de travail et ajuste son type (Programmé / Planifié)."
      onSubmit={() => onConfirm({ datePrevue: valeur, origine: origineValeur })}
      submitLabel="Enregistrer"
      pendingLabel="Enregistrement…"
      pending={pending}
      submitDisabled={valeur.trim() === ''}
    >
      {/* Date prévue et Type sur la même ligne, chacune sur la MOITIÉ de la largeur
          du modal (empilées en pleine largeur sous sm — mobile-first). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ot-date-prevue">Date prévue *</Label>
          <div className="relative">
            <Input
              ref={dateRef}
              id="ot-date-prevue"
              type="date"
              aria-label="Date prévue"
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
              // Suit le thème clair/sombre ; on masque l'indicateur natif (remplacé par
              // notre bouton calendrier) et on réserve la place à droite (pr-9).
              className="pr-9 [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
            />
            <button
              type="button"
              onClick={ouvrirCalendrier}
              aria-label="Ouvrir le calendrier"
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 outline-none transition-colors"
            >
              <CalendarDays className="size-4" />
            </button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ot-origine">Type</Label>
          <Select
            id="ot-origine"
            value={origineValeur}
            onChange={(e) => setOrigineValeur(e.target.value as OtOrigine)}
          >
            {ORIGINES.map((o) => (
              <option key={o} value={o}>
                {libelleStatutOt('planifie', o)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="text-muted-foreground space-y-0.5 text-xs">
        <p>« Programmé » : généré automatiquement par le cycle.</p>
        <p>« Planifié » : date posée manuellement.</p>
      </div>
    </FormDialog>
  )
}
