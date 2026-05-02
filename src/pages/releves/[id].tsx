import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { LineChartTimeSeries, type ChartSeries } from "@/components/shared/LineChartTimeSeries";
import { BarChartReleves } from "@/components/shared/BarChartReleves";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useElementWidth } from "@/hooks/useElementWidth";
import { useRelevesByGamme, useGammesAvecReleves } from "@/hooks/use-releves";
import { useTemporalNavigation } from "@/hooks/useTemporalNavigation";
import type { OperationReleves } from "@/lib/types/releves";
import { cn } from "@/lib/utils";
import { addDaysIso, buildJalons } from "@/lib/utils/cadence";
import { formatChartDate } from "@/lib/utils/format";
import { inferChartKind, type ChartKind } from "@/lib/utils/unites";

/// Largeur cible par point/barre, comme `BAR_WIDTH` du PlanningChart.
const POINT_WIDTH = 56;
const MIN_POINTS = 5;
const MAX_POINTS = 80;
/// Mode "année" : fenêtre fixe d'1 an, navigation par pas d'1 an.
const FENETRE_ANNUELLE_JOURS = 365;

type ViewMode = "mois" | "annee";

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

  const [viewMode, setViewMode] = useState<ViewMode>("mois");

  // On charge tout l'historique : le filtrage temporel est entièrement géré côté front.
  const { data: operations = [], isLoading } = useRelevesByGamme(idGamme, null);

  const visiblePointCount = useMemo(
    () => Math.max(MIN_POINTS, Math.min(MAX_POINTS, Math.floor(chartsWidth / POINT_WIDTH))),
    [chartsWidth],
  );
  const joursPeriodicite = gamme?.jours_periodicite ?? 30;
  const maxDateIso = useMemo(() => computeMaxDate(operations), [operations]);

  // Profil de vue : centralise les valeurs qui dépendent de viewMode pour éviter
  // les branchements éparpillés dans le reste du composant.
  const cfg = useMemo(() => {
    if (viewMode === "annee") {
      return {
        fenetreJours: FENETRE_ANNUELLE_JOURS,
        navStepDays: FENETRE_ANNUELLE_JOURS,
        jalonStepJours: 30, // 12 jalons mensuels sur l'année
        prevLabel: "Année précédente",
        nextLabel: "Année suivante",
      };
    }
    const fenetre = visiblePointCount * joursPeriodicite;
    return {
      fenetreJours: fenetre,
      navStepDays: Math.max(1, Math.floor(fenetre / 3)),
      jalonStepJours: joursPeriodicite,
      prevLabel: "Période précédente",
      nextLabel: "Période suivante",
    };
  }, [viewMode, visiblePointCount, joursPeriodicite]);

  const [offsetDays, setOffsetDays] = useTemporalNavigation({
    step: cfg.navStepDays,
    allowReset: true,
  });

  // Bug évité : si on bascule de mode avec un offset non multiple du nouveau step,
  // on dériverait. Reset systématique pour repartir de la fin de l'historique.
  const switchViewMode = (next: ViewMode) => {
    if (next === viewMode) return;
    setOffsetDays(0);
    setViewMode(next);
  };

  // Mode mois : fenêtre glissante (endIso = max relevé + offset).
  // Mode année : année calendaire complète (1er janv → 31 déc), offset = ±N années.
  const { startIso, endIso } = useMemo(() => {
    if (viewMode === "annee") {
      const ancre = maxDateIso ?? new Date().toISOString().slice(0, 10);
      const yearOffset = Math.round(offsetDays / FENETRE_ANNUELLE_JOURS);
      const targetYear = Number(ancre.slice(0, 4)) + yearOffset;
      return { startIso: `${targetYear}-01-01`, endIso: `${targetYear}-12-31` };
    }
    const ancre = maxDateIso ?? new Date().toISOString().slice(0, 10);
    const end = addDaysIso(ancre, offsetDays);
    return { startIso: addDaysIso(end, -cfg.fenetreJours), endIso: end };
  }, [maxDateIso, cfg.fenetreJours, offsetDays, viewMode]);

  const jalons = useMemo(
    () => buildJalons(startIso, endIso, cfg.jalonStepJours),
    [startIso, endIso, cfg.jalonStepJours],
  );

  // On passe les opérations COMPLÈTES (pas filtrées) aux composants chart : ils en ont
  // besoin pour calculer les Δ entre relevés aux frontières de la fenêtre. Les composants
  // filtrent naturellement à l'affichage en n'affichant que les buckets dans `extraDates`.
  const groupesParUnite = useMemo(() => groupByUniteAll(operations), [operations]);

  // Format axe X — sans année (l'année est affichée séparément en filigrane).
  const formatLabel = useMemo(
    () => (iso: string) => formatChartDate(iso, cfg.jalonStepJours, false),
    [cfg.jalonStepJours],
  );

  useSetBreadcrumbTrail(
    gamme
      ? [
          { label: "Relevés", path: "/releves" },
          { label: gamme.nom_gamme, path: `/releves/${idGamme}` },
        ]
      : [],
  );

  const title = gamme ? `Relevés — ${gamme.nom_gamme}` : "Relevés";

  // Label de la période visible — formaté selon le mode de vue.
  const periodeLabel = useMemo(() => {
    if (!startIso || !endIso) return "—";
    if (viewMode === "annee") return String(new Date(endIso).getUTCFullYear());
    return `${format(new Date(startIso), "MMM yyyy", { locale: fr })} → ${format(new Date(endIso), "MMM yyyy", { locale: fr })}`;
  }, [startIso, endIso, viewMode]);

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={title}>
        <TooltipProvider delay={300}>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => switchViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="mois">Mois</TabsTrigger>
                <TabsTrigger value="annee">Année</TabsTrigger>
              </TabsList>
            </Tabs>
            <HeaderButton
              icon={<ChevronsLeft className="size-4" />}
              label={cfg.prevLabel}
              onClick={() => setOffsetDays((o) => o - cfg.navStepDays)}
            />
            <button
              type="button"
              onClick={() => setOffsetDays(0)}
              className="text-sm font-bold tabular-nums min-w-44 text-center hover:text-primary transition-colors cursor-pointer"
              title="Revenir aux dernières données (Home / Échap)"
            >
              {periodeLabel}
            </button>
            <HeaderButton
              icon={<ChevronsRight className="size-4" />}
              label={cfg.nextLabel}
              onClick={() => setOffsetDays((o) => o + cfg.navStepDays)}
            />
          </div>
        </TooltipProvider>
      </PageHeader>

      <div
        ref={chartsContainerRef}
        className={cn(
          "flex-1 min-h-0",
          // ≤ 2 graphes : flex column, chaque graphe occupe l'espace restant (50/50 si 2)
          // > 2 graphes : grid avec scroll, hauteur fixe par graphe
          groupesParUnite.length <= 2
            ? "flex flex-col gap-4 overflow-hidden"
            : "overflow-y-auto no-scrollbar",
        )}
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : groupesParUnite.length === 0 ? (
          <EmptyState
            title="Aucun relevé sur cette période"
            description={offsetDays !== 0 ? "Appuyez sur Échap pour revenir à l'historique récent." : undefined}
          />
        ) : groupesParUnite.length <= 2 ? (
          // 1 ou 2 graphes : pleine hauteur partagée équitablement, pas de scroll
          groupesParUnite.map((g) => (
            <ChartCard
              key={`${g.unite}-${g.kind}`}
              groupe={g}
              jalons={jalons}
              formatLabel={formatLabel}
              onPointClick={(idOt) => navigate(`/ordres-travail/${idOt}`)}
              fillParent
            />
          ))
        ) : (
          // 3+ graphes : grid avec hauteur fixe, scroll vertical
          <div className="grid grid-cols-1 gap-4">
            {groupesParUnite.map((g) => (
              <ChartCard
                key={`${g.unite}-${g.kind}`}
                groupe={g}
                jalons={jalons}
                formatLabel={formatLabel}
                onPointClick={(idOt) => navigate(`/ordres-travail/${idOt}`)}
                fixedHeight={360}
              />
            ))}
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

interface ChartCardProps {
  groupe: GroupeUnite;
  jalons: string[];
  formatLabel: (iso: string) => string;
  onPointClick: (idOt: number) => void;
  /// Mode "fluide" : la carte occupe l'espace disponible du parent (`flex-1`) et le graphe
  /// remplit ce qui reste après le titre. Utilisé quand 1 ou 2 graphes seulement.
  fillParent?: boolean;
  /// Mode "scroll" : hauteur fixe en pixels, utilisé quand 3+ graphes.
  fixedHeight?: number;
}

function ChartCard({ groupe, jalons, formatLabel, onPointClick, fillParent, fixedHeight }: ChartCardProps) {
  const { unite, kind, series, totalPoints, totalResets, titre } = groupe;
  return (
    <Card className={cn(fillParent && "flex flex-1 flex-col min-h-0")}>
      <CardContent className={cn("p-3", fillParent && "flex flex-1 flex-col min-h-0")}>
        <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
          <h3 className="font-medium truncate">{titre}</h3>
          <span className="text-xs text-muted-foreground shrink-0">
            {totalPoints} relevé{totalPoints > 1 ? "s" : ""} · {unite}
            {kind === "bar-delta" && " · consommation par période"}
            {totalResets > 0 && ` · ${totalResets} changement${totalResets > 1 ? "s" : ""} de compteur`}
          </span>
        </div>
        <div className={cn(fillParent && "flex-1 min-h-0")}>
          {kind === "line" && (
            <LineChartTimeSeries
              series={series}
              unite={unite}
              onPointClick={onPointClick}
              height={fixedHeight}
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
              height={fixedHeight}
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
              height={fixedHeight}
              formatLabel={formatLabel}
              extraDates={jalons}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/// Date ISO du relevé le plus récent dans toutes les opérations, ou null si vide.
function computeMaxDate(operations: OperationReleves[]): string | null {
  let maxDate = "";
  for (const op of operations) {
    for (const p of op.points) {
      if (p.date_releve > maxDate) maxDate = p.date_releve;
    }
  }
  return maxDate || null;
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

