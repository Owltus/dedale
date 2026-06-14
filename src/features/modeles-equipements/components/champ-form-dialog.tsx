import { useState } from 'react'
import { CHAMP_TYPES, type Champ, type ChampType } from '@/lib/champs'
import { OptionsEditor } from './options-editor'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { CheckboxField } from '@/components/common/checkbox-field'
import { ChampValeurInput } from '@/components/common/champ-valeur-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function champVide(): Champ {
  return { cle: '', type: 'texte', requis: false, defaut: null }
}

/**
 * Modal d'ajout / d'édition d'UN champ (caractéristique typée) d'un modèle
 * d'équipement. Remplace l'édition inline de toute la liste : chaque champ se
 * crée / se modifie via ce modal, depuis la page de détail du modèle. La
 * persistance (réécriture des `specifications`) est laissée à l'appelant.
 */
export function ChampFormDialog({
  open,
  onOpenChange,
  champ,
  existingCles,
  onSubmit,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Champ à éditer, ou `null` pour un nouveau. */
  champ: Champ | null
  /** Noms (en minuscules) des AUTRES champs, pour refuser un doublon. */
  existingCles: string[]
  onSubmit: (champ: Champ) => void
  pending: boolean
}) {
  const isEdit = champ !== null
  const [value, setValue] = useState<Champ>(() => champ ?? champVide())
  const [error, setError] = useState<string | undefined>(undefined)

  function set(patch: Partial<Champ>) {
    setValue((v) => ({ ...v, ...patch }))
  }

  function handleSubmit() {
    const cle = value.cle.trim()
    if (cle === '') {
      setError('Le nom du champ est obligatoire.')
      return
    }
    if (existingCles.includes(cle.toLowerCase())) {
      setError('Un champ porte déjà ce nom.')
      return
    }
    if (
      value.type === 'liste' &&
      (value.options ?? []).filter((o) => o.trim() !== '').length === 0
    ) {
      setError('Une liste doit avoir au moins une option.')
      return
    }
    setError(undefined)
    onSubmit({ ...value, cle })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le champ' : 'Nouveau champ'}
      description="Une caractéristique typée du modèle (nom, type, valeur par défaut…)."
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Enregistrer' : 'Ajouter'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Nom du champ"
        value={value.cle}
        onChange={(v) => set({ cle: v })}
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Type"
          value={value.type}
          // Changer de type réinitialise la valeur par défaut.
          onChange={(v) => set({ type: v as ChampType, defaut: null })}
        >
          {CHAMP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectField>
        {value.type === 'nombre' && (
          <div className="grid gap-2">
            <Label>Unité</Label>
            <Input
              placeholder="ex. kW, bars"
              value={value.unite ?? ''}
              onChange={(e) => set({ unite: e.target.value || undefined })}
              aria-label="Unité"
            />
          </div>
        )}
      </div>
      {value.type === 'liste' && (
        <OptionsEditor
          value={value.options ?? []}
          onChange={(options) => set({ options })}
        />
      )}
      <ChampValeurInput
        champ={{ ...value, cle: 'Valeur par défaut', requis: false }}
        value={value.defaut}
        onChange={(defaut) => set({ defaut })}
      />
      <CheckboxField
        label="Champ obligatoire"
        value={value.requis}
        onChange={(requis) => set({ requis })}
      />
      {error !== undefined && (
        <p className="text-destructive text-sm">{error}</p>
      )}
    </FormDialog>
  )
}
