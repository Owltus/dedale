import type { OperationExecution } from "@/lib/types/ordres-travail";

/// Une opération est une mesure quantitative dès qu'elle a une unité ou un seuil
/// (le trigger SQL impose une unité aux types Mesure ; les seuils sont optionnels).
export function isMesureOp(
  op: Pick<OperationExecution, "unite_symbole" | "seuil_minimum" | "seuil_maximum">,
): boolean {
  return (
    op.unite_symbole !== null ||
    op.seuil_minimum !== null ||
    op.seuil_maximum !== null
  );
}
