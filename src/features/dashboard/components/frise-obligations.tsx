import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
const COTE = 8 // côté d'une marque de semaine
const LIGNE_H = 18
const AXE_H = 22
const BAS = 16 // « Aujourd'hui »
const JOUR = 86_400_000
/** Nombre de passages listés dans l'infobulle avant « + N autres ». */
const MAX_INFOBULLE = 6

/** Libellé court de la ligne (le libellé complet est dans l'infobulle). */
const LIBELLE_COURT: Record<string, string> = {
  controle_reglementaire: 'Réglementaire',
  hygiene_sanitaire: 'Hygiène',
  formation_habilitation: 'Formation',
}

interface MarquePlacee extends SemaineBande {
  cle: string
  libelleNature: string
  x: number
  y: number
}

/**
 * Frise « Obligations » (zone 2 du tableau de bord, sous les contrats), au
 * format COMPACT voulu par le PO : une ligne par nature d'obligation
 * (réglementaire, hygiène, formation), une marque par semaine, tournée vers
 * l'AVENIR (les interventions faites n'y figurent pas). La couleur dit si
 * c'est organisé :
 *   - violet = date posée par vous ;
 *   - gris plein = date posée par l'application (pas encore organisé) ;
 *   - carré creux = passage qui n'existe pas encore, ESTIMÉ d'après la
 *     périodicité (miroir exact du calcul de la base, `prochaineDateOt`) ;
 *   - rouge en retard, rose rouvert, bleu en cours.
 * Une semaine qui mélange plusieurs passages prend le MOINS organisé
 * (`ORDRE_LEGENDE`) ; l'infobulle les liste tous. Clic : un seul OT → sa fiche,
 * une seule gamme → sa fiche, sinon le planning. Même axe que la frise des
 * contrats (`axeFrise`) : mois alignés, mêmes flèches.
 *
 * Interrupteur « Documents exigés seulement » (ACTIF par défaut, demande PO) :
 * n'affiche que les gammes dont l'interrupteur `document_requis` est coché —
 * celles qui ont vraiment une suite à donner (un justificatif à rattacher).
 *
 * Aucune gamme d'obligation sur le site → la carte ne se rend pas (`null`).
 */
export function FriseObligations({ siteId, fenetre }: FriseObligationsProps) {
  const navigate = useNavigate()
  const { ordresTravail, gammesQuery } = useDashboardData(siteId)
  const [boite, setBoite] = useState<HTMLDivElement | null>(null)
  const viewW = useLargeur(boite) || 1000
  const [survol, setSurvol] = useState<string | null>(null)
  const [documentsSeuls, setDocumentsSeuls] = useState(true)

  const gammes = useMemo<GammeFrise[]>(
    () =>
      (gammesQuery.data ?? [])
        .filter((g) => !documentsSeuls || g.document_requis)
        .map((g) => ({
          id: g.id,
          nom: g.nom,
          nature: g.nature,
          est_active: g.est_active,
          jours: g.periodicites.jours_periodicite,
        })),
    [gammesQuery.data, documentsSeuls],
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

    const lignes = bandes.map((b, i) => ({
      nature: b.nature,
      libelle: LIBELLE_COURT[b.nature] ?? b.libelle,
      couleur: b.couleur,
      y: AXE_H + i * LIGNE_H + LIGNE_H / 2,
    }))
    const marques: MarquePlacee[] = bandes.flatMap((b, i) =>
      regrouperParSemaine(b.jalons).map((sem) => ({
        ...sem,
        cle: `${b.nature}:${sem.lundi}`,
        libelleNature: b.libelle,
        // Milieu de la semaine (jeudi) : la marque couvre sa semaine.
        x: axe.projX(parseDateLocale(sem.lundi).getTime() + 3.5 * JOUR),
        y: AXE_H + i * LIGNE_H + LIGNE_H / 2,
      })),
    )
    return {
      axe,
      lignes,
      marques,
      hauteur: AXE_H + lignes.length * LIGNE_H + BAS,
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
        <Skeleton className="my-2 h-16 w-full" />
      </DashboardCard>
    )
  // Aucune gamme d'obligation sur le site → carte masquée. Filtrée à vide par
  // l'interrupteur → carte gardée (sinon l'interrupteur disparaîtrait avec elle).
  if (modele.lignes.length === 0 && !documentsSeuls) return null

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
          aria-label="Frise des obligations à venir : contrôles réglementaires, hygiène et formation"
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

          {/* Libellé de chaque ligne, posé dans le passé (zone peu chargée). */}
          {modele.lignes.map((l) => (
            <g key={l.nature}>
              <rect
                x={2}
                y={l.y - 4}
                width={8}
                height={8}
                rx={2}
                fill="none"
                stroke={l.couleur}
                strokeWidth={2}
              />
              <text
                x={16}
                y={l.y + 4}
                style={{
                  fill: 'var(--foreground)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {l.libelle}
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

          {/* Une marque par semaine. */}
          {modele.marques.map((m) => {
            const def = ETAT_JALON[m.etat]
            const couleur = toneToken(def.tone)
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
                <rect
                  x={m.x - COTE / 2}
                  y={m.y - COTE / 2}
                  width={COTE}
                  height={COTE}
                  rx={2}
                  fill={def.creux ? 'none' : couleur}
                  stroke={def.creux ? couleur : 'none'}
                  strokeWidth={def.creux ? 1.25 : 0}
                  strokeDasharray={def.creux ? '2 1.5' : undefined}
                  opacity={survol === m.cle ? 0.75 : 1}
                >
                  <title>{aria}</title>
                </rect>
                <rect
                  x={m.x - COTE / 2 - 2}
                  y={m.y - LIGNE_H / 2}
                  width={COTE + 4}
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
                className="whitespace-nowrap text-muted-foreground"
              >
                {j.gammeNom} · {ETAT_JALON[j.etat].libelle}
              </div>
            ))}
            {survolee.jalons.length > MAX_INFOBULLE && (
              <div className="text-muted-foreground">
                + {survolee.jalons.length - MAX_INFOBULLE} autres
              </div>
            )}
          </div>
        )}

        {modele.lignes.length === 0 && (
          <p className="pb-2 text-center text-sm text-muted-foreground">
            Aucune obligation n’exige de document.
          </p>
        )}

        {/* Légende des états + interrupteur. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {ORDRE_LEGENDE.map((etat) => {
            const def = ETAT_JALON[etat]
            const couleur = toneToken(def.tone)
            return (
              <span key={etat} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-[2px]"
                  style={
                    def.creux
                      ? { border: `1.25px dashed ${couleur}` }
                      : { background: couleur }
                  }
                />
                {def.libelle}
              </span>
            )
          })}
          <label className="ml-auto flex cursor-pointer items-center gap-2">
            <Switch
              checked={documentsSeuls}
              onCheckedChange={setDocumentsSeuls}
              className="h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3.5"
            />
            Documents exigés seulement
          </label>
        </div>
      </div>
    </DashboardCard>
  )
}
