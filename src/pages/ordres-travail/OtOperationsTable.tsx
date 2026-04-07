import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { OperationExecution } from "@/lib/types/ordres-travail";
import { getStatutOperation } from "@/lib/utils/statuts";
import { formatDate } from "@/lib/utils/format";
import type { UseMutationResult } from "@tanstack/react-query";
import type { OrdreDetailComplet } from "@/lib/types/ordres-travail";

/// Statuts opération sélectionnables
const OP_STATUTS = [
  { id: 1, label: "Planifiée" },
  { id: 2, label: "En cours" },
  { id: 3, label: "Terminée" },
  { id: 5, label: "N/A" },
];

/** Couleur de fond selon le statut de l'opération */
const rowBg = (statut: number) => {
  if (statut === 3) return "bg-green-50 dark:bg-green-950/20";   // Terminée
  if (statut === 2) return "bg-yellow-50 dark:bg-yellow-950/20"; // En cours
  if (statut === 5) return "bg-red-50 dark:bg-red-950/20";       // N/A
  return "";                                                       // Planifiée / Annulée
};

export interface OtOperationsTableProps {
  operations: OperationExecution[];
  isTerminal: boolean;
  updateOpExec: UseMutationResult<OrdreDetailComplet, unknown, { id: number; input: Record<string, unknown> }>;
}

export function OtOperationsTable({ operations, isTerminal, updateOpExec }: OtOperationsTableProps) {

  const handleOpUpdate = async (op: OperationExecution, field: string, value: unknown) => {
    // Les champs dans input gardent le snake_case (struct Rust désérialisé par serde)
    const input: Record<string, unknown> = {
      id_statut_operation: op.id_statut_operation,
      valeur_mesuree: op.valeur_mesuree,
      est_conforme: op.est_conforme,
      date_execution: op.date_execution,
      commentaires: op.commentaires,
    };
    input[field] = value;

    // Cohérence date/statut selon la contrainte SQL
    if (field === "id_statut_operation") {
      if (value === 2 || value === 3) {
        // En cours / Terminée → date obligatoire
        if (!input.date_execution) input.date_execution = new Date().toISOString().slice(0, 10);
      } else if (value === 1) {
        // Planifiée → date interdite
        input.date_execution = null;
      }
    }

    try {
      await updateOpExec.mutateAsync({ id: op.id_operation_execution, input } as never);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleDoubleClick = async (op: OperationExecution) => {
    if (isTerminal || op.id_statut_operation === 4) return;
    const hasMesure = op.seuil_minimum !== null || op.seuil_maximum !== null;

    if (op.id_statut_operation === 3) {
      try {
        await updateOpExec.mutateAsync({ id: op.id_operation_execution, input: {
          id_statut_operation: 1, valeur_mesuree: null, est_conforme: null, date_execution: null, commentaires: null,
        } } as never);
      } catch (e) { toast.error(String(e)); }
    } else if (!hasMesure) {
      handleOpUpdate(op, "id_statut_operation", 3);
    }
  };

  const handleMesureChange = async (op: OperationExecution, rawValue: string) => {
    const v = rawValue ? Number(rawValue) : null;
    if (v === op.valeur_mesuree) return;
    const newStatut = v !== null ? 3 : 1;
    try {
      await updateOpExec.mutateAsync({ id: op.id_operation_execution, input: {
        id_statut_operation: newStatut, valeur_mesuree: v, est_conforme: op.est_conforme,
        date_execution: newStatut === 3 ? (op.date_execution ?? new Date().toISOString().slice(0, 10)) : null,
        commentaires: op.commentaires,
      } } as never);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex flex-1 flex-col rounded-md border min-h-0 overflow-y-auto no-scrollbar">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b bg-background">
            <th className="px-3 py-2 text-left font-medium">Opération</th>
            <th className="px-3 py-2 text-left font-medium w-32">Statut</th>
            <th className="px-3 py-2 text-left font-medium w-28">Mesure</th>
            <th className="px-3 py-2 text-left font-medium w-28">Conforme</th>
            <th className="px-3 py-2 text-left font-medium w-36">Date</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => {
            const cfg = getStatutOperation(op.id_statut_operation);
            const disabled = isTerminal || op.id_statut_operation === 4;
            const hasMesure = op.seuil_minimum !== null || op.seuil_maximum !== null;
            return (
              <tr
                key={op.id_operation_execution}
                className={`border-b ${rowBg(op.id_statut_operation)} ${!disabled && (!hasMesure || op.id_statut_operation === 3) ? "cursor-pointer" : ""}`}
                onDoubleClick={() => handleDoubleClick(op)}
              >
                <td className="px-3 py-2">
                  <div>{op.nom_operation}</div>
                  <div className="text-xs text-muted-foreground">{op.type_operation}</div>
                </td>
                <td className="px-3 py-1">
                  {disabled ? (
                    <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>
                  ) : (
                    <select
                      className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
                      value={op.id_statut_operation}
                      onChange={(e) => handleOpUpdate(op, "id_statut_operation", Number(e.target.value))}
                    >
                      {OP_STATUTS.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-1">
                  {hasMesure && !disabled ? (
                    <Input
                      key={`${op.id_operation_execution}-${op.valeur_mesuree}`}
                      type="number"
                      step="any"
                      className="h-8 w-full"
                      placeholder={op.seuil_minimum !== null && op.seuil_maximum !== null
                        ? `${op.seuil_minimum}–${op.seuil_maximum}`
                        : ""}
                      defaultValue={op.valeur_mesuree ?? ""}
                      onBlur={(e) => handleMesureChange(op, e.target.value)}
                    />
                  ) : hasMesure ? (
                    <span>{op.valeur_mesuree !== null ? `${op.valeur_mesuree} ${op.unite_symbole ?? ""}` : "—"}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-1">
                  {disabled ? (
                    op.est_conforme === null ? "—" : op.est_conforme === 1
                      ? <Badge variant="default" className="bg-green-100 text-green-800">Oui</Badge>
                      : <Badge variant="destructive">Non</Badge>
                  ) : (
                    <select
                      className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
                      value={op.est_conforme ?? ""}
                      onChange={(e) => handleOpUpdate(op, "est_conforme", e.target.value !== "" ? Number(e.target.value) : null)}
                    >
                      <option value="">—</option>
                      <option value="1">Oui</option>
                      <option value="0">Non</option>
                    </select>
                  )}
                </td>
                <td className="px-3 py-1">
                  {disabled ? (
                    <span className="text-muted-foreground">{formatDate(op.date_execution)}</span>
                  ) : (
                    <Input
                      key={`${op.id_operation_execution}-date-${op.date_execution}`}
                      type="date"
                      className="h-8 w-full"
                      defaultValue={op.date_execution ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        if (v !== op.date_execution) handleOpUpdate(op, "date_execution", v);
                      }}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-1 items-center justify-center">
        {operations.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune opération</p>
        )}
      </div>
    </div>
  );
}
