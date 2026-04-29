import { addWeeks, differenceInCalendarDays, isSameISOWeek, startOfDay, startOfWeek } from "date-fns";

interface StatutConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

const FALLBACK: StatutConfig = { label: "Inconnu", variant: "outline" };

/// IDs des statuts agrégés produits par computeAggregateStatutId.
export type StatutGammeId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Animation pulsation pour les statuts "Réouvert(e)" */
export const ANIMATE_HEARTBEAT = "animate-[heartbeat_1.8s_ease-in-out_infinite]";

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
  16: { label: "Mois prochain", variant: "outline", className: "border-indigo-400 text-indigo-700 dark:border-indigo-600 dark:text-indigo-400" },
  2: { label: "En cours", variant: "outline", className: "border-blue-400 text-blue-700 dark:border-blue-600 dark:text-blue-400" },
  3: { label: "Clôturé", variant: "outline", className: "border-green-400 text-green-700 dark:border-green-600 dark:text-green-400" },
  4: { label: "Annulé", variant: "outline", className: "border-yellow-400 text-yellow-700 dark:border-yellow-600 dark:text-yellow-400" },
  5: { label: "Réouvert", variant: "outline", className: `border-orange-400 text-orange-700 dark:border-orange-600 dark:text-orange-400 ${ANIMATE_HEARTBEAT}` },
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
  3: { label: "Réouverte", variant: "outline", className: `border-orange-300 text-orange-700 dark:border-orange-600 dark:text-orange-400 ${ANIMATE_HEARTBEAT}` },
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
  7: { label: "Réouvert", variant: "outline", className: `border-orange-400 text-orange-700 dark:border-orange-600 dark:text-orange-400 ${ANIMATE_HEARTBEAT}` },
  8: { label: "Non assignée", variant: "outline" },
  9: { label: "Inactive", variant: "outline", className: "line-through opacity-60" },
  10: { label: "Mois prochain", variant: "outline", className: "border-indigo-400 text-indigo-700 dark:border-indigo-600 dark:text-indigo-400" },
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

export type ProximiteWindow =
  | "cette_semaine"
  | "semaine_prochaine"
  | "ce_mois"
  | "mois_prochain"
  | null;

/// Fenêtre temporelle d'une date prévue — cascade calendaire pure.
///   • Cette semaine ISO     → date dans la même semaine ISO que today
///                              (y compris jours déjà passés mais ≥ lundi)
///   • Semaine prochaine ISO → date dans la semaine ISO suivante
///   • Ce mois               → 0 ≤ distance ≤ 30 jours
///   • Mois prochain         → 30 < distance ≤ 60 jours
///   • null                  → date strictement antérieure au lundi de la
///                              semaine en cours (gérée par le retard amont)
///                              OU plus lointaine que les fenêtres ci-dessus
export function getProximiteWindow(prochaineDate: string): ProximiteWindow {
  const today = startOfDay(new Date());
  const next = startOfDay(new Date(prochaineDate));
  // Cette semaine ISO en premier : un OT prévu lundi qu'on consulte mardi de
  // la même semaine doit rester "Cette semaine" (distance négative mais même
  // semaine ISO). Le retard est filtré en amont par getEffectiveOtStatutId.
  if (isSameISOWeek(next, today)) return "cette_semaine";
  const distance = differenceInCalendarDays(next, today);
  if (distance < 0) return null;
  if (isSameISOWeek(next, addWeeks(today, 1))) return "semaine_prochaine";
  if (distance <= 30) return "ce_mois";
  if (distance <= 60) return "mois_prochain";
  return null;
}

