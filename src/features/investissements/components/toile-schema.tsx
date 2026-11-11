import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'

/**
 * Largeur à partir de laquelle le schéma de gauche à droite tient : en
 * dessous, on passe au schéma de haut en bas dans une toile navigable.
 */
export const LARGEUR_SCHEMA = 960

/**
 * Largeur minimale du schéma de haut en bas : ses trois cases de décision
 * restent lisibles ; sur un écran plus étroit, la toile le réduit et on zoome.
 */
const LARGEUR_ETROITE_MIN = 420

/** Zoom maximal, en multiple de la taille réelle. */
const ZOOM_MAX = 2.5

/**
 * TOILE du schéma (demandes PO du 11/11/2026) : il s'ADAPTE à la place
 * réelle du cadre (menu latéral, rotation du téléphone…).
 *
 * - Place suffisante (≥ `LARGEUR_SCHEMA`) : la version LARGE, de gauche à
 *   droite, telle quelle, sur toute la hauteur.
 * - Sinon : la version ÉTROITE, de haut en bas, dans une toile qu'on
 *   DÉPLACE et qu'on ZOOME — la pratique éprouvée des cartes et des outils de
 *   diagrammes, via `react-zoom-pan-pinch` (3.7, stable). Elle s'ouvre en haut,
 *   à la largeur de l'écran ; on glisse au doigt ou à la souris, on pince (ou
 *   Ctrl + molette, pour ne pas voler le défilement de la page) ; boutons
 *   zoomer, dézoomer, tout voir.
 *
 * Le clic sur une case reste un clic : seul un vrai glissement déplace.
 */
export function ToileSchema({
  large,
  etroit,
}: {
  large: ReactNode
  etroit: ReactNode
}) {
  const cadre = useRef<HTMLDivElement>(null)
  const contenu = useRef<HTMLDivElement>(null)
  const toile = useRef<ReactZoomPanPinchRef>(null)
  const [largeur, setLargeur] = useState<number | null>(null)
  const [echelleMin, setEchelleMin] = useState(1)

  const enToile = largeur !== null && largeur < LARGEUR_SCHEMA
  const largeurContenu = Math.max(largeur ?? 0, LARGEUR_ETROITE_MIN)

  /** Vue d'ouverture : en haut, à la largeur du cadre. */
  const vueDeDepart = useCallback((duree = 0) => {
    const c = cadre.current
    const s = contenu.current
    const t = toile.current
    if (!c || !s || !t) return
    const echelle = Math.min(c.clientWidth / s.offsetWidth, 1)
    setEchelleMin(Math.min(echelle, c.clientHeight / s.offsetHeight, 1))
    t.setTransform(
      (c.clientWidth - s.offsetWidth * echelle) / 2,
      0,
      echelle,
      duree,
    )
  }, [])

  /** « Tout voir » : le schéma entier dans le cadre, centré. */
  const toutVoir = useCallback(() => {
    const c = cadre.current
    const s = contenu.current
    const t = toile.current
    if (!c || !s || !t) return
    const echelle = Math.min(
      c.clientWidth / s.offsetWidth,
      c.clientHeight / s.offsetHeight,
      1,
    )
    t.setTransform(
      (c.clientWidth - s.offsetWidth * echelle) / 2,
      (c.clientHeight - s.offsetHeight * echelle) / 2,
      echelle,
      200,
    )
  }, [])

  // La largeur RÉELLE du cadre décide de la version ; en toile, on revient à
  // la vue de départ quand elle change (rotation, menu latéral).
  useEffect(() => {
    const c = cadre.current
    if (!c) return
    const observer = new ResizeObserver(() => {
      setLargeur(c.clientWidth)
      vueDeDepart()
    })
    observer.observe(c)
    return () => observer.disconnect()
  }, [vueDeDepart])

  return (
    <div
      ref={cadre}
      className={
        enToile
          ? // Un CADRE à la hauteur de l'écran restant (60 % au moins) : son
            // contenu est posé en absolu, il ne l'agrandit donc pas — on
            // navigue DEDANS au lieu de faire défiler la page.
            'relative min-h-[60svh] flex-1'
          : 'flex flex-1 flex-col'
      }
    >
      {enToile ? (
        <div className="absolute inset-0 overflow-hidden">
          <TransformWrapper
            ref={toile}
            minScale={echelleMin}
            maxScale={ZOOM_MAX}
            limitToBounds={false}
            doubleClick={{ disabled: true }}
            wheel={{ activationKeys: ['Control', 'Meta'] }}
            panning={{ velocityDisabled: true }}
            onInit={() => vueDeDepart()}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
            >
              <div ref={contenu} style={{ width: largeurContenu }}>
                {etroit}
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
                onClick={toutVoir}
              />
            </div>
            <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-card/80 px-2.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
              Glisse pour te déplacer · pince pour zoomer
            </p>
          </TransformWrapper>
        </div>
      ) : (
        large
      )}
    </div>
  )
}
