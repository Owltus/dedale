import { useLayoutEffect, useState } from 'react'
import { ajouterJours, lundiDeLaSemaine } from '@/lib/date'

const JOUR = 86_400_000
/** Portée des frises : mois de passé et d'avenir autour du centre. */
const MOIS_PASSE = 3
const MOIS_AVENIR = 6
const FMT_MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

export interface AxeFrise {
  t0ms: number
  t1ms: number
  /** Projection d'un instant (ms) sur l'axe X (pixels réels). */
  projX: (ms: number) => number
  /**
   * Lecture PAR SEMAINE (demande PO) : X du lundi de la semaine ISO de
   * l'instant (`debut`), du lundi suivant (`fin`) et du milieu (`centre`).
   * Un événement se place DANS sa semaine, jamais à cheval sur deux.
   */
  semaineDe: (ms: number) => { debut: number; fin: number; centre: number }
  /** Repères de mois (anti-chevauchement : ≥ 34 px entre deux libellés). */
  mois: { x: number; label: string }[]
  /** Semaine ISO en cours (bande lundi → dimanche), `null` hors fenêtre. */
  semaineCourante: { x0: number; x1: number } | null
  /** Année du centre, en filigrane. */
  filigrane: string
}

/**
 * Axe du temps COMMUN aux frises du tableau de bord (contrats, obligations) :
 * fenêtre FIXE de 3 mois de passé et 6 mois d'avenir (décision PO du
 * 09/11/2026 : voir plus loin noyait l'essentiel), autour du `centre` partagé
 * par les flèches clavier — la semaine en cours tombe donc au premier tiers.
 * Lecture PAR SEMAINE ISO 8601 (lundi = 1er jour, demande PO) : la semaine en
 * cours en bande (plus de trait « aujourd'hui »), sans numéros de semaine.
 * Deux frises de même largeur ont leurs repères EXACTEMENT alignés.
 */
export function axeFrise(
  centre: Date,
  viewW: number,
  todayMs: number,
): AxeFrise {
  const centreMs = centre.getTime()
  const t0ms = centreMs - Math.round(MOIS_PASSE * 30.44) * JOUR
  const t1ms = centreMs + Math.round(MOIS_AVENIR * 30.44) * JOUR
  const projX = (ms: number) => ((ms - t0ms) / (t1ms - t0ms)) * viewW

  const mois: { x: number; label: string }[] = []
  let cur = new Date(new Date(t0ms).getFullYear(), new Date(t0ms).getMonth(), 1)
  let dernierMoisX = -Infinity
  while (cur.getTime() <= t1ms) {
    const x = projX(cur.getTime())
    if (x >= 0 && x <= viewW && x - dernierMoisX >= 34) {
      mois.push({ x, label: FMT_MOIS.format(cur) })
      dernierMoisX = x
    }
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  const semaineDe = (ms: number) => {
    const lundi = lundiDeLaSemaine(new Date(ms))
    const debut = projX(lundi.getTime())
    const fin = projX(ajouterJours(lundi, 7).getTime())
    return { debut, fin, centre: (debut + fin) / 2 }
  }

  // Semaine en cours : bande du lundi au lundi suivant (pas de « jour J »).
  const lundiCourant = lundiDeLaSemaine(new Date(todayMs))
  const sx0 = projX(lundiCourant.getTime())
  const sx1 = projX(ajouterJours(lundiCourant, 7).getTime())
  return {
    t0ms,
    t1ms,
    projX,
    semaineDe,
    mois,
    semaineCourante:
      sx1 > 0 && sx0 < viewW
        ? {
            x0: Math.max(0, sx0),
            x1: Math.min(viewW, sx1),
          }
        : null,
    filigrane: String(centre.getFullYear()),
  }
}

/**
 * Largeur réelle (px) d'un élément, suivie au redimensionnement : les frises
 * dessinent en pixels 1:1 (viewBox = largeur mesurée → pas d'agrandissement
 * des éléments quand la carte s'élargit).
 */
export function useLargeur(el: HTMLElement | null): number {
  const [largeur, setLargeur] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    let raf = 0
    const relever = () =>
      setLargeur((p) => (p === el.clientWidth ? p : el.clientWidth))
    relever()
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(relever)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [el])
  return largeur
}
