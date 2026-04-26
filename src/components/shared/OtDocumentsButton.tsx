import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useDocumentPreview,
  useDocumentsForEntity,
  useSaveDocumentToDisk,
} from "@/hooks/use-documents";
import type { DocumentLie } from "@/lib/types/documents";
import { formatBytes, formatDate, stripExtension } from "@/lib/utils/format";
import { CardList } from "./CardList";
import { DocumentIcon } from "./DocumentIcon";
import { DocumentPreviewDialog } from "./DocumentPreviewDialog";

function filterDocument(doc: DocumentLie, q: string): boolean {
  return doc.nom_original.toLowerCase().includes(q) || doc.nom_type.toLowerCase().includes(q);
}

interface OtDocumentsButtonProps {
  idOrdreTravail: number;
  nbDocuments: number;
}

export function OtDocumentsButton({ idOrdreTravail, nbDocuments }: OtDocumentsButtonProps) {
  const [enabled, setEnabled] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: docs = [], isFetching } = useDocumentsForEntity(
    "ordres_travail",
    enabled ? idOrdreTravail : 0,
  );
  const { previewDoc, previewData, openPreview, closePreview } = useDocumentPreview();
  const saveToDisk = useSaveDocumentToDisk();

  useEffect(() => {
    if (!pendingAction || !enabled || isFetching) return;
    setPendingAction(false);
    if (docs.length === 1) void openPreview(docs[0]!);
    else if (docs.length > 1) setPickerOpen(true);
  }, [pendingAction, enabled, isFetching, docs, openPreview]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEnabled(true);
    setPendingAction(true);
  };

  // Base UI n'autorise qu'un seul Dialog modal à la fois : on ferme le picker,
  // on attend la fin de l'animation puis on ouvre la preview.
  const handlePickDoc = (doc: DocumentLie) => {
    setPickerOpen(false);
    timerRef.current = setTimeout(() => void openPreview(doc), 180);
  };

  // Wrapper display:contents qui stoppe les clics bubblant depuis ce composant.
  // Les Dialog sont portalisés en DOM mais restent enfants dans le React tree :
  // sans ce stop, leurs clics remontent jusqu'à la <div> de la carte OT et
  // déclenchent la navigation vers /ordres-travail/:id.
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleClick}
        title={nbDocuments === 1 ? "Voir le document lié" : `Choisir parmi ${nbDocuments} documents`}
        className="shrink-0 rounded-md text-violet-500 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-950/40 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <FileText className="size-8" strokeWidth={1.2} />
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>Documents liés à l'ordre de travail</DialogTitle>
            <DialogDescription>
              {docs.length} document{docs.length > 1 ? "s" : ""} — cliquez pour l'ouvrir
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-3 pb-3">
            <CardList
              data={docs}
              getKey={(d) => d.id_document}
              onItemClick={handlePickDoc}
              filterFn={filterDocument}
              icon={<FileText className="size-5 text-muted-foreground" />}
              getIcon={(d) => <DocumentIcon fileName={d.nom_original} />}
              showTitle={false}
              showSearch={false}
              renderContent={(d) => (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{stripExtension(d.nom_original)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.source ? `${d.source} · ` : ""}{d.nom_type} · {formatBytes(d.taille_octets)} · {formatDate(d.date_liaison)}
                  </p>
                </div>
              )}
            />
          </div>
        </DialogContent>
      </Dialog>

      <DocumentPreviewDialog
        doc={previewDoc}
        previewData={previewData}
        onClose={closePreview}
        onDownload={saveToDisk}
      />
    </span>
  );
}
