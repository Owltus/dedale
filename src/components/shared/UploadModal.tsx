import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Check, FileUp, Link, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocuments } from "@/hooks/use-documents";
import { useTypesDocuments } from "@/hooks/use-referentiels";
import { formatBytes, stripExtension, suggestDocumentName, type NamingContext } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { fileToBase64, readDroppedFiles } from "./DropZone";
import { DocumentIcon } from "./DocumentIcon";
import { ACCEPTED_FORMATS } from "@/lib/schemas/documents";

// ════════════════════════════════════════════════════════════════════════════
// ── Types ──
// ════════════════════════════════════════════════════════════════════════════

interface PendingFile {
  id: number;
  name: string;
  ext: string;
  base64: string;
  idTypeDocument: number;
}

interface LinkExistingConfig {
  linkedDocIds: number[];
  onLink: (ids: number[]) => Promise<void>;
}

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: { name: string; base64: string; idTypeDocument: number }[]) => void;
  initialFiles?: { name: string; base64: string }[];
  /** Si fourni, affiche l'onglet "Lier un existant" */
  linkExisting?: LinkExistingConfig;
  /** Type de document par défaut (override le premier type de la liste) */
  defaultTypeId?: number;
  /** Contexte de la page pour le nommage automatique */
  namingContext?: NamingContext;
}

// ════════════════════════════════════════════════════════════════════════════
// ── UploadModal — composant unifié upload + liaison ──
// ════════════════════════════════════════════════════════════════════════════

