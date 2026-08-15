import { Check, Download, ImageOff, ImageUp, Trash2 } from 'lucide-react'
import type { MiniatureWithUrl } from '../queries'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface MiniatureTuileProps {
  miniature: MiniatureWithUrl
  selected: boolean
  // Le rôle peut gérer CETTE vignette (remplacer / supprimer).
  canManage: boolean
  // Nom du site propriétaire, ou null pour le commun.
  siteName: string | null
  // Afficher le badge de périmètre (utile seulement en vue « Tout »).
  showScopeBadge: boolean
  onToggle: (id: string) => void
  onDownload: (m: MiniatureWithUrl) => void
  onReplace: (m: MiniatureWithUrl) => void
  onDelete: (m: MiniatureWithUrl) => void
}

/**
 * Tuile d'une vignette dans la grille du pool. Clic (ou Entrée/Espace) sur la
 * tuile = (dé)sélection ; les boutons au survol (télécharger / remplacer /
 * supprimer) n'altèrent pas la sélection.
 */
export function MiniatureTuile({
  miniature,
  selected,
  canManage,
  siteName,
  showScopeBadge,
  onToggle,
  onDownload,
  onReplace,
  onDelete,
}: MiniatureTuileProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={
        selected ? 'Désélectionner la vignette' : 'Sélectionner la vignette'
      }
      onClick={() => onToggle(miniature.id)}
      onKeyDown={(e) => {
        // N'agir que si la tuile est elle-même la cible : un Entrée/Espace sur
        // le bouton Supprimer interne ne doit pas être détourné vers la
        // (dé)sélection.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(miniature.id)
        }
      }}
      className={cn(
        'group relative min-w-0 cursor-pointer overflow-hidden rounded-lg border transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        selected ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-ring/40',
      )}
    >
      {miniature.url !== null ? (
        <img
          src={miniature.url}
          alt="Vignette"
          className="aspect-square w-full bg-muted object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground">
          <ImageOff className="size-6" />
        </div>
      )}

      {/* Indicateur de sélection discret. */}
      {selected && (
        <div className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <Check className="size-3.5" />
        </div>
      )}

      {/* Badge de périmètre : utile seulement en vue « Tout ». */}
      {showScopeBadge && (
        <div className="absolute right-1 bottom-1 left-1 flex justify-end">
          {miniature.site_id === null ? (
            <Badge variant="secondary">Commun</Badge>
          ) : siteName !== null ? (
            <Badge variant="outline" className="max-w-full truncate">
              {siteName}
            </Badge>
          ) : null}
        </div>
      )}

      {/* Actions au survol (n'altèrent pas la sélection) : télécharger l'image
        (tous les rôles métier), puis — pour les gestionnaires — remplacer
        l'image (répercuté sur toutes les entités liées) et supprimer. */}
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
        <Button
          variant="secondary"
          size="icon"
          className="size-7 pointer-coarse:size-8"
          onClick={(e) => {
            e.stopPropagation()
            onDownload(miniature)
          }}
          aria-label="Télécharger l’image"
          title="Télécharger"
        >
          <Download className="size-4" />
        </Button>
        {canManage && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className="size-7 pointer-coarse:size-8"
              onClick={(e) => {
                e.stopPropagation()
                onReplace(miniature)
              }}
              aria-label="Remplacer l’image"
              title="Remplacer l’image"
            >
              <ImageUp className="size-4" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="size-7 pointer-coarse:size-8"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(miniature)
              }}
              aria-label="Supprimer la vignette"
              title="Supprimer"
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
