import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { documentKeys } from "@/hooks/use-documents";

type UploadStatus = "pending" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  name: string;
  base64: string;
  idTypeDocument: number;
  status: UploadStatus;
  /** Callback appelé après upload réussi (ex: liaison à une entité) */
  onUploaded?: (idDocument: number) => Promise<void>;
}

interface UploadQueueContextValue {
  enqueue: (
    files: { name: string; base64: string; idTypeDocument: number }[],
    onUploaded?: (idDocument: number) => Promise<void>,
  ) => void;
  pendingCount: number;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function useUploadQueue(): UploadQueueContextValue {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue doit être utilisé dans UploadQueueProvider");
  return ctx;
}

const TOAST_ID = "upload-queue";

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const processingRef = useRef(false);
  const nextIdRef = useRef(0);

  const enqueue = useCallback((
    files: { name: string; base64: string; idTypeDocument: number }[],
    onUploaded?: (idDocument: number) => Promise<void>,
  ) => {
    const newItems: UploadItem[] = files.map((f) => ({
      id: `upload-${++nextIdRef.current}`,
      name: f.name,
      base64: f.base64,
      idTypeDocument: f.idTypeDocument,
      status: "pending" as const,
      onUploaded,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const { doneCount, errorCount, pendingCount, totalCount } = useMemo(() => {
    let done = 0, error = 0, pending = 0;
    for (const item of items) {
      if (item.status === "done") done++;
      else if (item.status === "error") error++;
      else pending++;
    }
    return { doneCount: done, errorCount: error, pendingCount: pending, totalCount: items.length };
  }, [items]);

  const currentItem = useMemo(() => items.find((i) => i.status === "uploading"), [items]);
  const hasPending = pendingCount > 0;

  // Traitement séquentiel
  useEffect(() => {
    if (processingRef.current || !hasPending) return;
    const next = items.find((i) => i.status === "pending");
    if (!next) return;

    processingRef.current = true;
    setItems((prev) => prev.map((i) => i.id === next.id ? { ...i, status: "uploading" as const } : i));

    (async () => {
      try {
        const doc = await invoke<{ id_document: number }>("upload_document", {
          input: { nom_original: next.name, data_base64: next.base64, id_type_document: next.idTypeDocument },
        });
        if (next.onUploaded) {
          try {
            await next.onUploaded(doc.id_document);
          } catch (e) {
            toast.error(`${next.name} — liaison échouée : ${String(e)}`);
          }
        }
        setItems((prev) => prev.map((i) => i.id === next.id ? { ...i, status: "done" as const, base64: "" } : i));
        qc.invalidateQueries({ queryKey: documentKeys.all });
      } catch (e) {
        setItems((prev) => prev.map((i) => i.id === next.id ? { ...i, status: "error" as const, base64: "" } : i));
        toast.error(`${next.name} — ${String(e)}`);
      } finally {
        processingRef.current = false;
      }
    })();
  }, [hasPending, items, qc]);

  // Toast de progression
  useEffect(() => {
    if (totalCount === 0) return;

    if (pendingCount > 0) {
      const processed = doneCount + errorCount;
      const percent = Math.round((processed / totalCount) * 100);
      toast.loading(`Upload ${processed + 1}/${totalCount} — ${currentItem?.name ?? ""}`, {
        id: TOAST_ID,
        description: (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        ),
        duration: Infinity,
      });
    } else {
      toast.dismiss(TOAST_ID);
      const msg = errorCount === 0
        ? (totalCount === 1 ? "Document uploadé" : `${doneCount} documents uploadés`)
        : `${doneCount} uploadé${doneCount > 1 ? "s" : ""}, ${errorCount} erreur${errorCount > 1 ? "s" : ""}`;
      if (errorCount === 0) toast.success(msg);
      else toast.warning(msg);
      setItems([]);
    }
  }, [totalCount, pendingCount, doneCount, errorCount, currentItem?.id]);

  return (
    <UploadQueueContext.Provider value={{ enqueue, pendingCount }}>
      {children}
    </UploadQueueContext.Provider>
  );
}
