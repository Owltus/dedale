import { useEffect, useState } from "react";

interface Options {
  /// Pas de décalage appliqué à chaque ←/→ (dans l'unité de l'appelant : semaines, jours…)
  step: number;
  /// Si true, Home et Escape remettent l'offset à 0
  allowReset?: boolean;
}

/**
 * Raccourcis clavier ←/→ (et Home/Escape) pour piloter un offset temporel partagé.
 * Ignore les événements venant d'inputs/textareas pour ne pas perturber la saisie.
 */
export function useTemporalNavigation({ step, allowReset = false }: Options) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setOffset((o) => o - step); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setOffset((o) => o + step); }
      else if (allowReset && (e.key === "Home" || e.key === "Escape")) {
        e.preventDefault(); setOffset(0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, allowReset]);

  return [offset, setOffset] as const;
}
