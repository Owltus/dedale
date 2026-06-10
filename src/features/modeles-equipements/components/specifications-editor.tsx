import { Plus, Trash2 } from 'lucide-react'
import { CHAMP_TYPES, type Champ, type ChampType } from '@/lib/champs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/common/select-field'
import { CheckboxField } from '@/components/common/checkbox-field'
import { ChampValeurInput } from '@/components/common/champ-valeur-input'

interface SpecificationsEditorProps {
  value: Champ[]
  onChange: (champs: Champ[]) => void
  error?: string
}

function champVide(): Champ {
  return { cle: '', type: 'texte', requis: false, defaut: null }
}

// Options d'un champ de type « liste » (liste dynamique de chaînes).
function OptionsEditor({
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
            aria-label="Retirer l'option"
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

/**
 * Éditeur des CHAMPS typés d'un modèle : pour chaque champ, un nom, un type
 * (texte / nombre / date / oui-non / liste), une unité (si nombre), des options
 * (si liste), une valeur par défaut adaptée au type, et un toggle « obligatoire ».
 * L'unicité des noms et le nettoyage sont gérés par le formulaire à la soumission.
 */
export function SpecificationsEditor({
  value,
  onChange,
  error,
}: SpecificationsEditorProps) {
  function update(index: number, patch: Partial<Champ>) {
    onChange(value.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  return (
    <div className="grid gap-2">
      <Label>Caractéristiques (champs)</Label>
      <div className="flex flex-col gap-4">
        {value.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Aucun champ pour le moment.
          </p>
        )}
        {value.map((champ, index) => (
          <div
            key={index}
            className="bg-muted/40 flex flex-col gap-3 rounded-md border p-3"
          >
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nom du champ (ex. Puissance)"
                value={champ.cle}
                onChange={(e) => update(index, { cle: e.target.value })}
                aria-label="Nom du champ"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                aria-label="Retirer le champ"
              >
                <Trash2 />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="Type"
                value={champ.type}
                onChange={(v) =>
                  // Changer de type réinitialise la valeur par défaut.
                  update(index, { type: v as ChampType, defaut: null })
                }
              >
                {CHAMP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </SelectField>
              {champ.type === 'nombre' && (
                <div className="grid gap-2">
                  <Label>Unité</Label>
                  <Input
                    placeholder="ex. kW, bars"
                    value={champ.unite ?? ''}
                    onChange={(e) =>
                      update(index, { unite: e.target.value || undefined })
                    }
                    aria-label="Unité"
                  />
                </div>
              )}
            </div>
            {champ.type === 'liste' && (
              <OptionsEditor
                value={champ.options ?? []}
                onChange={(options) => update(index, { options })}
              />
            )}
            <ChampValeurInput
              champ={{ ...champ, cle: 'Valeur par défaut', requis: false }}
              value={champ.defaut}
              onChange={(defaut) => update(index, { defaut })}
            />
            <CheckboxField
              label="Champ obligatoire"
              value={champ.requis}
              onChange={(requis) => update(index, { requis })}
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...value, champVide()])}
      >
        <Plus /> Ajouter un champ
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
