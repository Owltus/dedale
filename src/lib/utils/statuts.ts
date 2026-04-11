interface StatutConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

const FALLBACK: StatutConfig = { label: "Inconnu", variant: "outline" };

// Statuts OT (ordres de travail)
export const STATUTS_OT: Record<number, StatutConfig> = {
  1: { label: "Planifié", variant: "outline", className: "border-violet-400 text-violet-700 dark:border-violet-600 dark:text-violet-400" },
  11: { label: "Programmé", variant: "outline" },
  // Alias utilisé côté frontend pour les OT en retard (est_en_retard = 1)
  // — pas un vrai statut DB
  12: { label: "En retard", variant: "outline", className: "border-red-400 text-red-700 dark:border-red-600 dark:text-red-400" },
  // Alias de proximité temporelle — pas des vrais statuts DB
  13: { label: "Cette semaine", variant: "outline", className: "border-orange-400 text-orange-700 dark:border-orange-600 dark:text-orange-400" },
  14: { label: "Semaine prochaine", variant: "outline", className: "border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400" },
  15: { label: "Ce mois-ci", variant: "outline", className: "border-teal-400 text-teal-700 dark:border-teal-600 dark:text-teal-400" },
  16: { label: "Cette année", variant: "outline", className: "border-indigo-400 text-indigo-700 dark:border-indigo-600 dark:text-indigo-400" },
  2: { label: "En cours", variant: "outline", className: "border-blue-400 text-blue-700 dark:border-blue-600 dark:text-blue-400" },
  3: { label: "Clôturé", variant: "outline", className: "border-green-400 text-green-700 dark:border-green-600 dark:text-green-400" },
  4: { label: "Annulé", variant: "outline", className: "border-yellow-400 text-yellow-700 dark:border-yellow-600 dark:text-yellow-400" },
  5: { label: "Réouvert", variant: "outline", className: "border-orange-400 text-orange-700 dark:border-orange-600 dark:text-orange-400 animate-[heartbeat_1.8s_ease-in-out_infinite]" },
};

