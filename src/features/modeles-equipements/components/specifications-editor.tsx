import { Plus, Trash2 } from 'lucide-react'
import type { SpecLine } from '../schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SpecificationsEditorProps {
  value: SpecLine[]
  onChange: (lines: SpecLine[]) => void
  error?: string
}

/**
 * Éditeur clé/valeur des caractéristiques d'un modèle. Lignes ajoutables et
 * supprimables ; la conversion en objet JSON (et l'unicité des clés) est gérée
 * par le formulaire appelant à la soumission.
 */
export function SpecificationsEditor({
  value,
  onChange,
  error,
}: SpecificationsEditorProps) {
  function update(index: number, key: keyof SpecLine, next: string) {
    onChange(
      value.map((line, i) => (i === index ? { ...line, [key]: next } : line)),
    )
  }

  return (
    <div className="grid gap-2">
      <Label>Caractéristiques</Label>
      <div className="flex flex-col gap-2">
        {value.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Aucune caractéristique pour le moment.
          </p>
        )}
        {value.map((line, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder="Caractéristique"
              value={line.cle}
              onChange={(e) => update(index, 'cle', e.target.value)}
              aria-label={`Caractéristique ${String(index + 1)} — clé`}
            />
            <Input
              placeholder="Valeur"
              value={line.valeur}
              onChange={(e) => update(index, 'valeur', e.target.value)}
              aria-label={`Caractéristique ${String(index + 1)} — valeur`}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              aria-label="Retirer la caractéristique"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...value, { cle: '', valeur: '' }])}
      >
        <Plus /> Ajouter une caractéristique
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
