import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import {
  onKeyActivate,
  toneToken,
} from '@/components/common/charts/chart-tokens'
import type { FenetreTemporelle } from '@/features/planning/use-fenetre-temporelle'
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
  ORDRE_LEGENDE,
  type GammeFrise,
  type Jalon,
} from '../frise-obligations'

interface FriseObligationsProps {
  siteId: string
  /** Fenêtre PARTAGÉE avec les barres et la frise des contrats (mêmes flèches). */
  fenetre: FenetreTemporelle
}

// ── Géométrie (pixels réels, cf. `useLargeur`) ───────────────────────────────
const R = 4
const LANE_H = 11
const AXE_H = 22
const TETE_BANDE = 16 // ligne du libellé de nature
const GAP = R * 1.2
const BAS = 16 // « Aujourd'hui »
const JOUR = 86_400_000

/** Jalon projeté, avec sa ligne (anti-chevauchement) et son Y. */
interface JalonPlace extends Jalon {
  x: number
  y: number
}

/** « aujourd'hui » / « dans N j » / « il y a N j ». */
function labelEcart(iso: string): string {
  const diff = Math.round(
    (parseDateLocale(iso).getTime() - parseDateLocale(todayLocal()).getTime()) /
      JOUR,
  )
  if (diff === 0) return "aujourd'hui"
  if (diff > 0) return `dans ${String(diff)} j`
  return `il y a ${String(-diff)} j`
}

/**
 * Frise « Obligations » (zone 2 du tableau de bord, sous les contrats) : les
 * passages des gammes de contrôle réglementaire, d'hygiène et de formation,
 * une bande par nature. La couleur dit où l'on en est :
 *   - violet = date posée par vous (vraiment organisé) ;
 *   - gris plein = date posée par l'application (pas encore organisé) ;
 *   - cercle creux = passage à venir qui n'existe pas encore, ESTIMÉ d'après la
 *     périodicité (miroir exact du calcul de la base, `prochaineDateOt`) ;
 *   - rouge en retard, bleu en cours, rose rouvert, vert fait.
 * Survoler un passage met en avant TOUTE sa gamme ; clic → fiche de l'OT (ou de
 * la gamme pour un passage estimé). Même axe que la frise des contrats
 * (`axeFrise`) : les mois sont alignés et avancent avec les mêmes flèches.
 *
 * Aucune gamme d'obligation sur le site → la carte ne se rend pas (`null`).
 */
