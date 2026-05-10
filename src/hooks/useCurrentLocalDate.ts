import { useEffect, useState } from "react";
import { toLocalIsoDate } from "@/lib/utils/format";

/// Renvoie la date du jour locale (YYYY-MM-DD) et force un re-render au
/// passage de minuit local. À utiliser comme segment de queryKey pour les
/// queries dont le résultat dépend de la notion de « aujourd'hui » /
/// « cette semaine » côté backend.
export function useCurrentLocalDate(): string {
  const [date, setDate] = useState(toLocalIsoDate);

  useEffect(() => {
    const now = new Date();
    // +1s de marge : garantit qu'au déclenchement on est bien le jour suivant,
    // même si setTimeout dérive de quelques ms.
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(() => setDate(toLocalIsoDate()), nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(timer);
  }, [date]);

  return date;
}
