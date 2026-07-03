import { useLayoutEffect, useRef, useState } from 'react'
import { Controller } from 'react-hook-form'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { TextField } from './text-field'
import { DescriptionField } from './description-field'
import { MiniatureField } from '@/features/miniatures/components/miniature-field'

interface ImageConfig<T extends FieldValues> {
  name: FieldPath<T>
  /** Périmètre de l'entité (NULL = commun) : scope des vignettes + cible d'upload. */
  targetSiteId: string | null
  canUpload: boolean
}

interface IdentiteFieldsProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  nomName: FieldPath<T>
  nomLabel?: string
  nomRequired?: boolean
  /** Champ description (optionnel : certaines entités n'en ont pas). */
  descriptionName?: FieldPath<T>
  descriptionLabel?: string
  descriptionRequired?: boolean
  /** Bloc image (optionnel : omis quand l'entité n'expose pas de vignette). */
  image?: ImageConfig<T>
}

/**
 * En-tête « identité » commun aux formulaires d'entité (version react-hook-form) :
 * image à GAUCHE (carré à taille fixe), Nom au-dessus de la Description à DROITE.
 * Deux colonnes sur large, empilé sur mobile. Sans image : Nom + Description pleine
 * largeur. Mutualise l'unique `MiniatureField` → présentation HOMOGÈNE.
 */
export function IdentiteFields<T extends FieldValues>({
  control,
  nomName,
  nomLabel,
  nomRequired,
  descriptionName,
  descriptionLabel,
  descriptionRequired,
  image,
}: IdentiteFieldsProps<T>) {
  const champNom = (
    <TextField
      control={control}
      name={nomName}
      label={nomLabel ?? 'Nom'}
      required={nomRequired ?? true}
    />
  )

  const champDescription = descriptionName != null && (
    <DescriptionField
      control={control}
      name={descriptionName}
      label={descriptionLabel}
      required={descriptionRequired}
    />
  )

  // Hauteur RÉELLE de la colonne Nom + Description, mesurée en direct : on y cale
  // exactement le carré image (bas alignés). Se met à jour si la colonne grandit
  // (ex. message d'erreur), donc l'alignement reste parfait.
  const champsRef = useRef<HTMLDivElement>(null)
  const [tailleImage, setTailleImage] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = champsRef.current
    if (el === null) return
    const mesurer = () => setTailleImage(el.offsetHeight)
    mesurer()
    const observer = new ResizeObserver(mesurer)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!image) {
    return (
      <div className="grid gap-4">
        {champNom}
        {champDescription}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div
        className="aspect-square w-32 shrink-0 sm:w-40"
        style={
          tailleImage !== null
            ? { width: tailleImage, height: tailleImage }
            : undefined
        }
      >
        <Controller
          control={control}
          name={image.name}
          render={({ field }) => (
            <MiniatureField
              orientation="tile"
              value={field.value ?? null}
              onChange={field.onChange}
              targetSiteId={image.targetSiteId}
              canUpload={image.canUpload}
            />
          )}
        />
      </div>
      <div ref={champsRef} className="grid flex-1 content-start gap-4">
        {champNom}
        {champDescription}
      </div>
    </div>
  )
}
