import { useState, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useImages, useDeleteImage } from "@/hooks/use-images";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./ConfirmDialog";
import { SearchInput } from "./SearchInput";

interface ImageLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedImageId: number | null;
  onSelect: (idImage: number) => void;
  onDeleteSelected: () => void;
}

/// Dialogue de sélection d'une image depuis la bibliothèque existante
export function ImageLibraryDialog({ open, onOpenChange, selectedImageId, onSelect, onDeleteSelected }: ImageLibraryDialogProps) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Chargement lazy : les images ne sont récupérées que quand la bibliothèque est ouverte
  const { data: allImages = [] } = useImages(open);
  const deleteMutation = useDeleteImage();

  const filteredImages = useMemo(() => {
    if (!search) return allImages;
    const q = search.toLowerCase();
    return allImages.filter((img) =>
      img.nom.toLowerCase().includes(q) || img.usages.toLowerCase().includes(q)
    );
  }, [allImages, search]);

  const handleDeleteImage = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget });
      if (selectedImageId === deleteTarget) onDeleteSelected();
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) setSearch("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="!max-w-[75vw] w-full max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Bibliothèque d'images</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-4 min-h-[70vh] max-h-[80vh] overflow-y-auto p-1 content-start">
            {filteredImages.length === 0 && (
              <p className="col-span-6 text-sm text-muted-foreground text-center py-12">
                {allImages.length === 0 ? "Aucune image dans la bibliothèque." : "Aucun résultat."}
              </p>
            )}
            {filteredImages.map((img) => (
              <div key={img.id_image} className="relative group">
                <button
                  type="button"
                  onClick={() => onSelect(img.id_image)}
                  className={cn(
                    "flex w-full items-center justify-center overflow-hidden rounded-md border-2 aspect-square transition-colors hover:border-primary",
                    selectedImageId === img.id_image ? "border-primary ring-2 ring-primary/30" : "border-border",
                  )}
                >
                  <img
                    src={`data:${img.image_mime};base64,${img.image_data_base64}`}
                    alt={img.nom}
                    className="size-full object-cover"
                  />
                </button>
                {img.usages && (
                  <p className="mt-1 text-xs text-muted-foreground truncate text-center" title={img.usages}>{img.usages}</p>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(img.id_image); }}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <DialogFooter className="!justify-between">
            <div className="w-80">
              <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une image..." />
            </div>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Supprimer cette image ?"
        description="L'image sera retirée de toutes les entités qui l'utilisent (domaines, familles, gammes, ordres de travail)."
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={handleDeleteImage}
      />
    </>
  );
}
