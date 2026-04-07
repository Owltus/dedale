import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { ContratListItem } from "@/lib/types/contrats";

// ── Helpers date ──

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

function diffJours(de: string, a: string): number {
  return Math.round((new Date(a).getTime() - new Date(de).getTime()) / 86_400_000);
}

function ajouterMois(date: string, mois: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + mois);
  return d.toISOString().slice(0, 10);
}

function ajouterJours(date: string, jours: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

/// Formate une date en texte long : "15 juin 2026"
function fmtLong(dateStr: string | null): string {
  if (!dateStr) return "date non définie";
  return format(new Date(dateStr), "d MMMM yyyy", { locale: fr });
}

// ── Formatage durée ──

function formatDuree(jours: number): string {
  if (jours < 1) return "moins d'un jour";
  if (jours === 1) return "1 jour";
  if (jours < 30) return `${jours} jours`;
  const totalMois = Math.round(jours / 30.44);
  if (totalMois < 12) return `${totalMois} mois`;
  const annees = Math.floor(jours / 365.25);
  const moisRestants = Math.round((jours % 365.25) / 30.44);
  const txt = annees === 1 ? "1 an" : `${annees} ans`;
  return moisRestants === 0 ? txt : `${txt} et ${moisRestants} mois`;
}

function ordinal(n: number): string {
  return n === 1 ? "1er" : `${n}e`;
}

// ── Types ──

export type StatutContrat = "Actif" | "Signé" | "Préavis" | "Résilié" | "Terminé" | "Archivé" | "Suspendu";

export type AlerteType = "info" | "warning" | "danger";

export interface ContratInfo {
  statut: StatutContrat;
  /// Texte pédagogique décrivant la situation du contrat
  texte: string;
  /// Progression 0–1 (null si non applicable)
  progression: number | null;
  /// Message d'alerte contextuel court
  alerte: string | null;
  alerteType: AlerteType | null;
}

// ── Constructeur raccourci ──

function info(
  statut: StatutContrat,
  texte: string,
  progression: number | null = null,
  alerte: string | null = null,
  alerteType: AlerteType | null = null,
): ContratInfo {
  return { statut, texte, progression, alerte, alerteType };
}

// ── Logique principale ──

export function getContratInfo(c: ContratListItem): ContratInfo {
  const now = aujourdhui();

  if (c.est_archive) {
    return info("Archivé", "Ce contrat est archivé et n'est plus actif.", 1);
  }

  if (c.date_resiliation) {
    const duree = diffJours(c.date_debut, c.date_resiliation);
    return info("Résilié",
      `Ce contrat a été résilié le ${fmtLong(c.date_resiliation)}, après ${formatDuree(duree)} d'activité.`,
      1);
  }

  if (c.date_debut > now) {
    return infoSigne(c, now);
  }

  if (c.date_notification && !c.date_resiliation) {
    return infoPreavis(c, now);
  }

  if (c.date_fin && c.date_fin < now) {
    const duree = diffJours(c.date_debut, c.date_fin);
    return info("Terminé",
      `Ce contrat est arrivé à échéance le ${fmtLong(c.date_fin)}, après ${formatDuree(duree)} d'activité. Il peut être renouvelé ou archivé.`,
      1);
  }

  // ── Actif ──
  const joursEcoules = diffJours(c.date_debut, now);
  const duree = formatDuree(joursEcoules);

  if (c.id_type_contrat === 2) return infoTacite(c, duree, joursEcoules, now);
  if (c.date_fin) return infoDetermine(c, duree, joursEcoules);
  return infoIndetermine(c, duree);
}

// ── Signé ──

function infoSigne(c: ContratListItem, now: string): ContratInfo {
  const joursAvant = diffJours(now, c.date_debut);
  const sig = c.date_signature
    ? `Ce contrat a été signé le ${fmtLong(c.date_signature)}.`
    : "Ce contrat est en attente d'activation.";
  const alerte = joursAvant <= 7 ? `Activation dans ${joursAvant} j` : null;
  return info("Signé",
    `${sig} Il entrera en vigueur le ${fmtLong(c.date_debut)}, soit dans ${formatDuree(joursAvant)}.`,
    null, alerte, alerte ? "info" : null);
}

// ── Préavis ──

function infoPreavis(c: ContratListItem, now: string): ContratInfo {
  const cessation = c.delai_preavis_jours
    ? ajouterJours(c.date_notification!, c.delai_preavis_jours)
    : null;
  const joursRestants = cessation ? diffJours(now, cessation) : null;
  const prog = cessation && c.delai_preavis_jours
    ? Math.min(1, Math.max(0, 1 - joursRestants! / c.delai_preavis_jours))
    : null;

  let texte = `Une notification de résiliation a été envoyée le ${fmtLong(c.date_notification)}.`;
  if (cessation) {
    texte += ` La cessation est prévue le ${fmtLong(cessation)}, au terme du délai de préavis de ${c.delai_preavis_jours} jours.`;
  }

  const alerte = joursRestants != null && joursRestants <= 14 ? `Cessation dans ${joursRestants} j` : null;
  return info("Préavis", texte, prog, alerte, alerte ? "warning" : null);
}

// ── Durée déterminée ──

function infoDetermine(c: ContratListItem, duree: string, joursEcoules: number): ContratInfo {
  const dureeTotale = diffJours(c.date_debut, c.date_fin!);
  const joursRestants = dureeTotale - joursEcoules;
  const prog = dureeTotale > 0 ? Math.min(1, joursEcoules / dureeTotale) : 1;

  let texte = `Ce contrat à durée déterminée est actif depuis ${duree}. `;
  texte += `L'échéance est fixée au ${fmtLong(c.date_fin)}, soit dans ${formatDuree(joursRestants)}. `;

  if (joursRestants <= 30) {
    texte += "L'échéance est imminente et il n'y a pas de reconduction automatique.";
  } else if (joursRestants <= 90) {
    texte += "Sans reconduction automatique, pensez à anticiper le renouvellement.";
  } else {
    texte += "Aucune reconduction automatique n'est prévue, il faudra renouveler manuellement si nécessaire.";
  }

  const alerte = joursRestants <= 30 ? `Expire dans ${joursRestants} j` : joursRestants <= 90 ? `Expire dans ${formatDuree(joursRestants)}` : null;
  const alerteType: AlerteType | null = joursRestants <= 30 ? "danger" : joursRestants <= 90 ? "warning" : null;
  return info("Actif", texte, prog, alerte, alerteType);
}

// ── Indéterminé ──

function infoIndetermine(c: ContratListItem, duree: string): ContratInfo {
  let texte = `Ce contrat à durée indéterminée est actif depuis ${duree}.`;
  if (c.delai_preavis_jours) {
    texte += ` Il peut être résilié à tout moment en respectant un préavis de ${c.delai_preavis_jours} jours.`;
  }
  return info("Actif", texte);
}

// ── Tacite reconduction ──

function infoTacite(c: ContratListItem, duree: string, joursEcoules: number, now: string): ContratInfo {
  if (!c.duree_cycle_mois) {
    let texte = `Ce contrat fonctionne par tacite reconduction et est actif depuis ${duree}.`;
    if (c.delai_preavis_jours) {
      texte += ` Pour résilier, un préavis de ${c.delai_preavis_jours} jours est nécessaire.`;
    }
    return info("Actif", texte);
  }

  const joursCycle = c.duree_cycle_mois * 30.44;
  const cycleActuel = Math.floor(joursEcoules / joursCycle) + 1;
  const dateDebutCycle = ajouterMois(c.date_debut, (cycleActuel - 1) * c.duree_cycle_mois);
  const dateFinCycle = ajouterJours(ajouterMois(c.date_debut, cycleActuel * c.duree_cycle_mois), -1);
  const joursEcoulesCycle = diffJours(dateDebutCycle, now);
  const dureeCycle = diffJours(dateDebutCycle, dateFinCycle);
  const prog = dureeCycle > 0 ? Math.min(1, Math.max(0, joursEcoulesCycle / dureeCycle)) : 0;
  const joursAvantFinCycle = diffJours(now, dateFinCycle);

  let texte = `Ce contrat se renouvelle automatiquement tous les ${c.duree_cycle_mois} mois. `;
  texte += `Il est actif depuis ${duree} et entre dans son ${ordinal(cycleActuel)} cycle. `;

  let alerte: string | null = null;
  let alerteType: AlerteType | null = null;

  if (c.fenetre_resiliation_jours) {
    const debutFenetre = ajouterJours(dateFinCycle, -(c.fenetre_resiliation_jours - 1));

    if (now >= debutFenetre && now <= dateFinCycle) {
      texte += `La fenêtre de résiliation est actuellement ouverte, du ${fmtLong(debutFenetre)} au ${fmtLong(dateFinCycle)}. C'est le moment de notifier si vous souhaitez résilier.`;
      alerte = `Fenêtre ouverte — ${joursAvantFinCycle} j restants`;
      alerteType = "warning";
    } else if (debutFenetre > now) {
      const joursAvantFenetre = diffJours(now, debutFenetre);
      texte += `Pour résilier, il faudra attendre la fenêtre du ${fmtLong(debutFenetre)} au ${fmtLong(dateFinCycle)}`;
      if (c.delai_preavis_jours) {
        texte += `, avec un préavis de ${c.delai_preavis_jours} jours`;
      }
      texte += ".";
      if (joursAvantFenetre <= 30) {
        alerte = `Fenêtre dans ${joursAvantFenetre} j`;
        alerteType = "info";
      }
    }
  } else if (c.delai_preavis_jours) {
    texte += `Vous pouvez le résilier à tout moment en respectant un préavis de ${c.delai_preavis_jours} jours.`;
  }

  if (!alerte && joursAvantFinCycle <= 30) {
    alerte = `Renouvellement dans ${joursAvantFinCycle} j`;
    alerteType = "info";
  }

  return info("Actif", texte, prog, alerte, alerteType);
}
