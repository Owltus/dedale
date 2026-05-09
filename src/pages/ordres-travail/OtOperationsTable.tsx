import { useMemo } from "react";
import { Check, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HistoriquePoint, OperationExecution } from "@/lib/types/ordres-travail";
import { getStatutOperation, STATUTS_OPERATION } from "@/lib/utils/statuts";
import { formatDate, todayIso } from "@/lib/utils/format";
import { isMesureOp } from "@/lib/utils/operations";
import { MesureCell } from "./MesureCell";

// IDs sélectionnables côté utilisateur (statut 4 « Annulée » est réservé au système)
const OP_STATUT_IDS: readonly number[] = [1, 2, 3, 5];
const OP_STATUTS: Record<string, string> = Object.fromEntries(
  OP_STATUT_IDS.map((id) => [String(id), STATUTS_OPERATION[id]?.label ?? ""])
);
const OP_STATUTS_ENTRIES = Object.entries(OP_STATUTS);

const rowBg = (statut: number) => {
  if (statut === 3) return "bg-green-50 dark:bg-green-950/20";
  if (statut === 2) return "bg-yellow-50 dark:bg-yellow-950/20";
  if (statut === 5) return "bg-red-50 dark:bg-red-950/20";
  return "";
};

/**
 * Miroir du trigger SQL `auto_calcul_conformite` — permet d'afficher la conformité
 * immédiatement dans le brouillon, sans attendre un aller-retour backend.
 */
function computeConformite(
  seuilMin: number | null,
  seuilMax: number | null,
  valeur: number | null,
): number | null {
  if (valeur === null) return null;
  if (seuilMin === null && seuilMax === null) return null;
  if (seuilMin !== null && valeur < seuilMin) return 0;
  if (seuilMax !== null && valeur > seuilMax) return 0;
  return 1;
}

/** Champs éditables d'une opération en mode brouillon. */
export type OpDraftPatch = Partial<
  Pick<OperationExecution, "id_statut_operation" | "valeur_mesuree" | "est_conforme" | "date_execution" | "commentaires">
>;

export type OpDraftChanges = Map<number, OpDraftPatch>;

export interface OtOperationsTableProps {
  operations: OperationExecution[];
  isTerminal: boolean;
  draftChanges: OpDraftChanges;
  onDraftChange: (changes: OpDraftChanges) => void;
  onSaveDraft: () => void;
  onDiscardDraft: () => void;
  isSaving?: boolean;
  /** Map id_operation_execution → historique des derniers relevés (autres OT, même opération mère) */
  historiqueByOp?: Map<number, HistoriquePoint[]>;
}

/** Fusionne l'état serveur avec les modifications locales en brouillon. */
function mergeOp(op: OperationExecution, patch?: OpDraftPatch): OperationExecution {
  if (!patch) return op;
  return { ...op, ...patch };
}

