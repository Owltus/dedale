import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Largeur à partir de laquelle le schéma de gauche à droite tient : en
 * dessous, on passe au schéma de haut en bas.
 */
export const LARGEUR_SCHEMA = 960

/**
 * Cadre du schéma (demandes PO du 11/11/2026) : il s'ADAPTE à la place réelle
 * (menu latéral, rotation du téléphone…), mesurée en continu.
 *
 * - Place suffisante (≥ `LARGEUR_SCHEMA`) : la version LARGE, de gauche à
 *   droite, telle quelle, sur toute la hauteur.
 * - Sinon : la version ÉTROITE, de haut en bas, dans un cadre à la hauteur de
 *   l'écran qui DÉFILE verticalement (barre de défilement native, geste
 *   naturel au doigt) — pas de zoom : on n'en a pas besoin (demande PO).
 */
export function ToileSchema({
  large,
  etroit,
}: {
  large: ReactNode
  etroit: ReactNode
}) {
  const cadre = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState<number | null>(null)

  useEffect(() => {
    const c = cadre.current
    if (!c) return
    const observer = new ResizeObserver(() => setLargeur(c.clientWidth))
    observer.observe(c)
    return () => observer.disconnect()
  }, [])

  const etroite = largeur !== null && largeur < LARGEUR_SCHEMA

  return (
    <div
      ref={cadre}
      className={
        etroite
          ? // Cadre à la hauteur de l'écran restant (60 % au moins) : le
            // contenu, posé en absolu, ne l'agrandit pas — on fait défiler le
            // SCHÉMA, pas la page.
            'relative min-h-[60svh] flex-1'
          : 'flex flex-1 flex-col'
      }
    >
      {etroite ? (
        <div className="absolute inset-0 overflow-y-auto overscroll-contain">
          {etroit}
        </div>
      ) : (
        large
      )}
    </div>
  )
}
