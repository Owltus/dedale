import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Éditeur des OPTIONS d'un champ de type « liste » (liste dynamique de chaînes).
 * Réutilisé par le modal d'édition d'un champ (ChampFormDialog). L'unicité et le
 * nettoyage des options sont arbitrés à la soumission (cf. `prepareChamps`).
 */
export function OptionsEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (options: string[]) => void
}) {
  return (
    <div className="grid gap-2">
      <Label>Options de la liste</Label>
      {value.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder={`Option ${String(i + 1)}`}
            value={opt}
            onChange={(e) =>
              onChange(value.map((o, j) => (j === i ? e.target.value : o)))
            }
            aria-label={`Option ${String(i + 1)}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Retirer l’option"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...value, ''])}
      >
        <Plus /> Ajouter une option
      </Button>
    </div>
  )
}