export function FriseObligations({ siteId, fenetre }: FriseObligationsProps) {
  const navigate = useNavigate()
  const { ordresTravail, gammesQuery } = useDashboardData(siteId)
  const [boite, setBoite] = useState<HTMLDivElement | null>(null)
  const viewW = useLargeur(boite) || 1000
  const [survol, setSurvol] = useState<string | null>(null)

  const gammes = useMemo<GammeFrise[]>(
    () =>
      (gammesQuery.data ?? []).map((g) => ({
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
    }).filter((b) => gammes.some((g) => g.nature === b.nature))

    let y = AXE_H
    const places: JalonPlace[] = []
    const entetes: {
      libelle: string
      couleur: string
      y: number
      vide: boolean
    }[] = []
    for (const b of bandes) {
      entetes.push({
        libelle: b.libelle,
        couleur: b.couleur,
        y,
        vide: b.jalons.length === 0,
      })
      const haut = y + TETE_BANDE + LANE_H / 2
      const lignes: number[] = []
      for (const j of b.jalons) {
        const x = axe.projX(parseDateLocale(j.date).getTime())
        let lane = lignes.findIndex((droite) => x - R >= droite + GAP)
        if (lane === -1) {
          lane = lignes.length
          lignes.push(x + R)
        } else lignes[lane] = x + R
        places.push({ ...j, x, y: haut + lane * LANE_H })
      }
      y += TETE_BANDE + Math.max(lignes.length, 1) * LANE_H + 4
    }
    return { axe, places, entetes, hauteur: y + BAS }
  }, [fenetre.centre, viewW, gammes, ordresTravail])

  if (gammesQuery.isError)
    return (
      <DashboardCard>
        <ErrorState
          message="Les obligations n’ont pas pu être chargées."
          onRetry={() => void gammesQuery.refetch()}
          className="py-6"
        />
      </DashboardCard>
    )
  if (gammesQuery.isPending)
    return (
      <DashboardCard>
        <Skeleton className="my-3 h-24 w-full" />
      </DashboardCard>
    )
  if (modele.entetes.length === 0) return null

  const ouvrir = (j: Jalon) =>
    j.otId !== null
      ? void navigate({
          to: '/ordres-travail/$otId',
          params: { otId: j.otId },
        })
      : void navigate({
          to: '/gammes/$',
          params: { _splat: '' },
          search: { open: j.gammeId },
        })

  const survolJalon = modele.places.find((p) => p.cle === survol) ?? null
  const gammeSurvolee = survolJalon?.gammeId ?? null
  const { axe } = modele

  return (
    <DashboardCard>
      <div ref={setBoite} className="relative">
        <svg
          viewBox={`0 0 ${String(viewW)} ${String(modele.hauteur)}`}
          width={viewW}
          height={modele.hauteur}
          role="img"
          aria-label="Frise des obligations : contrôles réglementaires, hygiène et formation"
          className="block"
        >
          {/* Axe des mois. */}
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

          {/* Bandes : libellé de la nature (couleur de repère du planning). */}
          {modele.entetes.map((e, i) => (
            <g key={e.libelle}>
              {i > 0 && (
                <line
                  x1={0}
                  y1={e.y}
                  x2={viewW}
                  y2={e.y}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              )}
              <rect
                x={2}
                y={e.y + 4}
                width={8}
                height={8}
                rx={2}
                fill="none"
                stroke={e.couleur}
                strokeWidth={2}
              />
              <text
                x={16}
                y={e.y + 12}
                style={{
                  fill: 'var(--foreground)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {e.libelle}
                {e.vide ? ' — rien sur la période' : ''}
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

          {/* Passages. */}
          {modele.places.map((p) => {
            const def = ETAT_JALON[p.etat]
            const couleur = toneToken(def.tone)
            const attenue =
              gammeSurvolee !== null && gammeSurvolee !== p.gammeId
            const aria = `${p.gammeNom} — ${def.libelle} · ${formatDateAvecSemaineIso(p.date)} · ${labelEcart(p.date)}`
            return (
              <g
                key={p.cle}
                role="button"
                tabIndex={0}
                aria-label={aria}
                className="cursor-pointer outline-none"
                opacity={attenue ? 0.2 : 1}
                onClick={() => ouvrir(p)}
                onKeyDown={onKeyActivate(() => ouvrir(p))}
                onMouseEnter={() => setSurvol(p.cle)}
                onMouseLeave={() => setSurvol(null)}
                onFocus={() => setSurvol(p.cle)}
                onBlur={() => setSurvol(null)}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={def.creux ? R - 1 : R}
                  fill={def.creux ? 'var(--card)' : couleur}
                  stroke={def.creux ? couleur : 'none'}
                  strokeWidth={def.creux ? 1.5 : 0}
                  strokeDasharray={def.creux ? '2 1.5' : undefined}
                >
                  <title>{aria}</title>
                </circle>
                <rect
                  x={p.x - R - 3}
                  y={p.y - LANE_H / 2}
                  width={2 * R + 6}
                  height={LANE_H}
                  fill="transparent"
                />
              </g>
            )
          })}
        </svg>

        {survolJalon && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{
              left: `${String((survolJalon.x / viewW) * 100)}%`,
              top: `${String((survolJalon.y / modele.hauteur) * 100)}%`,
              transform: 'translate(-50%, calc(-100% - 8px))',
            }}
          >
            <div className="font-medium">{survolJalon.gammeNom}</div>
            <div className="whitespace-nowrap text-muted-foreground">
              {ETAT_JALON[survolJalon.etat].libelle}
            </div>
            <div className="whitespace-nowrap text-muted-foreground">
              {formatDateAvecSemaineIso(survolJalon.date)} ·{' '}
              {labelEcart(survolJalon.date)}
            </div>
          </div>
        )}

        {/* Légende des états. */}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {ORDRE_LEGENDE.map((etat) => {
            const def = ETAT_JALON[etat]
            const couleur = toneToken(def.tone)
            return (
              <span key={etat} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={
                    def.creux
                      ? { border: `1.5px dashed ${couleur}` }
                      : { background: couleur }
                  }
                />
                {def.libelle}
              </span>
            )
          })}
        </div>
      </div>
    </DashboardCard>
  )
}
