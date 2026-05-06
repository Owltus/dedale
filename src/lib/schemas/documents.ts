import { z } from "zod";

/** Formats acceptés à l'upload : PDF + images (converties en WebP côté Rust) */
export const ACCEPTED_FORMATS = ".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp";

/** Source de vérité unique des extensions reconnues (alignée avec la
 *  migration 005 et avec les magic-bytes côté Rust dans documents.rs). */
export const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "gif", "bmp", "webp"] as const;
const ALLOWED_SET = new Set<string>(ALLOWED_EXTENSIONS);

/** Vérifie si un nom de fichier a une extension autorisée */
export function isAllowedFormat(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_SET.has(ext);
}

/** Détermine le type de fichier d'après son extension (sans le point) */
export function getDocumentFileType(extension: string): "image" | "pdf" | null {
  const ext = extension.toLowerCase();
  if (ext === "pdf") return "pdf";
  return ALLOWED_SET.has(ext) ? "image" : null;
}

export const documentEditSchema = z.object({
  nom_original: z.string().trim().min(1, "Le nom est requis"),
  id_type_document: z.coerce.number().int(),
});

export type DocumentEditFormData = z.infer<typeof documentEditSchema>;
