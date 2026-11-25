import { Controller } from 'react-hook-form'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { MiniatureField } from './miniature-field'

interface MiniatureIdentiteFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  /** Périmètre de l'entité (NULL = commun) : scope des vignettes + cible d'upload. */
  targetSiteId: string | null
  canUpload: boolean
}

/**
 * Bloc image de l'en-tête « identité » (`IdentiteFields`, slot `image`) : le
 * `MiniatureField` en tuile, branché sur react-hook-form. Vit dans la feature
 * socle `miniatures` pour que `components/common` n'importe aucun composant de
 * feature : le formulaire l'injecte dans `IdentiteFields`.
 */
export function MiniatureIdentiteField<T extends FieldValues>({
  control,
  name,
  targetSiteId,
  canUpload,
}: MiniatureIdentiteFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <MiniatureField
          orientation="tile"
          value={field.value ?? null}
          onChange={field.onChange}
          targetSiteId={targetSiteId}
          canUpload={canUpload}
        />
      )}
    />
  )
}
