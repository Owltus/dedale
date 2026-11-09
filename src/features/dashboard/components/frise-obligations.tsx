import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Wrench } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import {
  onKeyActivate,
  toneToken,
} from '@/components/common/charts/chart-tokens'
import type { FenetreTemporelle } from '@/features/planning/use-fenetre-temporelle'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import {
  formatDateAvecSemaineIso,
  parseDateLocale,
  todayLocal,
} from '@/lib/date'
import { DashboardCard } from './dashboard-card'
import { useDashboardData } from '../use-dashboard-data'
import { axeFrise, useLargeur } from '../frise-axe'
import {
  construireBandes,
  ETAT_JALON,
  regrouperParSemaine,
  type GammeFrise,
  type SemaineBande,
} from '../frise-obligations'

interface FriseObligationsProps {
  siteId: string
  /** Fenêtre PARTAGÉE avec les barres et la frise des contrats (mêmes flèches). */
  fenetre: FenetreTemporelle
}

// ── Géométrie (pixels réels, cf. `useLargeur`) ───────────────────────────────
const COTE = 6 // côté du carré d'état
const CONTOUR = 11 // côté du contour de nature (détaché du carré)
const LIGNE_H = 15
const AXE_H = 22
const BAS = 16 // « Aujourd'hui »
const GAP = 3 // écart mini entre deux marques d'une même ligne
const JOUR = 86_400_000
/** Nombre de passages listés dans l'infobulle avant « + N autres ». */
const MAX_INFOBULLE = 6

interface MarquePlacee extends SemaineBande {
  cle: string
  libelleNature: string
  couleurNature: string
  x: number
  y: number
}

/**
 * Frise « Obligations » (zone 2 du tableau de bord, sous les contrats), au
 * format le plus COMPACT (demandes PO du 09/11/2026) :
 *   - seules les gammes d'obligation (réglementaire, hygiène, formation) dont le
 *     DOCUMENT EST EXIGÉ — celles qui ont vraiment une suite à donner ;
 *   - tournée vers l'AVENIR : les interventions faites n'y figurent pas ;
 *   - une marque par nature et par semaine, rangées comme les contrats : une
 *     seule ligne tant que rien ne se chevauche, une ligne de plus seulement
 *     quand deux marques tombent au même endroit ;
 *   - ni titres de lignes ni légende : le CONTOUR de la marque dit la nature
 *     (mêmes couleurs que le planning), le FOND dit l'état — violet planifié
 *     par vous, gris programmé par l'application, vide en pointillés = passage
 *     estimé (pas encore créé), rouge retard, rose rouvert, bleu en cours.
 *     L'infobulle détaille tout.
 * Une semaine qui mélange plusieurs passages prend le MOINS organisé
 * (`ORDRE_LEGENDE`). Clic : un seul OT → sa fiche, une seule gamme → sa
 * fiche, sinon le planning. Même axe que la frise des contrats (`axeFrise`).
 *
 * Rien à afficher (aucune gamme d'obligation à document exigé) → `null`.
 */
