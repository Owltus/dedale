import { useState } from 'react'
import { Pencil, Plus, SlidersHorizontal, Tag, Trash2 } from 'lucide-react'
import { ChampFormDialog } from '@/features/modeles-equipements/components/champ-form-dialog'
import { CHAMP_TYPES, formatChampValeur, type Champ } from '@/lib/champs'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ListRow } from '@/components/common/list-row'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listStack } from '@/lib/responsive'

// Sous-titre lisible d'un champ : type, unité (si nombre), valeur par défaut.
function champResume(c: Champ): string {
  const parts: string[] = [
    CHAMP_TYPES.find((t) => t.value === c.type)?.label ?? c.type,
  ]
  if (c.type === 'nombre' && c.unite) parts.push(c.unite)
  if (c.defaut !== null && c.defaut !== '') {
    parts.push(`défaut : ${formatChampValeur(c, c.defaut)}`)
  }
  return parts.join(' · ')
}

/**
 * Éditeur EN MÉMOIRE d'une liste de caractéristiques (champs) : titre + bouton
 * d'ajout, liste avec édition/suppression au modal (un champ à la fois, via
 * `ChampFormDialog`). N'écrit RIEN : il remonte la liste à jour via `onChange`,
 * l'appelant décide quand persister. Mutualisé entre la création d'une
 * sous-catégorie de parc, son édition en masse, etc.
 */
export function ChampsListEditor({
  champs,
  onChange,
  emptyHint = 'Aucune caractéristique. Ajoute des champs (ex. Puissance, Marque…).',
}: {
  champs: Champ[]
  onChange: (champs: Champ[]) => void
  emptyHint?: string
}) {
  const [champForm, setChampForm] = useState<{
    open: boolean
    champ: Champ | null
  }>({ open: false, champ: null })
  const [toDelete, setToDelete] = useState<Champ | null>(null)

  function handleSubmitChamp(champ: Champ) {
    const original = champForm.champ
    const editing =
      original !== null && champs.some((c) => c.cle === original.cle)
    onChange(
      editing
        ? champs.map((c) => (c.cle === original.cle ? champ : c))
        : [...champs, champ],
    )
    setChampForm({ open: false, champ: null })
  }

  function confirmDelete() {
    if (!toDelete) return
    onChange(champs.filter((c) => c.cle !== toDelete.cle))
    setToDelete(null)
  }

  // Noms des AUTRES champs (refus de doublon dans le modal de champ).
  const existingCles = champs
    .filter((c) => c.cle !== champForm.champ?.cle)
    .map((c) => c.cle.toLowerCase())

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="text-muted-foreground size-4" />
          Caractéristiques
        </span>
        <TooltipIconButton
          icon={<Plus />}
          label="Ajouter un champ"
          onClick={() => setChampForm({ open: true, champ: null })}
        />
      </div>

      {champs.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyHint}</p>
      ) : (
        <div className={listStack}>
          {champs.map((c) => (
            <ListRow
              key={c.cle}
              icon={<Tag className="size-5" />}
              title={c.cle}
              subtitle={champResume(c)}
              hideChevron
              badges={
                c.requis ? <Badge variant="outline">Obligatoire</Badge> : undefined
              }
              onClick={() => setChampForm({ open: true, champ: c })}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Modifier le champ"
                    onClick={() => setChampForm({ open: true, champ: c })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Supprimer le champ"
                    onClick={() => setToDelete(c)}
                  >
                    <Trash2 />
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      <ChampFormDialog
        key={`${champForm.champ?.cle ?? 'new'}-${String(champForm.open)}`}
        open={champForm.open}
        onOpenChange={(o) => setChampForm((f) => ({ ...f, open: o }))}
        champ={champForm.champ}
        existingCles={existingCles}
        onSubmit={handleSubmitChamp}
        pending={false}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null)
        }}
        title="Supprimer le champ ?"
        description={
          toDelete ? `« ${toDelete.cle} » sera retiré du gabarit.` : undefined
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
