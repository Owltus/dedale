import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Gauge } from 'lucide-react'
import { relevesQueries } from '../queries'
import {
  calculerBandeau,
  chartGroups,
  fenetrePeriode,
  filtrerParPeriode,
  seriesParGamme,
  PERIODE_OPTIONS,
  type GammeReleveResume,
  type Periode,
} from '../pipeline'
import { ChartTemporel } from '@/components/common/charts/serie-temporelle'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { EmptyState } from '@/components/common/empty-state'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { SelectDropdown } from '@/components/ui/select-dropdown'

export function ReleveDetail({
  gamme,
  siteId,
  onBack,
}: {
  gamme: GammeReleveResume
  siteId: string
  onBack: () => void
}) {
  const navigate = useNavigate()
  const historiqueQuery = useQuery(relevesQueries.historique(siteId))
  const localisationQuery = useQuery(relevesQueries.localisationGamme(gamme.id))
  const [periode, setPeriode] = useState<Periode>('12m')

  const toutesSeries = useMemo(
    () => seriesParGamme(historiqueQuery.data ?? [], gamme.id),
    [historiqueQuery.data, gamme.id],
  )
  const series = useMemo(
    () => filtrerParPeriode(toutesSeries, periode, new Date()),
    [toutesSeries, periode],
  )
  const groupes = useMemo(() => chartGroups(series), [series])
  // Fenêtre CONCEPTUELLE de la période choisie (ex. les 3 mois entiers), pas
  // seulement l'étendue des points restants après filtre — sinon une gamme n'ayant
  // qu'un seul relevé dans la fenêtre réduirait l'axe à un unique repère.
  const domaine = useMemo(
    () => fenetrePeriode(periode, new Date(), toutesSeries),
    [periode, toutesSeries],
  )
  const bandeau = useMemo(
    () => calculerBandeau(series, localisationQuery.data ?? null),
    [series, localisationQuery.data],
  )

  const allerVersOt = (otId: string) =>
    void navigate({ to: '/ordres-travail/$otId', params: { otId } })

  return (
    <PageContainer>
      <PageHeader
        title={gamme.nomGamme}
        description="Historique des relevés de cette gamme."
        extra={
          <div className="flex items-center gap-2">
            <TooltipIconButton
              icon={<ChevronLeft />}
              label="Retour aux relevés"
              onClick={onBack}
              variant="outline"
            />
            <SelectDropdown
              value={periode}
              onValueChange={(v) => setPeriode(v as Periode)}
              options={PERIODE_OPTIONS}
              ariaLabel="Période affichée"
              className="h-9 w-44"
            />
          </div>
        }
      />

      <DetailHeaderCard
        fallbackIcon={Gauge}
        columns={3}
        fields={[
          { label: 'Localisation', value: bandeau.localisation },
          { label: 'Types de relevé', value: String(bandeau.types) },
          { label: 'Points', value: String(bandeau.points) },
          bandeau.consommations
            ? {
                label: 'Période couverte',
                value: bandeau.periodeCouverte ?? null,
              }
            : {
                label: 'Conformes',
                value: String(bandeau.conformes ?? 0),
                tone: 'success',
              },
          bandeau.consommations
            ? {
                label: 'Consommation totale',
                value:
                  bandeau.consommations
                    .map(
                      (c) => `${c.total.toLocaleString('fr-FR')} ${c.symbole}`,
                    )
                    .join(' · ') || null,
              }
            : {
                label: 'Non conformes',
                value: String(bandeau.nonConformes ?? 0),
                tone:
                  (bandeau.nonConformes ?? 0) > 0 ? 'destructive' : 'neutral',
              },
        ]}
      />

      {groupes.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Aucun relevé sur cette période"
          description="Élargis la période pour voir l'historique de cette gamme."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groupes.map((g) => (
            <div
              key={g.uniteSymbole}
              className="flex h-80 flex-col rounded-lg border bg-card p-3"
            >
              <div className="mb-1 flex shrink-0 items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {g.series.length === 1
                    ? g.series[0]!.nom
                    : (g.uniteNom ?? g.uniteSymbole)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {g.uniteSymbole}
                </span>
              </div>
              <div className="relative min-h-0 flex-1">
                <ChartTemporel
                  domaine={domaine}
                  // Colonnes pour TOUT compteur (index sans seuils) — cumulatif
                  // (kWh, m³) affichant la consommation, ou non cumulatif (ex. kVA)
                  // affichant la valeur brute : plus lisible qu'une ligne pour une
                  // suite de relevés ponctuels. Ligne réservée aux vraies mesures
                  // (avec seuils, conformité).
                  mode={g.estCompteur ? 'colonnes' : 'ligne'}
                  uniteSymbole={g.uniteSymbole}
                  onPointClick={allerVersOt}
                  series={g.series.map((s) => ({
                    cle: s.nom,
                    label: s.nom,
                    // Seuils PROPRES à cette série — une mesure du même groupe
                    // peut n'avoir qu'un seuil haut, qu'un seuil bas, les deux ou
                    // aucun ; ne jamais lire ceux d'une AUTRE série du groupe.
                    seuilMinimum: s.seuilMinimum,
                    seuilMaximum: s.seuilMaximum,
                    points: s.points.map((p) => ({
                      date: p.date,
                      otId: p.otId,
                      valeur: g.estCompteurCumulatif ? p.conso : p.valeur,
                      conforme: p.conforme,
                      remplacement: p.remplacement,
                    })),
                  }))}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
