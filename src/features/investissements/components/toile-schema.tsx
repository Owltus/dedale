import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'

/**
 * Largeur à partir de laquelle le schéma tient tel quel : en dessous, il
 * passe dans une toile qu'on DÉPLACE et qu'on ZOOME (demande PO du
 * 11/11/2026 — téléphone, beaucoup de devis).
 */
export const LARGEUR_SCHEMA = 960

/** Zoom maximal, en multiple de la taille réelle. */
const ZOOM_MAX = 2.5

/**
 * TOILE du schéma : la pratique éprouvée des cartes et des outils de
 * diagrammes, via `react-zoom-pan-pinch` (3.7, stable).
 *
 * - Place suffisante (≥ `LARGEUR_SCHEMA`) : le schéma s'affiche tel quel,
 *   sur toute la hauteur — rien ne change au bureau.
 * - Place insuffisante : le schéma garde sa largeur naturelle et s'ouvre
 *   AJUSTÉ (on le voit en entier) ; on le déplace au doigt ou à la souris, on
 *   zoome en pinçant (ou Ctrl + molette, pour ne pas voler le défilement de
 *   la page), et trois boutons : zoomer, dézoomer, tout voir.
 *
 * Le clic sur une case reste un clic : seul un vrai glissement déplace.
 */
export function ToileSchema({ children }: { children: ReactNode }) {
  const cadre = useRef<HTMLDivElement>(null)
  const contenu = useRef<HTMLDivElement>(null)
  const toile = useRef<ReactZoomPanPinchRef>(null)
  const [largeur, setLargeur] = useState<number | null>(null)
  const [ajuste, setAjuste] = useState(1)

  // Échelle « tout voir » : le schéma entier dans le cadre, jamais agrandi.
  const calculer = useCallback(() => {
    const c = cadre.current
    const s = contenu.current
    if (!c || !s) return 1
    return Math.min(
      c.clientWidth / s.offsetWidth,
      c.clientHeight / s.offsetHeight,
      1,
    )
  }, [])

  const toutVoir = useCallback(
    (duree = 200) => {
      const c = cadre.current
      const s = contenu.current
      const t = toile.current
      if (!c || !s || !t) return
      const echelle = calculer()
      setAjuste(echelle)
      t.setTransform(
        (c.clientWidth - s.offsetWidth * echelle) / 2,
        (c.clientHeight - s.offsetHeight * echelle) / 2,
        echelle,
        duree,
      )
    },
    [calculer],
  )

  // La largeur RÉELLE du cadre (menu latéral ouvert ou non, rotation du
  // téléphone) décide du mode ; en toile, on se réajuste à chaque changement.
  useEffect(() => {
    const c = cadre.current
    if (!c) return
    const observer = new ResizeObserver(() => {
      setLargeur(c.clientWidth)
      toutVoir(0)
    })
    observer.observe(c)
    return () => observer.disconnect()
  }, [toutVoir])

  const enToile = largeur !== null && largeur < LARGEUR_SCHEMA

  return (
    <div
      ref={cadre}
      className={
        enToile
          ? // Hauteur bornée : la toile reste un CADRE dans la page (60 % de
            // l'écran au moins), le reste de la page défile autour.
            'relative flex min-h-[60svh] flex-1 overflow-hidden'
          : 'flex flex-1 flex-col'
      }
    >
      {enToile ? (
        <TransformWrapper
          ref={toile}
          minScale={Math.min(ajuste, 1)}
          maxScale={ZOOM_MAX}
          initialScale={ajuste}
          limitToBounds={false}
          doubleClick={{ disabled: true }}
          wheel={{ activationKeys: ['Control', 'Meta'] }}
          panning={{ velocityDisabled: true }}
          onInit={() => toutVoir(0)}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
            <div
              ref={contenu}
              className="flex"
              style={{ width: LARGEUR_SCHEMA }}
            >
              {children}
            </div>
          </TransformComponent>
          <div className="absolute top-2 right-2 flex gap-1 rounded-lg border bg-card/90 p-1 shadow-sm backdrop-blur">
            <TooltipIconButton
              icon={<ZoomIn />}
              label="Zoomer"
              variant="ghost"
              onClick={() => toile.current?.zoomIn(0.4)}
            />
            <TooltipIconButton
              icon={<ZoomOut />}
              label="Dézoomer"
              variant="ghost"
              onClick={() => toile.current?.zoomOut(0.4)}
            />
            <TooltipIconButton
              icon={<Maximize />}
              label="Tout voir"
              variant="ghost"
              onClick={() => toutVoir()}
            />
          </div>
          <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-card/80 px-2.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
            Glisse pour te déplacer · pince pour zoomer
          </p>
        </TransformWrapper>
      ) : (
        children
      )}
    </div>
  )
}
