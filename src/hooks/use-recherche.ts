import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { SearchResult } from "@/lib/types/transversaux";

export function useRechercheGlobale(query: string) {
  return useInvokeQuery<SearchResult[]>(
    "recherche_globale",
    { query, limit: 20 },
    { enabled: query.trim().length >= 2, staleTime: 5000 }
  );
}

export function useExportCsvOt() {
  return useInvokeMutation<string, Record<string, never>>("export_csv_ot");
}

export function useExportCsvEquipements() {
  return useInvokeMutation<string, Record<string, never>>("export_csv_equipements");
}

export function useExportCsvGammes() {
  return useInvokeMutation<string, Record<string, never>>("export_csv_gammes");
}

/// Helper pour télécharger un CSV
export function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
