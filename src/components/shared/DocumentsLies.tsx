import { useCallback, useState } from "react";
import { toast } from "sonner";
import { FileUp, Trash2, Unlink2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useDocumentsForEntity, useDeleteDocument } from "@/hooks/use-documents";
import { useInvokeMutation } from "@/hooks/useInvoke";
import { formatDate, formatBytes, stripExtension, type NamingContext } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { DropZone } from "./DropZone";
import { DocumentIcon } from "./DocumentIcon";
import { UploadModal } from "./UploadModal";
import { useUploadQueue } from "./UploadQueue";
import { ConfirmDialog } from "./ConfirmDialog";

interface DocumentsLiesProps {
  entityType: "prestataires" | "ordres_travail" | "gammes" | "contrats" | "di" | "localisations" | "equipements" | "techniciens";
  entityId: number;
  readonly?: boolean;
  inputId?: string;
  hideAddButton?: boolean;
  namingContext?: NamingContext;
}

const ENTITY_COMMANDS: Record<string, { link: string; unlink: string; paramName: string }> = {
  prestataires: { link: "link_document_prestataire", unlink: "unlink_document_prestataire", paramName: "idPrestataire" },
  ordres_travail: { link: "link_document_ordre_travail", unlink: "unlink_document_ordre_travail", paramName: "idOrdreTravail" },
  gammes: { link: "link_document_gamme", unlink: "unlink_document_gamme", paramName: "idGamme" },
  contrats: { link: "link_document_contrat", unlink: "unlink_document_contrat", paramName: "idContrat" },
  di: { link: "link_document_di", unlink: "unlink_document_di", paramName: "idDi" },
  localisations: { link: "link_document_localisation", unlink: "unlink_document_localisation", paramName: "idLocalisation" },
  equipements: { link: "link_document_equipement", unlink: "unlink_document_equipement", paramName: "idEquipement" },
  techniciens: { link: "link_document_technicien", unlink: "unlink_document_technicien", paramName: "idTechnicien" },
};

