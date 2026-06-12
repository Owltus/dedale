import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Vignette carrée d'affichage (pool de miniatures, bucket privé → URL signée).
 * Occupe TOUJOURS un carré constant (image en `object-cover`, ou `fallback`
 * centré sur fond atténué) pour garder des listes alignées. `onError` permet au
 * parent de re-signer l'URL (les URL signées expirent ~1h) en invalidant le pool.
 */
export function MiniatureThumb({
  url,
  fallback,
  alt,
  onError,
  className,
}: {
  /** URL signée résolue, ou `null` (→ `fallback`). */
  url: string | null
  /** Affiché à défaut d'image (ex. icône de l'entité). */
  fallback?: ReactNode
  alt?: string
  /** Appelé si l'`<img>` échoue (URL signée expirée) → re-signer côté parent. */
  onError?: () => void
  className?: string
}) {
  return (
    <span
      className={cn(
        'bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center overflow-hidden rounded',
        className,
      )}
    >
      {url !== null ? (
        <img
          src={url}
          alt={alt ?? ''}
          loading="lazy"
          onError={onError}
          className="size-full object-cover"
        />
      ) : (
        fallback
      )}
    </span>
  )
}
