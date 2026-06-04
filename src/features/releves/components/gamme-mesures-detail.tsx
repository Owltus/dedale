import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, LineChart, X } from 'lucide-react'
import { relevesQueries } from '../queries'
import type { MesurePoint, SerieMesure } from '../queries'
import { MesureChart } from './mesure-chart'
import { OtSourceDialog } from './ot-source-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'

interface GammeMesuresDetailProps {
  siteId: string
  cleGamme: string
  nomGamme: string
  onBack: () => void
}

interface SourceCible {
  otId: string
  valeur: number
  date: string
  uniteSymbole: string | null
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR')
}

function uniteLabel(serie: SerieMesure): string {
  return serie.uniteSymbole ?? serie.uniteNom ?? ''
}

export function GammeMesuresDetail({
  siteId,
  cleGamme,
  nomGamme,
  onBack,
}: GammeMesuresDetailProps) {
  const {
    data: series = [],
    isPending,
    isError,
    refetch,
  } = useQuery(relevesQueries.series(siteId, cleGamme))

  const [cible, setCible] = useState<SourceCible | null>(null)

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft /> Retour aux relevés
      </Button>

      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">{nomGamme}</h2>
        <p className="text-muted-foreground text-sm">
          Historique des mesures relevées lors des ordres de travail.
        </p>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : series.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Aucune mesure"
          description="Aucune valeur n'a encore été relevée pour cette gamme."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {series.map((serie) => (
            <SerieCard
              key={serie.sourceId}
              serie={serie}
              onPointClick={(p) =>
                setCible({
                  otId: p.ordreTravailId,
                  valeur: p.valeur,
                  date: p.date,
                  uniteSymbole: serie.uniteSymbole,
                })
              }
            />
          ))}
        </div>
      )}

      <OtSourceDialog
        otId={cible?.otId ?? null}
        valeur={cible?.valeur ?? null}
        date={cible?.date ?? null}
        uniteSymbole={cible?.uniteSymbole ?? null}
        onClose={() => setCible(null)}
      />
    </div>
  )
}

function SerieCard({
  serie,
  onPointClick,
}: {
  serie: SerieMesure
  onPointClick: (point: MesurePoint) => void
}) {
  const unite = uniteLabel(serie)
  // Tableau en ordre antichronologique (le plus récent d'abord), à la lecture.
  const lignes = [...serie.points].reverse()

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{serie.nom}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {unite && <Badge variant="outline">{unite}</Badge>}
            {serie.seuilMinimum !== null && (
              <Badge variant="secondary">
                min {serie.seuilMinimum}
                {unite ? ` ${unite}` : ''}
              </Badge>
            )}
            {serie.seuilMaximum !== null && (
              <Badge variant="secondary">
                max {serie.seuilMaximum}
                {unite ? ` ${unite}` : ''}
              </Badge>
            )}
            <Badge variant="outline">
              {serie.points.length} relevé
              {serie.points.length > 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MesureChart
          points={serie.points}
          seuilMin={serie.seuilMinimum}
          seuilMax={serie.seuilMaximum}
          uniteSymbole={serie.uniteSymbole}
          onPointClick={onPointClick}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Valeur</th>
                <th className="py-2 pr-4 font-medium">Conformité</th>
                <th className="py-2 font-medium">OT</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((p) => (
                <tr key={p.executionId} className="border-b last:border-0">
                  <td className="py-2 pr-4 tabular-nums">
                    {formatDate(p.date)}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {p.valeur}
                    {unite ? ` ${unite}` : ''}
                  </td>
                  <td className="py-2 pr-4">
                    {p.estConforme === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : p.estConforme ? (
                      <Badge variant="default">
                        <Check /> Conforme
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <X /> Non conforme
                      </Badge>
                    )}
                  </td>
                  <td className="py-2">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => onPointClick(p)}
                    >
                      Voir l'OT
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