/// Documents liés — drag & drop + bouton d'ajout + UploadModal unifié
export function DocumentsLies({ entityType, entityId, readonly = false, inputId, hideAddButton = false, namingContext }: DocumentsLiesProps) {
  const { data = [] } = useDocumentsForEntity(entityType, entityId);
  const qc = useQueryClient();
  const { enqueue } = useUploadQueue();
  const deleteMutation = useDeleteDocument();
  const cmds = ENTITY_COMMANDS[entityType];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<{ name: string; base64: string }[]>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const linkMutation = useInvokeMutation<null, Record<string, unknown>>(
    cmds?.link ?? "",
    { onSettled: () => qc.invalidateQueries({ queryKey: ["documents"] }) }
  );

  const unlinkMutation = useInvokeMutation<null, Record<string, unknown>>(
    cmds?.unlink ?? "",
    { onSettled: () => qc.invalidateQueries({ queryKey: ["documents"] }) }
  );

  const handleUnlink = async (idDocument: number) => {
    if (!cmds) return;
    try {
      await unlinkMutation.mutateAsync({ idDocument, [cmds.paramName]: entityId });
      toast.success("Lien supprimé — le fichier reste disponible dans Documents");
    } catch { /* géré */ }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast.success("Document supprimé définitivement");
      setDeleteId(null);
    } catch { /* géré */ }
  };

  // Upload via la queue partagée + liaison automatique après chaque upload
  const handleUpload = useCallback((files: { name: string; base64: string; idTypeDocument: number }[]) => {
    if (!cmds) return;
    enqueue(files, async (idDocument) => {
      await linkMutation.mutateAsync({
        idDocument,
        [cmds.paramName]: entityId,
      });
    });
  }, [cmds, entityId, enqueue, linkMutation]);

  // Drop sur la zone → ouvrir le modal avec les fichiers pré-chargés
  const handleDroppedFiles = useCallback(async (files: { name: string; base64: string }[]) => {
    setDroppedFiles(files);
    setDialogOpen(true);
  }, []);

  const linkExistingDocuments = useCallback(async (ids: number[]) => {
    if (!cmds) return;
    const results = await Promise.allSettled(
      ids.map((idDocument) => linkMutation.mutateAsync({ idDocument, [cmds.paramName]: entityId })),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const ko = results.filter((r) => r.status === "rejected").length;
    if (ko > 0) toast.error(`${ko} liaison${ko > 1 ? "s" : ""} échouée${ko > 1 ? "s" : ""}`);
    if (ok > 0) toast.success(`${ok} document${ok > 1 ? "s" : ""} lié${ok > 1 ? "s" : ""}`);
  }, [cmds, entityId, linkMutation]);

  return (
    <div className="flex flex-1 flex-col gap-3 min-h-0">
      {/* Bouton caché déclencheur du dialog — utilisé par les HeaderButton des pages parentes via inputId */}
      {!readonly && inputId && (
        <button id={inputId} type="button" className="hidden" onClick={() => setDialogOpen(true)} />
      )}

      {!readonly && !hideAddButton && (
        <div className="flex justify-end shrink-0">
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <FileUp className="mr-2 size-4" />
            Ajouter un document
          </Button>
        </div>
      )}

      <DropZone
        onFilesDropped={handleDroppedFiles}
        disabled={readonly}
        className={cn(
          "flex flex-1 flex-col rounded-md min-h-0 overflow-y-auto no-scrollbar",
          data.length === 0
            ? "border border-dashed border-muted-foreground/20 hover:border-muted-foreground/40"
            : "border",
        )}
      >
        {data.length > 0 && (
          <div className="flex flex-col gap-2 p-2">
            {data.map((doc) => (
              <div
                key={doc.id_document}
                className="flex items-stretch rounded-lg border overflow-hidden hover:bg-muted/30 transition-colors"
              >
                <div className="flex aspect-square shrink-0 items-center justify-center bg-muted border-r [&_svg]:size-10 [&_svg]:stroke-1">
                  <DocumentIcon fileName={doc.nom_original} />
                </div>
                <div className="flex flex-1 items-center justify-between gap-6 px-4 py-3 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{stripExtension(doc.nom_original)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {doc.source ? `${doc.source} · ` : ""}{doc.nom_type} · {formatBytes(doc.taille_octets)} · {formatDate(doc.date_liaison)}
                    </p>
                  </div>
                  {!readonly && !doc.source && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="size-7" title="Délier"
                        onClick={() => handleUnlink(doc.id_document)}>
                        <Unlink2 className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-destructive" title="Supprimer"
                        onClick={() => setDeleteId(doc.id_document)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {data.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="flex flex-col items-center gap-1.5">
              <FileUp className="size-8 text-muted-foreground/60" />
              {!readonly ? (
                <p className="text-sm text-muted-foreground">
                  Déposez vos fichiers ici ou utilisez le bouton ci-dessus
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun document</p>
              )}
              <p className="text-xs text-muted-foreground/60">PDF et images uniquement</p>
            </div>
          </div>
        )}
      </DropZone>

      {!readonly && (
        <>
          <UploadModal
            open={dialogOpen}
            onOpenChange={(v) => { setDialogOpen(v); if (!v) setDroppedFiles(undefined); }}
            onUpload={handleUpload}
            initialFiles={droppedFiles}
            linkExisting={{
              linkedDocIds: data.map((d) => d.id_document),
              onLink: linkExistingDocuments,
            }}
            namingContext={namingContext}
          />
          <ConfirmDialog
            open={deleteId !== null}
            onOpenChange={(open) => !open && setDeleteId(null)}
            title="Supprimer le document"
            description="Le fichier sera supprimé définitivement de l'application, pas seulement détaché de cette fiche."
            onConfirm={handleDelete}
            isLoading={deleteMutation.isPending}
          />
        </>
      )}
    </div>
  );
}
