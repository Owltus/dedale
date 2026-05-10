import { createContext, useContext } from "react";

export interface UploadQueueContextValue {
  enqueue: (
    files: { name: string; base64: string; idTypeDocument: number }[],
    onUploaded?: (idDocument: number) => Promise<void>,
  ) => void;
  pendingCount: number;
}

export const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function useUploadQueue(): UploadQueueContextValue {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue doit être utilisé dans UploadQueueProvider");
  return ctx;
}
