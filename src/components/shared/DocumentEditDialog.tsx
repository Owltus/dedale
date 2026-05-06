import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { typedResolver } from "@/lib/utils/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ACCEPTED_FORMATS, documentEditSchema, type DocumentEditFormData } from "@/lib/schemas/documents";
import { useUpdateDocument, useReplaceDocumentFile } from "@/hooks/use-documents";
import { useTypesDocuments } from "@/hooks/use-referentiels";
import { fileToBase64 } from "@/components/shared/DropZone";
import { formatBytes, stripKnownExtension } from "@/lib/utils/format";

export interface EditableDoc {
  id_document: number;
  nom_original: string;
  id_type_document: number;
  extension: string;
}

interface DocumentEditDialogProps {
  doc: EditableDoc | null;
  onClose: () => void;
}

/// Dialog d'édition d'un document — réutilisable depuis la page Documents
/// et depuis le composant DocumentsLies (équipements, gammes, OT, etc.).
export function DocumentEditDialog({ doc, onClose }: DocumentEditDialogProps) {
  const { data: typesDoc = [] } = useTypesDocuments();
  const updateMutation = useUpdateDocument();
  const replaceMutation = useReplaceDocumentFile();
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const typeItems = useMemo(
    () => Object.fromEntries(typesDoc.map((t) => [String(t.id_type_document), t.nom])),
    [typesDoc],
  );

  const form = useForm({
    resolver: typedResolver(documentEditSchema),
    defaultValues: { nom_original: "", id_type_document: 0 },
  });

  // Réinitialiser le formulaire quand le document change
  useEffect(() => {
    if (doc) {
      form.reset({
        nom_original: doc.nom_original,
        id_type_document: doc.id_type_document,
      });
      setReplaceFile(null);
    }
  }, [doc, form]);

  const handleSubmit = form.handleSubmit(async (data) => {
    if (!doc) return;
    const typed = data as DocumentEditFormData;
    // Stripping silencieux : tolère que l'utilisateur tape "facture.pdf" par
    // habitude — on enlève l'extension reconnue avant l'enregistrement.
    const cleanName = stripKnownExtension(typed.nom_original.trim());
    try {
      if (cleanName !== doc.nom_original || typed.id_type_document !== doc.id_type_document) {
        await updateMutation.mutateAsync({
          id: doc.id_document,
          nom_original: cleanName,
          id_type_document: typed.id_type_document,
        });
      }
      if (replaceFile) {
        const base64 = await fileToBase64(replaceFile);
        await replaceMutation.mutateAsync({ id: doc.id_document, data_base64: base64 });
      }
      toast.success("Document modifié");
      onClose();
    } catch { /* géré par les mutations */ }
  });

  return (
    <CrudDialog
      open={doc !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Modifier le document"
      onSubmit={handleSubmit}
      submitLabel="Enregistrer"
    >
      <div className="space-y-2">
        <Label>Nom du document</Label>
        <Input {...form.register("nom_original")} />
        {form.formState.errors.nom_original && (
          <p className="text-xs text-destructive">{String(form.formState.errors.nom_original.message ?? "")}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Type de document</Label>
        <Select
          value={String(form.watch("id_type_document"))}
          items={typeItems}
          onValueChange={(v) => form.setValue("id_type_document", Number(v))}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {typesDoc.map((t) => (
              <SelectItem key={t.id_type_document} value={String(t.id_type_document)}>{t.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Remplacer le fichier (optionnel)</Label>
        <Input type="file" accept={ACCEPTED_FORMATS} onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)} />
        {replaceFile && (
          <p className="text-xs text-muted-foreground">Nouveau : {replaceFile.name} — {formatBytes(replaceFile.size)}</p>
        )}
      </div>
    </CrudDialog>
  );
}
