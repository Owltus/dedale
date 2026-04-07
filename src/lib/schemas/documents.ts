import { z } from "zod";

/** Formats acceptés à l'upload : PDF + images (converties en WebP côté Rust) */
export const ACCEPTED_FORMATS = ".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp";

/** Extensions autorisées (pour filtrer le drag & drop natif) */
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "gif", "bmp", "webp"]);

/** Vérifie si un nom de fichier a une extension autorisée */
export function isAllowedFormat(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
}

/** Détermine le type de fichier d'après le nom */
export function getDocumentFileType(nom: string): "image" | "pdf" | null {
  const ext = nom.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return null;
}

export const documentEditSchema = z.object({
  nom_original: z.string().trim().min(1, "Le nom est requis"),
  id_type_document: z.coerce.number().int(),
});

export type DocumentEditFormData = z.infer<typeof documentEditSchema>;
