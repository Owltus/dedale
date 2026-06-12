import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Vignette carrée d'affichage (pool de miniatures, bucket privé → URL signée).
 * Occupe TOUJOURS un carré constant (image en `object-cover`, ou `fallback`
 * centré sur fond atténué) pour garder des listes alignées. `onError` permet au
 * parent de re-signer l'URL (les URL signées expirent ~1h) en invalidant le pool.
 *
 * Re-signature BORNÉE : on mémorise le « chemin » de la dernière URL en erreur
 * (la partie AVANT `?token=`, stable malgré le renouvellement du JWT). Première
 * erreur d'un chemin → `onError` (cas légitime d'URL expirée). Si le MÊME chemin
 * ré-échoue après re-signature → l'objet Storage est durablement absent : on
 * cesse d'appeler `onError` (pas de boucle) et on bascule sur le `fallback`.
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
  // Chemin de l'objet Storage (avant le token JWT) : stable d'une signature à
  // l'autre, il identifie l'image indépendamment du renouvellement de l'URL.
  const path = url === null ? null : (url.split('?token=')[0] ?? null)
  // Dernier chemin pour lequel on a déjà demandé une re-signature (UNE fois).
  const lastErrorPathRef = useRef<string | null>(null)
  // Chemin définitivement en échec (ré-échoué après re-signature) → fallback.
  const [failedPath, setFailedPath] = useState<string | null>(null)

  function handleError() {
    if (path === null) return
    if (lastErrorPathRef.current === path) {
      // Déjà re-signé puis ré-échoué : l'objet est absent, pas seulement expiré.
      setFailedPath(path)
      return
    }
    // Première erreur de ce chemin : URL probablement expirée → re-signer UNE fois.
    lastErrorPathRef.current = path
    onError?.()
  }

  return (
    <span
      className={cn(
        'bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center overflow-hidden rounded',
        className,
      )}
    >
      {url !== null && failedPath !== path ? (
        <img
          src={url}
          alt={alt ?? ''}
          loading="lazy"
          onError={handleError}
          className="size-full object-cover"
        />
      ) : (
        fallback
      )}
    </span>
  )
}