export function FriseObligations({ siteId, fenetre }: FriseObligationsProps) {
  const navigate = useNavigate()
  const { ordresTravail, gammesQuery } = useDashboardData(siteId)
  const [boite, setBoite] = useState<HTMLDivElement | null>(null)
  const viewW = useLargeur(boite) || 1000
  const [survol, setSurvol] = useState<string | null>(null)
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  // Image de chaque gamme (vignette de l'infobulle, demande PO 09/11/2026).
  const miniatureParGamme = useMemo(
    () => new Map((gammesQuery.data ?? []).map((g) => [g.id, g.miniature_id])),
    [gammesQuery.data],
  )

  const gammes = useMemo<GammeFrise[]>(
    () =>
      (gammesQuery.data ?? [])
        .filter((g) => g.document_requis)
        .map((g) => ({
          id: g.id,
          nom: g.nom,
          nature: g.nature,
          est_active: g.est_active,
          jours: g.periodicites.jours_periodicite,
        })),
    [gammesQuery.data],
  )

  const modele = useMemo(() => {
    const todayMs = parseDateLocale(todayLocal()).getTime()
    const axe = axeFrise(fenetre.centre, viewW, todayMs)
    const bandes = construireBandes({
      gammes,
      ots: ordresTravail,
      debut: new Date(axe.t0ms),
      fin: new Date(axe.t1ms),
    })

    // Marques de toutes les natures, triées par X (puis ordre des natures).
    const brutes = bandes
      .flatMap((b, rangNature) =>
        regrouperParSemaine(b.jalons).map((sem) => ({
          ...sem,
          rangNature,
          cle: `${b.nature}:${sem.lundi}`,
          libelleNature: b.libelle,
          couleurNature: b.couleur,
          // Milieu de la semaine (jeudi) : la marque couvre sa semaine.
          x: axe.projX(parseDateLocale(sem.lundi).getTime() + 3.5 * JOUR),
        })),
      )
      .sort((a, b) => a.x - b.x || a.rangNature - b.rangNature)

    // Rangement façon contrats : première ligne libre, sinon une de plus.
    const droites: number[] = []
    const marques: MarquePlacee[] = brutes.map((m) => {
      const x0 = m.x - CONTOUR / 2
      let ligne = droites.findIndex((d) => x0 >= d + GAP)
      if (ligne === -1) {
        ligne = droites.length
        droites.push(m.x + CONTOUR / 2)
      } else droites[ligne] = m.x + CONTOUR / 2
      return { ...m, y: AXE_H + ligne * LIGNE_H + LIGNE_H / 2 }
    })

    const nbLignes = Math.max(droites.length, 1)
    return {
      axe,
      marques,
      hauteur: AXE_H + nbLignes * LIGNE_H + BAS,
    }
  }, [fenetre.centre, viewW, gammes, ordresTravail])

  if (gammesQuery.isError)
    return (
      <DashboardCard>
        <ErrorState
          message="Les obligations n’ont pas pu être chargées."
          onRetry={() => void gammesQuery.refetch()}
          className="py-4"
        />
      </DashboardCard>
    )
  if (gammesQuery.isPending)
    return (
      <DashboardCard>
        <Skeleton className="my-2 h-12 w-full" />
      </DashboardCard>
    )
  if (gammes.length === 0) return null

  const ouvrir = (m: MarquePlacee) => {
    const [premier] = m.jalons
    const uneGamme = m.jalons.every((j) => j.gammeId === premier?.gammeId)
    if (m.jalons.length === 1 && premier?.otId)
      void navigate({
        to: '/ordres-travail/$otId',
        params: { otId: premier.otId },
      })
    else if (uneGamme && premier)
      void navigate({
        to: '/gammes/$',
        params: { _splat: '' },
        search: { open: premier.gammeId },
      })
    else void navigate({ to: '/planning' })
  }

  const { axe } = modele
  const survolee = modele.marques.find((m) => m.cle === survol) ?? null

  return (
    <DashboardCard>
      <div ref={setBoite} className="relative">
        <svg
          viewBox={`0 0 ${String(viewW)} ${String(modele.hauteur)}`}
          width={viewW}
          height={modele.hauteur}
          role="img"
          aria-label="Frise des obligations à venir dont le document est exigé"
          className="block"
        >
          {/* Axe des mois (aligné sur la frise des contrats). */}
          {axe.mois.map((m, i) => (
            <g key={`mois-${String(i)}`}>
              <line
                x1={m.x}
                y1={AXE_H}
                x2={m.x}
                y2={modele.hauteur - BAS}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={m.x}
                y={AXE_H - 7}
                textAnchor="middle"
                style={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              >
                {m.label}
              </text>
            </g>
          ))}

          {/* « Aujourd'hui ». */}
          {axe.todayVisible && (
            <>
              <line
                x1={axe.todayX}
                y1={AXE_H - 3}
                x2={axe.todayX}
                y2={modele.hauteur - BAS + 2}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.7}
              />
              <text
                x={axe.todayX}
                y={modele.hauteur - 4}
                textAnchor="middle"
                style={{
                  fill: 'var(--muted-foreground)',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {"Aujourd'hui"}
              </text>
            </>
          )}

          {/* Une marque par nature et par semaine : contour = nature, fond = état. */}
          {modele.marques.map((m) => {
            const def = ETAT_JALON[m.etat]
            const n = m.jalons.length
            const aria = `${m.libelleNature} — semaine du ${formatDateAvecSemaineIso(m.lundi)} : ${String(n)} passage${n > 1 ? 's' : ''}, ${def.libelle.toLowerCase()}`
            return (
              <g
                key={m.cle}
                role="button"
                tabIndex={0}
                aria-label={aria}
                className="cursor-pointer outline-none"
                onClick={() => ouvrir(m)}
                onKeyDown={onKeyActivate(() => ouvrir(m))}
                onMouseEnter={() => setSurvol(m.cle)}
                onMouseLeave={() => setSurvol(null)}
                onFocus={() => setSurvol(m.cle)}
                onBlur={() => setSurvol(null)}
              >
                {/* Contour de nature DÉTACHÉ du carré (comme le planning). */}
                <rect
                  x={m.x - CONTOUR / 2}
                  y={m.y - CONTOUR / 2}
                  width={CONTOUR}
                  height={CONTOUR}
                  rx={3}
                  fill="none"
                  stroke={m.couleurNature}
                  strokeWidth={1.25}
                />
                {/* Carré d'état. */}
                <rect
                  x={m.x - COTE / 2}
                  y={m.y - COTE / 2}
                  width={COTE}
                  height={COTE}
                  rx={1.5}
                  fill={def.creux ? 'none' : toneToken(def.tone)}
                  stroke={def.creux ? toneToken(def.tone) : 'none'}
                  strokeWidth={def.creux ? 1 : 0}
                  strokeDasharray={def.creux ? '1.5 1' : undefined}
                  opacity={survol === m.cle ? 0.75 : 1}
                >
                  <title>{aria}</title>
                </rect>
                <rect
                  x={m.x - CONTOUR / 2 - 1}
                  y={m.y - LIGNE_H / 2}
                  width={CONTOUR + 2}
                  height={LIGNE_H}
                  fill="transparent"
                />
              </g>
            )
          })}
        </svg>

        {survolee && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{
              left: `${String((survolee.x / viewW) * 100)}%`,
              top: `${String((survolee.y / modele.hauteur) * 100)}%`,
              transform: 'translate(-50%, calc(-100% - 8px))',
            }}
          >
            <div className="font-medium whitespace-nowrap">
              {survolee.libelleNature} · semaine du{' '}
              {formatDateAvecSemaineIso(survolee.lundi)}
            </div>
            {survolee.jalons.slice(0, MAX_INFOBULLE).map((j) => (
              <div
                key={j.cle}
                className="mt-1 flex items-center gap-2 whitespace-nowrap text-muted-foreground"
              >
                <div className="size-8 shrink-0 overflow-hidden rounded bg-muted">
                  <MiniatureThumb
                    url={urlOf(miniatureParGamme.get(j.gammeId) ?? null)}
                    fallback={<Wrench className="size-4" />}
                    alt=""
                    onError={refreshMiniatures}
                    className="size-full rounded-none"
                  />
                </div>
                <div>
                  <div className="text-popover-foreground">{j.gammeNom}</div>
                  <div>{ETAT_JALON[j.etat].libelle}</div>
                </div>
              </div>
            ))}
            {survolee.jalons.length > MAX_INFOBULLE && (
              <div className="text-muted-foreground">
                + {survolee.jalons.length - MAX_INFOBULLE} autres
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  )
}
