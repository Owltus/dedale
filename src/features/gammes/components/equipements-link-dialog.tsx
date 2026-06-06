import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { useSyncGammeEquipements } from '../mutations'
import { equipementsQueries } from '@/features/equipements/queries'
import { errorMessage } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface EquipementsLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  gammeId: string
  /** Ids des équipements actuellement liés (état de référence pour le diff). */
  current: string[]
}

export function EquipementsLinkDialog({
  open,
  onOpenChange,
  siteId,
  gammeId,
  current,
}: EquipementsLinkDialogProps) {
  const sync = useSyncGammeEquipements()
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))
  const [selected, setSelected] = useState<Set<string>>(() => new Set(current))
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return equipements
    return equipements.filter(
      (e) =>
        (e.nom ?? '').toLowerCase().includes(q) ||
        (e.code_inventaire ?? '').toLowerCase().includes(q),
    )
  }, [equipements, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    try {
      await sync.mutateAsync({
        gammeId,
        current,
        selected: [...selected],
      })
      toast.success('Équipements liés mis à jour')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  // Volontairement PAS de <FormDialog> ici : ce dialog n'a pas de <form> (case
  // à cocher multiple + champ de recherche libre). L'enrober dans le <form> de
  // FormDialog ferait que « Entrée » dans la recherche déclencherait la mutation.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lier des équipements</DialogTitle>
          <DialogDescription>
            Coche les équipements du site concernés par cette gamme.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou code…"
            className="pl-8"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">
              Aucun équipement.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((e) => {
                const id = e.id ?? ''
                const checked = selected.has(id)
                return (
                  <li key={id}>
                    <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(id)}
                        className="size-4"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{e.nom}</span>
                        {e.code_inventaire && (
                          <span className="text-muted-foreground truncate text-xs">
                            {e.code_inventaire}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sync.isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={sync.isPending}
          >
            {sync.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