export function UploadModal({ open, onOpenChange, onUpload, initialFiles, linkExisting, defaultTypeId: defaultTypeProp, namingContext }: UploadModalProps) {
  const { data: typesDoc = [] } = useTypesDocuments();
  const defaultTypeId = useMemo(() => defaultTypeProp ?? typesDoc[0]?.id_type_document ?? 0, [defaultTypeProp, typesDoc]);
  const typeItems = useMemo(
    () => Object.fromEntries(typesDoc.map((t) => [String(t.id_type_document), t.nom])),
    [typesDoc],
  );

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [globalType, setGlobalType] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const pendingIdRef = useRef(0);
  const [modalDragging, setModalDragging] = useState(false);

  // Résout le nom suggéré pour un type donné (undefined si pas de contexte)
  const suggestName = useCallback((typeId: number) => {
    if (!namingContext) return undefined;
    const typeName = typesDoc.find((t) => t.id_type_document === typeId)?.nom;
    return suggestDocumentName(typeName, namingContext);
  }, [namingContext, typesDoc]);

  // ── Ajouter des fichiers au pending ──
  const makePendingFiles = useCallback((entries: { name: string; base64: string }[], typeId: number) => {
    const newFiles: PendingFile[] = entries.map((f) => {
      const dot = f.name.lastIndexOf(".");
      const ext = dot > 0 ? f.name.slice(dot) : "";
      const name = suggestName(typeId) ?? (dot > 0 ? f.name.slice(0, dot) : f.name);
      return { id: ++pendingIdRef.current, name, ext, base64: f.base64, idTypeDocument: typeId };
    });
    setPendingFiles((prev) => [...prev, ...newFiles]);
  }, [suggestName]);

  // Refs stables pour lire les valeurs dans l'effet sans les mettre en dépendance
  const defaultTypeIdRef = useRef(defaultTypeId);
  defaultTypeIdRef.current = defaultTypeId;
  const initialFilesRef = useRef(initialFiles);
  initialFilesRef.current = initialFiles;

  // Réinitialisation propre à chaque ouverture — ne dépend que de `open`
  useEffect(() => {
    if (!open) return;
    const typeId = defaultTypeIdRef.current;
    const files = initialFilesRef.current;
    setGlobalType(typeId);
    setPendingFiles([]);
    if (files && files.length > 0) {
      makePendingFiles(files, typeId);
    }
  }, [open, makePendingFiles]);

  // ── Input file change ──
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const entries: { name: string; base64: string }[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]!;
      const base64 = await fileToBase64(file);
      entries.push({ name: file.name, base64 });
    }
    makePendingFiles(entries, globalType || defaultTypeId);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Drag & drop natif Tauri dans le modal ──
  const handleDroppedInModal = useCallback((files: { name: string; base64: string }[]) => {
    makePendingFiles(files, defaultTypeId);
  }, [makePendingFiles, defaultTypeId]);

  const dropHandlerRef = useRef(handleDroppedInModal);
  dropHandlerRef.current = handleDroppedInModal;

  useEffect(() => {
    if (!open) return;
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent(async (event) => {
      if (event.payload.type === "over") {
        const el = dropZoneRef.current;
        if (el && event.payload.position) {
          const rect = el.getBoundingClientRect();
          const { x, y } = event.payload.position;
          const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
          setModalDragging(inside);
        }
      } else if (event.payload.type === "leave") {
        setModalDragging(false);
      } else if (event.payload.type === "drop") {
        setModalDragging(false);
        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;
        const { files } = await readDroppedFiles(paths);
        if (files.length > 0) dropHandlerRef.current(files);
      }
    });
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  }, [open]);

  // ── Modifier / supprimer un fichier en attente ──
  const updatePending = (id: number, patch: Partial<PendingFile>) => {
    setPendingFiles((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  };

  const removePending = (id: number) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // ── Type global ──
  const applyGlobalType = (typeId: number) => {
    setGlobalType(typeId);
    const suggested = suggestName(typeId);
    setPendingFiles((prev) => prev.map((f) => ({
      ...f, idTypeDocument: typeId, ...(suggested ? { name: suggested } : {}),
    })));
  };

  // ── Envoyer tous les fichiers ──
  const handleUploadAll = () => {
    const invalid = pendingFiles.some((f) => !f.name.trim() || !f.idTypeDocument);
    if (invalid) {
      toast.error("Chaque fichier doit avoir un nom et un type");
      return;
    }
    if (pendingFiles.length === 0) return;
    onUpload(pendingFiles.map((f) => ({
      name: `${f.name.trim()}${f.ext}`,
      base64: f.base64,
      idTypeDocument: f.idTypeDocument,
    })));
    onOpenChange(false);
    setPendingFiles([]);
  };

  const handleClose = () => {
    onOpenChange(false);
    setPendingFiles([]);
  };

  // ── Contenu de l'onglet Upload ──
  const uploadContent = (
    <div className="space-y-4">
      <div
        ref={dropZoneRef}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-5 cursor-pointer transition-colors",
          modalDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20 hover:border-muted-foreground/40",
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <FileUp className="size-5 text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground">
          Déposez vos fichiers ici ou <span className="underline">parcourir</span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS}
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {pendingFiles.length > 1 && (
        <div className="space-y-2">
          <Label>Type pour tous les fichiers</Label>
          <Select
            value={globalType ? String(globalType) : undefined}
            items={typeItems}
            onValueChange={(v) => applyGlobalType(Number(v))}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="-- Sélectionner --" /></SelectTrigger>
            <SelectContent>
              {typesDoc.map((t) => <SelectItem key={t.id_type_document} value={String(t.id_type_document)}>{t.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {pendingFiles.map((f) => (
            <div key={f.id} className="flex items-start gap-2 rounded-md border p-2">
              <div className="flex-1 min-w-0 space-y-2">
                <Input
                  value={f.name}
                  onChange={(e) => updatePending(f.id, { name: e.target.value })}
                  className="h-8 text-sm"
                />
                <Select
                  value={f.idTypeDocument ? String(f.idTypeDocument) : undefined}
                  items={typeItems}
                  onValueChange={(v) => {
                    const typeId = Number(v);
                    const suggested = suggestName(typeId);
                    updatePending(f.id, { idTypeDocument: typeId, ...(suggested ? { name: suggested } : {}) });
                  }}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Type *" /></SelectTrigger>
                  <SelectContent>
                    {typesDoc.map((t) => <SelectItem key={t.id_type_document} value={String(t.id_type_document)}>{t.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="icon" className="size-7 shrink-0 mt-0.5" onClick={() => removePending(f.id)}>
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={handleClose}>Annuler</Button>
        <Button onClick={handleUploadAll} disabled={pendingFiles.length === 0}>
          Ajouter {pendingFiles.length > 1 ? `(${pendingFiles.length})` : ""}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="!max-w-xl">
        <DialogHeader><DialogTitle>Ajouter des documents</DialogTitle></DialogHeader>
        {linkExisting ? (
          <Tabs defaultValue="upload" className="flex flex-col">
            <TabsList className="w-full">
              <TabsTrigger value="upload" className="flex-1 gap-1.5">
                <FileUp className="size-3.5" /> Nouveau fichier
              </TabsTrigger>
              <TabsTrigger value="link" className="flex-1 gap-1.5">
                <Link className="size-3.5" /> Lier un existant
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="mt-4">
              {uploadContent}
            </TabsContent>
            <TabsContent value="link" className="mt-4">
              <LinkExistingTab
                linkedDocIds={linkExisting.linkedDocIds}
                onLink={linkExisting.onLink}
                onClose={handleClose}
              />
            </TabsContent>
          </Tabs>
        ) : (
          uploadContent
        )}
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── Onglet "Lier un existant" ──
// ════════════════════════════════════════════════════════════════════════════

interface LinkExistingTabProps {
  linkedDocIds: number[];
  onLink: (ids: number[]) => Promise<void>;
  onClose: () => void;
}

function LinkExistingTab({ linkedDocIds, onLink, onClose }: LinkExistingTabProps) {
  const { data: allDocuments = [] } = useDocuments();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [linking, setLinking] = useState(false);

  const linkedSet = useMemo(() => new Set(linkedDocIds), [linkedDocIds]);

  const filtered = useMemo(() => {
    const available = allDocuments.filter((d) => !linkedSet.has(d.id_document));
    if (!search) return available;
    const q = search.toLowerCase();
    return available.filter((d) =>
      d.nom_original.toLowerCase().includes(q) || d.nom_type.toLowerCase().includes(q)
    );
  }, [allDocuments, linkedSet, search]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLinkSelected = async () => {
    if (selected.size === 0) return;
    setLinking(true);
    await onLink(Array.from(selected));
    setLinking(false);
    setSelected(new Set());
    onClose();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un document..."
          className="pl-9"
        />
      </div>

      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto no-scrollbar">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Aucun document disponible</p>
        )}
        {filtered.map((doc) => {
          const isSelected = selected.has(doc.id_document);
          return (
            <button
              key={doc.id_document}
              type="button"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent",
              )}
              onClick={() => toggleSelect(doc.id_document)}
            >
              <div className="flex size-5 shrink-0 items-center justify-center rounded border">
                {isSelected && <Check className="size-3.5 text-primary" />}
              </div>
              <DocumentIcon fileName={doc.nom_original} className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{stripExtension(doc.nom_original)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {doc.nom_type} · {formatBytes(doc.taille_octets)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={handleLinkSelected} disabled={selected.size === 0 || linking}>
          {linking ? "Liaison..." : `Lier ${selected.size > 0 ? `(${selected.size})` : ""}`}
        </Button>
      </DialogFooter>
    </div>
  );
}
