import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { LineChartTimeSeries, type ChartSeries } from "@/components/shared/LineChartTimeSeries";
import { BarChartReleves } from "@/components/shared/BarChartReleves";
import { useElementWidth } from "@/hooks/useElementWidth";
import { useRelevesByGamme, useGammesAvecReleves } from "@/hooks/use-releves";
import { useTemporalNavigation } from "@/hooks/useTemporalNavigation";
import type { OperationReleves } from "@/lib/types/releves";
import { addDaysIso, buildJalons } from "@/lib/utils/cadence";
import { formatChartDate } from "@/lib/utils/format";
import { inferChartKind, type ChartKind } from "@/lib/utils/unites";

/// Largeur cible par point/barre, comme `BAR_WIDTH` du PlanningChart.
const POINT_WIDTH = 56;
const MIN_POINTS = 5;
const MAX_POINTS = 80;

export function RelevesDetail() {
  const { id } = useParams<{ id: string }>();
  const idGamme = Number(id);
  const navigate = useNavigate();

  // Mesure responsive du conteneur graphique → nombre de points visibles.
  const [chartsContainerRef, chartsWidth] = useElementWidth<HTMLDivElement>(800);

  // On récupère le nom de gamme depuis la liste déjà chargée (cache TanStack)
  const { data: gammes = [] } = useGammesAvecReleves();
  const gamme = useMemo(
    () => gammes.find((g) => g.id_gamme === idGamme),
    [gammes, idGamme],
  );

  // Nombre de points qui rentrent à l'écran, calé sur la périodicité de la gamme.
  const visiblePointCount = useMemo(
    () => Math.max(MIN_POINTS, Math.min(MAX_POINTS, Math.floor(chartsWidth / POINT_WIDTH))),
    [chartsWidth],
  );
  const joursPeriodicite = gamme?.jours_periodicite ?? 30;
  const fenetreJours = visiblePointCount * joursPeriodicite;
  // Pas clavier = 1/3 de la fenêtre visible (cohérent avec l'effet « page »).
  const navStepDays = Math.max(1, Math.floor(fenetreJours / 3));

  const [offsetDays, setOffsetDays] = useTemporalNavigation({
    step: navStepDays,
    allowReset: true,
  });

  // On charge tout l'historique : le filtrage temporel est entièrement géré côté front
  // par la fenêtre adaptative + navigation clavier.
  const { data: operations = [], isLoading } = useRelevesByGamme(idGamme, null);

  // Borne de fin = date du dernier relevé observé + offset clavier.
  // Borne de début = endIso − fenetreJours.
  const { startIso, endIso } = useMemo(
    () => computeWindowBounds(operations, fenetreJours, offsetDays),
    [operations, fenetreJours, offsetDays],
  );

  // Jalons artificiels pour étoffer l'axe X même sans relevés dans la fenêtre.
  const jalons = useMemo(
    () => buildJalons(startIso, endIso, joursPeriodicite),
    [startIso, endIso, joursPeriodicite],
  );

  // On passe les opérations COMPLÈTES (pas filtrées) aux composants chart : ils en ont
  // besoin pour calculer les Δ entre relevés aux frontières de la fenêtre. Les composants
  // filtrent naturellement à l'affichage en n'affichant que les buckets dans `extraDates`.
  const groupesParUnite = useMemo(() => groupByUniteAll(operations), [operations]);

  // Format des labels axe X dépendant de la périodicité de la gamme
  const formatLabel = useMemo(() => {
    const jours = gamme?.jours_periodicite ?? 30;
    return (iso: string) => formatChartDate(iso, jours);
  }, [gamme?.jours_periodicite]);

  useSetBreadcrumbTrail(
    gamme
      ? [
          { label: "Relevés", path: "/releves" },
          { label: gamme.nom_gamme, path: `/releves/${idGamme}` },
        ]
      : [],
  );

  const title = gamme ? `Relevés — ${gamme.nom_gamme}` : "Relevés";

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={title}>
        {offsetDays !== 0 && (
          <button
            type="button"
            onClick={() => setOffsetDays(0)}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="Revenir à la fin de l'historique (Home / Échap)"
          >
            {offsetDays > 0 ? `+${offsetDays}j` : `${offsetDays}j`} · réinitialiser
          </button>
        )}
      </PageHeader>

      <div ref={chartsContainerRef} className="flex-1 overflow-y-auto no-scrollbar min-h-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : groupesParUnite.length === 0 ? (
          <EmptyState
            title="Aucun relevé sur cette période"
            description={offsetDays !== 0 ? "Appuyez sur Échap pour revenir à l'historique récent." : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {groupesParUnite.map(({ unite, kind, series, totalPoints, totalResets, titre }) => {
              const onPointClick = (idOt: number) => navigate(`/ordres-travail/${idOt}`);
              return (
                <Card key={`${unite}-${kind}`}>
                  <CardContent className="p-3">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <h3 className="font-medium truncate">{titre}</h3>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {totalPoints} relevé{totalPoints > 1 ? "s" : ""} · {unite}
                        {kind === "bar-delta" && " · consommation par période"}
                        {totalResets > 0 && ` · ${totalResets} changement${totalResets > 1 ? "s" : ""} de compteur`}
                      </span>
                    </div>
                    {kind === "line" && (
                      <LineChartTimeSeries
                        series={series}
                        unite={unite}
                        onPointClick={onPointClick}
                        height={360}
                        formatLabel={formatLabel}
                        extraDates={jalons}
                      />
                    )}
                    {kind === "bar-delta" && (
                      <BarChartReleves
                        series={series}
                        unite={unite}
                        mode="delta"
                        onPointClick={onPointClick}
                        height={360}
                        formatLabel={formatLabel}
                        extraDates={jalons}
                      />
                    )}
                    {kind === "bar-raw" && (
                      <BarChartReleves
                        series={series}
                        unite={unite}
                        mode="raw"
                        onPointClick={onPointClick}
                        height={360}
                        formatLabel={formatLabel}
                        extraDates={jalons}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface GroupeUnite {
  unite: string;
  kind: ChartKind;
  operations: OperationReleves[];
  /// Pré-calculés pour préserver les références entre renders (le `useMemo` des charts
  /// s'invaliderait sinon à chaque render parent — par ex. à chaque pression de flèche clavier).
  series: ChartSeries[];
  totalPoints: number;
  totalResets: number;
  titre: string;
}

/**
 * Calcule les bornes [startIso, endIso] de la fenêtre visible.
 * `endIso` = max(date_releve) + offsetDays (ou aujourd'hui si pas de données).
 * `startIso` = endIso − fenetreJours.
 */
function computeWindowBounds(
  operations: OperationReleves[],
  fenetreJours: number,
  offsetDays: number,
): { startIso: string; endIso: string } {
  let maxDate = "";
  for (const op of operations) {
    for (const p of op.points) {
      if (p.date_releve > maxDate) maxDate = p.date_releve;
    }
  }
  const ancre = maxDate || new Date().toISOString().slice(0, 10);
  const endIso = addDaysIso(ancre, offsetDays);
  const startIso = addDaysIso(endIso, -fenetreJours);
  return { startIso, endIso };
}

/**
 * Compte les changements de compteur dans une série cumulative
 * (un changement = passage à un index inférieur, signature d'un remplacement physique).
 */
function countCounterResets(points: { valeur_mesuree: number }[]): number {
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.valeur_mesuree < points[i - 1]!.valeur_mesuree) count++;
  }
  return count;
}

/**
 * Regroupe les opérations par (unité, type de graphique) — chaque graphe est ainsi
 * homogène. Le `kind` est inféré depuis les valeurs réelles de l'opération
 * (cf. `inferChartKind`), avec fallback sur le symbole. Si une même unité contient
 * des opérations cumulatives ET instantanées (rare), elles vont dans 2 graphes distincts.
 *
 * On passe les opérations **complètes** : les composants chart se chargent du filtrage
 * par fenêtre via `extraDates` — indispensable pour bar-delta qui doit calculer les Δ
 * frontaliers (1er point hors fenêtre + 1er point dans fenêtre = bucket valide).
 */
function groupByUniteAll(operations: OperationReleves[]): GroupeUnite[] {
  const groups = new Map<string, { unite: string; kind: ChartKind; operations: OperationReleves[] }>();
  for (const op of operations) {
    const values = op.points.map((p) => p.valeur_mesuree);
    const kind = inferChartKind(values, op.unite_symbole);
    const unite = op.unite_symbole ?? "—";
    const key = `${unite}|${kind}`;
    const group = groups.get(key);
    if (group) group.operations.push(op);
    else groups.set(key, { unite, kind, operations: [op] });
  }
  return Array.from(groups.values()).map(({ unite, kind, operations: ops }) => ({
    unite,
    kind,
    operations: ops,
    series: ops.map((op) => ({
      label: op.nom_operation,
      points: op.points,
      seuilMin: op.seuil_minimum,
      seuilMax: op.seuil_maximum,
    })),
    totalPoints: ops.reduce((sum, op) => sum + op.points.length, 0),
    totalResets: kind === "bar-delta"
      ? ops.reduce((sum, op) => sum + countCounterResets(op.points), 0)
      : 0,
    titre: ops.length === 1 ? ops[0]!.nom_operation : `${ops.length} opérations · ${unite}`,
  }));
}
