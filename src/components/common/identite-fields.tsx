import { TextField } from './text-field'
import { DescriptionField } from './description-field'
import { MiniatureField } from '@/features/miniatures/components/miniature-field'

interface NomConfig {
  /** Libellé du champ (défaut « Nom »). */
  label?: string
  value: string
  onChange: (value: string) => void
  error?: string
  /** Requis (défaut true : une entité a toujours un nom). */
  required?: boolean
}

interface DescriptionConfig {
  /** Libellé du champ (défaut « Description »). */
  label?: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}

interface ImageConfig {
  value: string | null
  onChange: (id: string | null) => void
  /** Périmètre de l'entité (NULL = commun) : scope des vignettes + cible d'upload. */
  targetSiteId: string | null
  canUpload: boolean
}

interface IdentiteFieldsProps {
  nom: NomConfig
  /** Bloc description (optionnel : certaines entités n'en ont pas). */
  description?: DescriptionConfig
  /** Bloc image (optionnel : omis quand l'entité n'expose pas de vignette). */
  image?: ImageConfig
}

/**
 * En-tête « identité » commun à tous les formulaires d'entité : l'image à GAUCHE
 * (carré, disposition `tile`), le Nom au-dessus de la Description à DROITE. Deux
 * colonnes sur écran large (la hauteur de l'image se cale sur celle du couple
 * Nom + Description, ratio 1:1 conservé → bas alignés), empilé sur mobile. Sans
 * image, le bloc se réduit au Nom + Description pleine largeur. Mutualise l'unique
 * `MiniatureField` → présentation HOMOGÈNE dans toute l'app.
 */
export function IdentiteFields({ nom, description, image }: IdentiteFieldsProps) {
  const champNom = (
    <TextField
      label={nom.label ?? 'Nom'}
      value={nom.value}
      onChange={nom.onChange}
      error={nom.error}
      required={nom.required ?? true}
    />
  )

  // Description via le champ STANDARD de l'app (zone fixe 3 lignes, scrollbar).
  const champDescription = description && (
    <DescriptionField
      label={description.label}
      value={description.value}
      onChange={description.onChange}
      error={description.error}
      required={description.required}
    />
  )

  // Sans image : Nom + Description en pleine largeur (ex. catégorie image masquée).
  if (!image) {
    return (
      <div className="grid gap-4">
        {champNom}
        {champDescription}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
      {/* Conteneur image : sur mobile, carré fixe en haut ; sur écran large, il
          S'ÉTIRE en hauteur sur la colonne de droite (Nom + Description). Il ne
          porte PAS le ratio (sinon conflit étirement/aspect) : c'est l'élément
          INTÉRIEUR qui fait le carré. */}
      <div className="w-32 shrink-0 sm:w-auto sm:min-h-32">
        {/* Carré : sur mobile, piloté par la largeur (w-full) ; sur écran large,
            piloté par la hauteur (h-full du parent étiré) → reste 1:1. */}
        <div className="aspect-square w-full sm:h-full sm:w-auto">
          <MiniatureField
            orientation="tile"
            value={image.value}
            onChange={image.onChange}
            targetSiteId={image.targetSiteId}
            canUpload={image.canUpload}
          />
        </div>
      </div>
      <div className="grid flex-1 content-start gap-4">
        {champNom}
        {champDescription}
      </div>
    </div>
  )
}
