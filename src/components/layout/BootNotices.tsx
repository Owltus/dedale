import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useConsumeRestoreFlag, useDerniereSauvegarde } from "@/hooks/use-backup";
import { daysSince, formatDateTime } from "@/lib/utils/format";

/// Seuil au-delà duquel on rappelle à l'utilisateur de faire une sauvegarde
const STALE_BACKUP_DAYS = 30;

/// Composant invisible — déclenche les notifications de boot une seule fois
/// par session (toast post-restauration + rappel de fraîcheur). Le marqueur de
/// restauration est consommé côté Rust pour qu'il ne ressorte qu'une fois.
export function BootNotices() {
  const consumeFlag = useConsumeRestoreFlag();
  const { data: derniereSauvegarde, isSuccess } = useDerniereSauvegarde();
  const ranRef = useRef(false);

  useEffect(() => {
    // On attend la première donnée de fraîcheur avant de fire pour pouvoir
    // empiler les deux toasts (restore + ancienneté) sans race d'ordre.
    if (ranRef.current || !isSuccess) return;
    ranRef.current = true;

    consumeFlag
      .mutateAsync({})
      .then((info) => {
        if (info) {
          toast.success("Restauration appliquée", {
            description: `Sauvegarde restaurée le ${formatDateTime(info.created_at)}.`,
            duration: 6000,
          });
        }
      })
      .catch(() => {});

    const days = daysSince(derniereSauvegarde ?? null);
    if (days !== null && days > STALE_BACKUP_DAYS) {
      toast.warning("Sauvegarde ancienne", {
        description: `Votre dernière sauvegarde date d'il y a ${days} jours. Pensez à en créer une nouvelle.`,
        duration: 8000,
      });
    }
  }, [isSuccess, derniereSauvegarde, consumeFlag]);

  return null;
}
