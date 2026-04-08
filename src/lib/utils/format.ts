import { format } from "date-fns";
import { fr } from "date-fns/locale";

/// Formate une date ISO en format français lisible (dd/MM/yyyy)
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy", { locale: fr });
}

/// Formate une date avec l'heure (dd/MM/yyyy HH:mm)
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: fr });
}

/// Retourne le nom de fichier sans son extension
export function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
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

/// Formate une durée en jours en texte lisible
export function formatDuration(days: number): string {
  if (days < 1) return "< 1 jour";
  if (days === 1) return "1 jour";
  if (days < 30) return `${days} jours`;
  if (days < 365) return `${Math.round(days / 30)} mois`;
  return `${(days / 365).toFixed(1)} an(s)`;
}
