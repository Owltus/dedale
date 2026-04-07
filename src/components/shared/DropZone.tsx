import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { cn } from "@/lib/utils";
import { isAllowedFormat } from "@/lib/schemas/documents";

interface DropZoneProps {
  children: ReactNode;
  onFilesDropped: (files: { name: string; base64: string }[]) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

/// Zone droppable Tauri native — gère le drag & drop de fichiers + overlay visuel
export function DropZone({ children, onFilesDropped, disabled = false, className }: DropZoneProps) {
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleDrop = useCallback(async (paths: string[]) => {
    setUploading(true);
    const { files } = await readDroppedFiles(paths);
    if (files.length > 0) {
      await onFilesDropped(files);
    }
    setUploading(false);
  }, [onFilesDropped]);

  useEffect(() => {
    if (disabled) return;
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent(async (event) => {
      const el = dropZoneRef.current;
      if (!el || el.offsetParent === null) return;

      if (event.payload.type === "over") {
        // Vérifier si le curseur est au-dessus de cet élément (position-aware)
        if (event.payload.position) {
          const rect = el.getBoundingClientRect();
          const { x, y } = event.payload.position;
          setDragging(x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
        } else {
          setDragging(true);
        }
      } else if (event.payload.type === "leave") {
        setDragging(false);
      } else if (event.payload.type === "drop") {
        setDragging(false);
        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;
        // Ne traiter le drop que si le curseur est au-dessus de cet élément
        if (event.payload.position) {
          const rect = el.getBoundingClientRect();
          const { x, y } = event.payload.position;
          if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
        }
        await handleDrop(paths);
      }
    });
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  }, [disabled, handleDrop]);

  return (
    <div
      ref={dropZoneRef}
      className={cn(
        "relative transition-colors",
        className,
        dragging && "border-dashed border-primary bg-primary/5",
      )}
    >

      {uploading && !dragging && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-md bg-background/80 backdrop-blur-[1px]">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-sm font-medium text-muted-foreground">Envoi en cours...</p>
        </div>
      )}

      {children}
    </div>
  );
}

/// Lit des fichiers depuis des chemins Tauri natifs, valide le format, retourne les base64
export async function readDroppedFiles(paths: string[]): Promise<{ files: { name: string; base64: string }[]; rejected: string[] }> {
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
