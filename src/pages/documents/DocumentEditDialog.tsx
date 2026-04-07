import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ACCEPTED_FORMATS, documentEditSchema, type DocumentEditFormData } from "@/lib/schemas/documents";
import type { DocumentListItem } from "@/lib/types/documents";
import type { TypeDocument } from "@/lib/types/referentiels";
import { formatBytes } from "@/lib/utils/format";

interface DocumentEditDialogProps {
  doc: DocumentListItem | null;
  onOpenChange: (open: boolean) => void;
  typesDoc: TypeDocument[];
  typeItems: Record<string, string>;
  onSubmit: (data: DocumentEditFormData, replaceFile: File | null) => Promise<void>;
}

export function DocumentEditDialog({ doc, onOpenChange, typesDoc, typeItems, onSubmit }: DocumentEditDialogProps) {
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

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
    await onSubmit(data as DocumentEditFormData, replaceFile);
  });

  return (
    <CrudDialog
      open={doc !== null}
      onOpenChange={(open) => { if (!open) onOpenChange(false); }}
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
