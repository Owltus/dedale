import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useConsumeRestoreFlag } from "@/hooks/use-backup";
import { formatDateTime } from "@/lib/utils/format";

/// Composant invisible — affiche un toast unique au boot si une restauration
/// vient d'être appliquée. Le marqueur est consommé côté Rust pour qu'il ne
/// ressorte qu'une seule fois.
export function BootNotices() {
  const { mutateAsync: consumeFlag } = useConsumeRestoreFlag();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    consumeFlag({})
      .then((info) => {
        if (info) {
          toast.success("Restauration appliquée", {
            description: `Sauvegarde restaurée le ${formatDateTime(info.created_at)}.`,
            duration: 6000,
          });
        }
      })
      .catch(() => {});
  }, [consumeFlag]);

  return null;
}