// Statuts opérations d'exécution
export const STATUTS_OPERATION: Record<number, StatutConfig> = {
  1: { label: "En attente", variant: "secondary" },
  2: { label: "En cours", variant: "secondary", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  3: { label: "Terminée", variant: "secondary", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  4: { label: "Annulée", variant: "secondary", className: "line-through opacity-60" },
  5: { label: "Non applicable", variant: "outline" },
};

// Statuts demandes d'intervention
export const STATUTS_DI: Record<number, StatutConfig> = {
  1: { label: "Ouverte", variant: "default" },
  2: { label: "Résolue", variant: "secondary", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  3: { label: "Réouverte", variant: "outline", className: "border-orange-300 text-orange-700 dark:border-orange-600 dark:text-orange-400" },
};

// Priorités
export const PRIORITES: Record<number, StatutConfig> = {
  1: { label: "Urgente", variant: "destructive" },
  2: { label: "Haute", variant: "secondary", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  3: { label: "Normale", variant: "default" },
  4: { label: "Basse", variant: "secondary" },
};

/// Retourne la config du statut OT, avec fallback
export function getStatutOt(id: number): StatutConfig {
  return STATUTS_OT[id] ?? FALLBACK;
}

/// Retourne la config du statut opération, avec fallback
export function getStatutOperation(id: number): StatutConfig {
  return STATUTS_OPERATION[id] ?? FALLBACK;
}

/// Retourne la config du statut DI, avec fallback
export function getStatutDi(id: number): StatutConfig {
  return STATUTS_DI[id] ?? FALLBACK;
}

/// Retourne la config de la priorité, avec fallback
export function getPriorite(id: number): StatutConfig {
  return PRIORITES[id] ?? FALLBACK;
}

// Statuts contrats (clé = string car calculé côté SQL)
export const STATUTS_CONTRAT: Record<string, StatutConfig> = {
  "Actif": { label: "Actif", variant: "secondary", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  "Expiré": { label: "Expiré", variant: "secondary", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  "Résilié": { label: "Résilié", variant: "secondary", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  "Archivé": { label: "Archivé", variant: "secondary", className: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400" },
  "À venir": { label: "À venir", variant: "secondary", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  "Signé": { label: "Signé", variant: "secondary", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  "Préavis": { label: "Préavis", variant: "secondary", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  "Terminé": { label: "Terminé", variant: "secondary", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  "Suspendu": { label: "Suspendu", variant: "secondary", className: "opacity-60" },
};

/// Retourne la config du statut contrat, avec fallback
export function getStatutContrat(statut: string): StatutConfig {
  return STATUTS_CONTRAT[statut] ?? FALLBACK;
}

// Statuts gammes (synthèse de l'état des OT)
export const STATUTS_GAMME: Record<number, StatutConfig> = {
  1: { label: "Validé", variant: "outline", className: "border-green-400 text-green-700 dark:border-green-600 dark:text-green-400" },
  2: { label: "En cours", variant: "outline", className: "border-blue-400 text-blue-700 dark:border-blue-600 dark:text-blue-400" },
  3: { label: "Cette semaine", variant: "outline", className: "border-orange-400 text-orange-700 dark:border-orange-600 dark:text-orange-400" },
  4: { label: "Semaine prochaine", variant: "outline", className: "border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400" },
  5: { label: "Ce mois-ci", variant: "outline", className: "border-teal-400 text-teal-700 dark:border-teal-600 dark:text-teal-400" },
  6: { label: "En retard", variant: "outline", className: "border-red-400 text-red-700 dark:border-red-600 dark:text-red-400" },
  7: { label: "Réouvert", variant: "outline", className: "border-orange-400 text-orange-700 dark:border-orange-600 dark:text-orange-400 animate-[heartbeat_1.8s_ease-in-out_infinite]" },
  8: { label: "Non assignée", variant: "outline" },
  9: { label: "Inactive", variant: "outline", className: "line-through opacity-60" },
};

/// Retourne la config du statut gamme, avec fallback
export function getStatutGamme(id: number): StatutConfig {
  return STATUTS_GAMME[id] ?? FALLBACK;
}

// Statuts familles gammes — réutilise les mêmes configs que STATUTS_GAMME
// (cascade : pire statut des gammes de la famille)
export const STATUTS_FAMILLE_GAMME = STATUTS_GAMME;

/// Retourne la config du statut famille gamme, avec fallback
export function getStatutFamilleGamme(id: number): StatutConfig {
  return STATUTS_FAMILLE_GAMME[id] ?? FALLBACK;
}

/// Calcule le statut de proximité temporelle d'un prochain OT planifié.
/// Retourne 3 (cette semaine), 4 (semaine prochaine), 5 (ce mois-ci), ou null.
export function getProximiteStatutId(
  prochaineDate: string,
  joursPeriodicite: number,
): 3 | 4 | 5 | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(prochaineDate);
  next.setHours(0, 0, 0, 0);
  const diff = Math.ceil((next.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 7 && joursPeriodicite >= 30) return 3;
  if (diff > 7 && diff <= 14 && joursPeriodicite >= 30) return 4;
  if (diff > 14 && diff <= 30 && joursPeriodicite >= 60) return 5;
  return null;
}

/// Calcule le statut agrégé pour un conteneur (domaine, famille) ou un item (gamme, équipement).
/// Cascade de priorité : inactif → vide → réouvert → retard → en cours → sans OT → proximité → validé.
export function computeAggregateStatutId(input: {
  isEmpty?: boolean;
  allInactive?: boolean;
  hasUnassigned?: boolean;
  nbReouvert: number;
  nbRetard: number;
  nbEnCours: number;
  prochaineDate: string | null;
  joursPeriodicite: number;
}): number {
  if (input.allInactive) return 9;
  if (input.isEmpty) return 8;
  if (input.nbReouvert > 0) return 7;
  if (input.nbRetard > 0) return 6;
  if (input.nbEnCours > 0) return 2;
  if (input.hasUnassigned) return 8;
  if (input.prochaineDate) {
    const p = getProximiteStatutId(input.prochaineDate, input.joursPeriodicite);
    if (p) return p;
  }
  return 1;
}

export type { StatutConfig };
