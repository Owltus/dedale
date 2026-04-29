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

interface MesureCellProps {
  op: OperationExecution;
  history: HistoriquePoint[];
  editable: boolean;
  onMesureChange: (rawValue: string) => void;
}

export function MesureCell({ op, history, editable, onMesureChange }: MesureCellProps) {
  if (!isMesureOp(op)) {
    return <span className="text-muted-foreground">—</span>;
  }

  const isCounter = isCounterUnit(op.unite_symbole);
  const unit = op.unite_symbole ?? "";
  // L'historique est trié DESC et filtré valeur_mesuree IS NOT NULL côté SQL.
  const previous = history[0] ?? null;

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

      {isCounter && op.valeur_mesuree !== null && previous && previous.valeur_mesuree !== null && (
        <Tooltip>
          <TooltipTrigger render={<span className="text-xs text-muted-foreground cursor-help" />}>
            {formatDelta(op.valeur_mesuree - previous.valeur_mesuree)} {unit}
          </TooltipTrigger>
          <TooltipContent>
            Consommation depuis le relevé précédent
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