export function OtOperationsTable({
  operations,
  isTerminal,
  draftChanges,
  onDraftChange,
  onSaveDraft,
  onDiscardDraft,
  isSaving = false,
  historiqueByOp,
}: OtOperationsTableProps) {
  // Ajoute ou met à jour un patch dans le brouillon
  const patchDraft = (opId: number, patch: OpDraftPatch) => {
    const next = new Map(draftChanges);
    const current = next.get(opId) ?? {};
    next.set(opId, { ...current, ...patch });
    onDraftChange(next);
  };

  // Applique un changement de statut avec les règles de cohérence dates.
  // Pré-remplissage à aujourd'hui pour statut 2/3 si aucune date — l'utilisateur
  // peut ensuite la corriger inline dans la colonne Date avant d'Enregistrer.
  const applyStatusChange = (op: OperationExecution, newStatus: number) => {
    const currentDate = mergeOp(op, draftChanges.get(op.id_operation_execution)).date_execution;

    if (newStatus === 2 || newStatus === 3) {
      patchDraft(op.id_operation_execution, {
        id_statut_operation: newStatus,
        date_execution: currentDate ?? todayIso(),
      });
    } else if (newStatus === 1) {
      // Planifiée : CHECK SQL exige date_execution NULL
      patchDraft(op.id_operation_execution, {
        id_statut_operation: 1,
        date_execution: null,
      });
    } else if (newStatus === 5) {
      patchDraft(op.id_operation_execution, { id_statut_operation: 5 });
    }
  };

  const handleStatusSelect = (op: OperationExecution, newStatus: number) => {
    applyStatusChange(op, newStatus);
  };

  const handleDoubleClick = (op: OperationExecution) => {
    const merged = mergeOp(op, draftChanges.get(op.id_operation_execution));
    if (isTerminal || merged.id_statut_operation === 4) return;
    const hasMesure = isMesureOp(merged);

    if (merged.id_statut_operation === 3) {
      // Double-clic sur une op Terminée : reset complet en un geste (raccourci expert)
      patchDraft(op.id_operation_execution, {
        id_statut_operation: 1,
        valeur_mesuree: null,
        est_conforme: null,
        date_execution: null,
        commentaires: null,
      });
    } else if (!hasMesure) {
      applyStatusChange(op, 3);
    }
  };

  const handleMesureChange = (op: OperationExecution, rawValue: string) => {
    const merged = mergeOp(op, draftChanges.get(op.id_operation_execution));
    const v = rawValue ? Number(rawValue) : null;
    if (v === merged.valeur_mesuree) return;
    if (v !== null) {
      patchDraft(op.id_operation_execution, {
        id_statut_operation: 3,
        valeur_mesuree: v,
        est_conforme: computeConformite(op.seuil_minimum, op.seuil_maximum, v),
        date_execution: merged.date_execution ?? todayIso(),
      });
    } else {
      // Vider la mesure : repasse en Planifiée et efface la date (CHECK SQL)
      patchDraft(op.id_operation_execution, {
        id_statut_operation: 1,
        valeur_mesuree: null,
        est_conforme: null,
        date_execution: null,
      });
    }
  };

  const handleDateChange = (op: OperationExecution, value: string | null) => {
    patchDraft(op.id_operation_execution, { date_execution: value });
  };

  const mergedOperations = useMemo(
    () => operations.map((op) => mergeOp(op, draftChanges.get(op.id_operation_execution))),
    [operations, draftChanges]
  );

  const isDirty = draftChanges.size > 0;

  const anyHasMesure = useMemo(() => operations.some(isMesureOp), [operations]);

  return (
    <div className="flex flex-1 flex-col rounded-md border min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="px-3 py-2">Opération</TableHead>
              {anyHasMesure && <TableHead className="px-3 py-2 text-center w-44">Mesure</TableHead>}
              <TableHead className="px-3 py-2 text-center w-36">Date</TableHead>
              <TableHead className="px-3 py-2 text-center w-32">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mergedOperations.map((op) => {
              const cfg = getStatutOperation(op.id_statut_operation);
              const disabled = isTerminal || op.id_statut_operation === 4;
              const hasMesure = isMesureOp(op);
              return (
                <TableRow
                  key={op.id_operation_execution}
                  className={`${rowBg(op.id_statut_operation)} ${!disabled && (!hasMesure || op.id_statut_operation === 3) ? "cursor-pointer" : ""}`}
                  onDoubleClick={() => handleDoubleClick(op)}
                >
                  <TableCell className="px-3 py-2 whitespace-normal">
                    <div>{op.nom_operation}</div>
                    <div className="text-xs text-muted-foreground">{op.type_operation}</div>
                  </TableCell>
                  {anyHasMesure && (
                    <TableCell className="px-3 py-1 text-center">
                      <MesureCell
                        op={op}
                        history={historiqueByOp?.get(op.id_operation_execution) ?? []}
                        editable={hasMesure && !disabled}
                        onMesureChange={(v) => handleMesureChange(op, v)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="px-3 py-1 text-center">
                    {disabled ? (
                      <span className="text-muted-foreground">{formatDate(op.date_execution)}</span>
                    ) : (
                      <Input
                        key={`${op.id_operation_execution}-date-${op.date_execution}`}
                        type="date"
                        className="h-8 w-full text-center"
                        defaultValue={op.date_execution ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== op.date_execution) handleDateChange(op, v);
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-1 text-center">
                    {disabled ? (
                      <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>
                    ) : (
                      <Select
                        value={String(op.id_statut_operation)}
                        items={OP_STATUTS}
                        onValueChange={(v) => handleStatusSelect(op, Number(v))}
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OP_STATUTS_ENTRIES.map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {operations.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Aucune opération</p>
          </div>
        )}
      </div>
      {isDirty && (
        <div className="flex items-center justify-end gap-2 border-t bg-primary/5 px-3 py-2 shrink-0">
          <Button size="sm" variant="outline" onClick={onDiscardDraft} disabled={isSaving}>
            <Undo2 className="size-4" />
            Annuler
          </Button>
          <Button size="sm" onClick={onSaveDraft} disabled={isSaving}>
            <Check className="size-4" />
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      )}
    </div>
  );
}
