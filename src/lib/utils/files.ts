import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { isAllowedFormat } from "@/lib/schemas/documents";

/// Lit des fichiers depuis des chemins Tauri natifs, valide le format, retourne les base64
export async function readDroppedFiles(
  paths: string[],
): Promise<{ files: { name: string; base64: string }[]; rejected: string[] }> {
  const rejected: string[] = [];
  const files: { name: string; base64: string }[] = [];
  for (const filePath of paths) {
    const name = filePath.split(/[/\\]/).pop() ?? "document";
    if (!isAllowedFormat(name)) {
      rejected.push(name);
      continue;
    }
    try {
      const base64 = await invoke<string>("read_file_base64", { path: filePath });
      files.push({ name, base64 });
    } catch (e) {
      toast.error(`Erreur lecture "${name}" : ${e}`);
    }
  }
  if (rejected.length > 0) {
    toast.error(`Format non autorisé : ${rejected.join(", ")}. Seuls les PDF et images sont acceptés.`);
  }
  return { files, rejected };
}

/// Convertit un File HTML en base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