/// Mapping jours_periodicite → jours_valide.
/// Doit rester synchronisé avec les seeds de la table SQL `periodicites`
/// (voir `src-tauri/migrations/001_initial_schema.sql`, INSERT periodicites).
/// jours_valide = période de grâce après laquelle un OT entre dans sa fenêtre
/// de pertinence d'affichage : tant que distance > jours_valide, l'OT reste
/// "Programmé / Planifié" ; au-delà, cascade Ce mois / Mois prochain.
const JOURS_VALIDE_PAR_PERIODICITE: Record<number, number> = {
  7: 5,        // Hebdomadaire
  14: 10,      // Bihebdomadaire
  30: 25,      // Mensuel
  42: 32,      // Sesquimestriel
  60: 45,      // Bimestriel
  90: 60,      // Trimestriel
  120: 90,     // Quadrimestriel
  180: 120,    // Semestriel
  365: 270,    // Annuel
  730: 540,    // Biennale
  1095: 730,   // Triennal
  1460: 1080,  // Quadriennal
  1825: 1200,  // Quinquennal
  3650: 2920,  // Décennal
};

function getJoursValide(joursPeriodicite: number): number {
  return JOURS_VALIDE_PAR_PERIODICITE[joursPeriodicite] ?? Math.floor(joursPeriodicite * 0.8);
}

/// Statut effectif à afficher pour un OT — source de vérité unique partagée par
/// la liste OT, la page détail, le dashboard et le planning.
///
/// Cascade :
///   1. Statuts terminaux/spéciaux (En cours / Clôturé / Annulé / Réouvert) → tels quels
///   2. Retard (date < lundi de la semaine ISO courante) → 12
///   3. Cette semaine ISO → 13 (toujours, dès que la date est dans la semaine en cours)
///   4. Semaine prochaine ISO → 14 (idem, fenêtre calendaire pure)
///   5. Période de grâce : distance > jours_valide → fallback (gamme encore "valide")
///   6. Ce mois (≤ 30 j) → 15
///   7. Mois prochain (30 < distance ≤ 60 j) → 16
///   8. Sinon → 11 Programmé (auto) ou 1 Planifié (manuel)
export function getEffectiveOtStatutId(ot: {
  id_statut_ot: number;
  date_prevue: string;
  est_automatique?: number;
  jours_periodicite?: number;
}): number {
  if (ot.id_statut_ot !== 1) return ot.id_statut_ot;

  const today = startOfDay(new Date());
  const next = startOfDay(new Date(ot.date_prevue));
  const lundiCourant = startOfWeek(today, { weekStartsOn: 1 });
  if (next < lundiCourant) return 12;

  const w = getProximiteWindow(ot.date_prevue);
  // Cette semaine / Semaine prochaine : fenêtre calendaire absolue, pas de grâce.
  if (w === "cette_semaine") return 13;
  if (w === "semaine_prochaine") return 14;

  const fallback = ot.est_automatique === 1 ? 11 : 1;

  // Au-delà : grâce pour les statuts "Ce mois / Mois prochain".
  // Si la distance dépasse la période de validité de la gamme, on reste neutre
  // (Programmé / Planifié) — l'OT n'est pas encore dans sa fenêtre de pertinence.
  if (ot.jours_periodicite != null) {
    const distance = differenceInCalendarDays(next, today);
    if (distance > getJoursValide(ot.jours_periodicite)) return fallback;
  }

  if (w === "ce_mois") return 15;
  if (w === "mois_prochain") return 16;
  return fallback;
}

/// Statut agrégé d'un conteneur (domaine, famille) ou item (gamme, équipement).
/// Cascade : inactif → vide → retard → réouvert → en cours → sans OT → proximité → validé.
/// Le retard est prioritaire sur la réouverture (manquement direct vs retravail).
export function computeAggregateStatutId(input: {
  isEmpty?: boolean;
  allInactive?: boolean;
  hasUnassigned?: boolean;
  nbReouvert: number;
  nbRetard: number;
  nbEnCours: number;
  prochaineDate: string | null;
}): StatutGammeId {
  if (input.allInactive) return 9;
  if (input.isEmpty) return 8;
  if (input.nbRetard > 0) return 6;
  if (input.nbReouvert > 0) return 7;
  if (input.nbEnCours > 0) return 2;
  if (input.hasUnassigned) return 8;
  if (input.prochaineDate) {
    const w = getProximiteWindow(input.prochaineDate);
    if (w === "cette_semaine") return 3;
    if (w === "semaine_prochaine") return 4;
    if (w === "ce_mois") return 5;
    if (w === "mois_prochain") return 10;
  }
  return 1;
}

export type { StatutConfig };
