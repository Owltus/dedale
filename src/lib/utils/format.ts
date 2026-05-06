import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ALLOWED_EXTENSIONS } from "@/lib/schemas/documents";

/// Formate une date ISO en format français lisible (dd/MM/yyyy)
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy", { locale: fr });
}

/// Version courte sans l'année (dd/MM) — pour les libellés compacts
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM", { locale: fr });
}

/// Ex. "24/04/2026 (17)" — semaine ISO 8601 (lundi → dimanche)
export function formatDateWithWeek(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy '('II')'", { locale: fr });
}

/// Date du jour au format ISO (YYYY-MM-DD) — valeur par défaut des inputs type="date"
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/// Formate une date pour l'axe X d'un graphique de relevés, selon la périodicité de la gamme.
/// `includeYear` : si false, on omet l'année (utile sur les bar charts qui affichent
/// l'année séparément en filigrane).
/// - ≤ 14 jours (hebdo, bihebdo)         → "avr S17 2026" / "avr S17"
/// - 15-60 jours (mensuel à bimestriel)  → "avril 2026" / "avril"
/// - 61-180 jours (trimestriel/semestriel) → "T2 2026" / "T2"
/// - > 180 jours (annuel et +)           → "2026" (l'année reste, c'est l'unité)
export function formatChartDate(
  dateStr: string | null | undefined,
  joursPeriodicite: number,
  includeYear = true,
): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (joursPeriodicite <= 14) {
    return includeYear
      ? format(date, "MMM 'S'II yyyy", { locale: fr })
      : format(date, "MMM 'S'II", { locale: fr });
  }
  if (joursPeriodicite <= 60) {
    return includeYear
      ? format(date, "MMMM yyyy", { locale: fr })
      : format(date, "MMMM", { locale: fr });
  }
  if (joursPeriodicite <= 180) {
    const trimestre = Math.floor(date.getMonth() / 3) + 1;
    return includeYear ? `T${trimestre} ${date.getFullYear()}` : `T${trimestre}`;
  }
  return format(date, "yyyy", { locale: fr });
}

/// Formate une date avec l'heure (dd/MM/yyyy HH:mm)
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: fr });
}

/// Retire l'extension UNIQUEMENT si c'est une extension connue (insensible à
/// la casse) — préserve les noms type `Rapport v1.2` qui ne sont pas une
/// extension de fichier.
export function stripKnownExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) return filename;
  const ext = filename.slice(lastDot + 1).toLowerCase();
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext) ? filename.slice(0, lastDot) : filename;
}

/// Reconstitue le nom de fichier complet (alias humain + extension réelle)
/// — utilisé pour la suggestion de sauvegarde sur disque.
export function formatDocumentFilename(nomOriginal: string, extension: string | null | undefined): string {
  return extension ? `${nomOriginal}.${extension}` : nomOriginal;
}

/// Contexte de nommage passé à l'UploadModal pour générer un nom suggéré
export interface NamingContext {
  prestataire?: string;
  objet?: string;
  /** Date ISO (YYYY-MM-DD) — si fournie, affichée en dd/MM/yyyy au lieu de l'année */
  date?: string;
}

/// Génère un nom de document suggéré : [Type] - [Prestataire] - [Objet] - [Date ou Année]
export function suggestDocumentName(typeName: string | undefined, ctx?: NamingContext): string {
  const parts: string[] = [];
  if (typeName) parts.push(typeName);
  if (ctx?.prestataire) parts.push(ctx.prestataire);
  if (ctx?.objet) parts.push(ctx.objet);
  if (ctx?.date) {
    parts.push(formatDate(ctx.date));
  } else {
    parts.push(String(new Date().getFullYear()));
  }
  return parts.join(" - ");
}

/// Formatage compact d'un nombre — entiers tels quels, décimaux 1-2 chiffres selon l'ordre de grandeur.
export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
}

/// Formate un Δ (variation) avec son signe explicite : `+12`, `-3.5`.
export function formatDelta(n: number): string {
  return (n > 0 ? "+" : "") + formatNumber(n);
}

/// Formate une taille en octets de façon lisible
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i] ?? "o"}`;
}

/// Nombre de jours écoulés depuis une date ISO (RFC3339 ou "YYYY-MM-DD HH:MM:SS").
/// null si l'entrée est manquante ou non parsable. Arrondi inférieur.
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = new Date(iso.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

/// Formate une durée en jours en texte lisible
export function formatDuration(days: number): string {
  if (days < 1) return "< 1 jour";
  if (days === 1) return "1 jour";
  if (days < 30) return `${days} jours`;
  if (days < 365) return `${Math.round(days / 30)} mois`;
  return `${(days / 365).toFixed(1)} an(s)`;
}
