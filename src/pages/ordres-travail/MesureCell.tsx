import { memo, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDelta, formatNumber } from "@/lib/utils/format";
import { isMesureOp } from "@/lib/utils/operations";
import { isCounterUnit } from "@/lib/utils/unites";
import type {
  HistoriquePoint,
  OperationExecution,
} from "@/lib/types/ordres-travail";

function formatPlaceholder(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `≥ ${min}`;
  if (max !== null) return `≤ ${max}`;
  return "";
}

/// Trouve le relevé immédiatement antérieur à `currentDate` dans un historique trié DESC.
/// Si l'OT courant n'a pas encore de date d'exécution, fallback sur le 1er relevé valide
/// (= le plus récent absolu).
function findPreviousReleve(
  history: HistoriquePoint[],
  currentDate: string | null,
): HistoriquePoint | null {
  if (!currentDate) {
    return history.find((p) => p.valeur_mesuree !== null) ?? null;
  }
  return history.find((p) => {
    if (p.valeur_mesuree === null) return false;
    return (p.date_execution ?? p.date_prevue) < currentDate;
  }) ?? null;
}

interface MesureCellProps {
  op: OperationExecution;
  history: HistoriquePoint[];
  editable: boolean;
  onMesureChange: (rawValue: string) => void;
}

export const MesureCell = memo(function MesureCell({
  op,
  history,
  editable,
  onMesureChange,
}: MesureCellProps) {
  // Détection cumulative basée sur les valeurs réelles (current + historique).
  const seriesValues = useMemo(
    () =>
      [op.valeur_mesuree, ...history.map((p) => p.valeur_mesuree)]
        .filter((v): v is number => v !== null)
        .reverse(),
    [op.valeur_mesuree, history],
  );

  if (!isMesureOp(op)) {
    return <span className="text-muted-foreground">—</span>;
  }

  const unit = op.unite_symbole ?? "";
  // Le relevé "précédent" pour comparer = celui IMMÉDIATEMENT antérieur à l'OT courant
  // (pas le plus récent absolu — sinon, sur un OT du passé, on comparerait à un relevé
  // futur, ce qui n'a aucun sens et déclenche une fausse détection "nouveau compteur").
  const previous = findPreviousReleve(history, op.date_execution);
  const isCounter = isCounterUnit(seriesValues, op.unite_symbole);

  const hasSeuils = op.seuil_minimum !== null || op.seuil_maximum !== null;
  const conformiteColor =
    hasSeuils && op.est_conforme !== null
      ? op.est_conforme === 1
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-destructive"
      : "";

  return (
    <div className="flex flex-col items-center gap-1">
      {editable ? (
        <Input
          key={`${op.id_operation_execution}-${op.valeur_mesuree}`}
          type="number"
          step="any"
          className={cn("h-8 w-full text-center font-medium", conformiteColor)}
          placeholder={formatPlaceholder(op.seuil_minimum, op.seuil_maximum)}
          defaultValue={op.valeur_mesuree ?? ""}
          onBlur={(e) => onMesureChange(e.target.value)}
        />
      ) : (
        <span className={cn("font-medium", conformiteColor)}>
          {op.valeur_mesuree !== null
            ? `${formatNumber(op.valeur_mesuree)} ${unit}`
            : "—"}
        </span>
      )}

      {isCounter && op.valeur_mesuree !== null && previous?.valeur_mesuree !== null && previous?.valeur_mesuree !== undefined && (
        <CounterDelta
          current={op.valeur_mesuree}
          previous={previous.valeur_mesuree}
          unit={unit}
        />
      )}
    </div>
  );
});

interface CounterDeltaProps {
  current: number;
  previous: number;
  unit: string;
}

/// Affiche soit la consommation (Δ ≥ 0), soit un texte de remplacement de compteur (Δ < 0).
/// Un Δ négatif sur un cumulatif est physiquement impossible : c'est la signature d'un
/// remplacement physique du compteur (l'index du nouveau démarre plus bas que l'ancien).
function CounterDelta({ current, previous, unit }: CounterDeltaProps) {
  const delta = current - previous;
  const isReplacement = delta < 0;
  const label = isReplacement
    ? "⟳ nouveau compteur"
    : `${formatDelta(delta)} ${unit}`;
  const tooltip = isReplacement
    ? `Index passé de ${formatNumber(previous)} à ${formatNumber(current)} ${unit} — remplacement détecté`
    : "Consommation depuis le relevé précédent";
  const colorClass = isReplacement
    ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("text-xs cursor-help", colorClass)} />}>
        {label}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
