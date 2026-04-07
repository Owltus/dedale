import { useRef, useState } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useImage, useUploadImage } from "@/hooks/use-images";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "./ImageCropDialog";
import { ImageLibraryDialog } from "./ImageLibraryDialog";

interface ImagePickerProps {
  value: number | null;
  onChange: (idImage: number | null) => void;
  className?: string;
}

export function ImagePicker({ value, onChange, className }: ImagePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const { data: image } = useImage(value);
  const uploadMutation = useUploadImage();

  const handleUploadClick = () => {
    if (!uploadMutation.isPending) fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropConfirm = async (base64: string) => {
    setCropSrc(null);
    try {
      const result = await uploadMutation.mutateAsync({
        input: {
          nom: "image.webp",
          description: null,
          image_data_base64: base64,
          image_mime: "image/webp",
        },
      });
      onChange(result.id_image);
    } catch { /* erreur gérée par useInvokeMutation */ }
  };

  const handleLibrarySelect = (idImage: number) => {
    onChange(idImage);
    setLibraryOpen(false);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const hasImage = value !== null && image;
  const isPending = uploadMutation.isPending;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative">
        <button
          type="button"
          onClick={handleUploadClick}
          className={cn(
            "flex size-[150px] items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50 hover:bg-accent",
            hasImage && "border-solid border-border",
            isPending && "pointer-events-none opacity-50",
          )}
        >
          {isPending ? (
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          ) : hasImage ? (
            <img
              src={`data:${image.image_mime};base64,${image.image_data_base64}`}
              alt={image.nom}
              className="size-full object-cover"
            />
          ) : (
            <Upload className="size-6 text-muted-foreground" />
          )}
        </button>

        {hasImage && !isPending && (
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 w-full"
        onClick={() => setLibraryOpen(true)}
      >
        <ImageIcon className="size-4" />
        Bibliothèque
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <ImageCropDialog
        cropSrc={cropSrc}
        onClose={() => setCropSrc(null)}
        onConfirm={handleCropConfirm}
      />

      <ImageLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        selectedImageId={value}
        onSelect={handleLibrarySelect}
        onDeleteSelected={() => onChange(null)}
      />
    </div>
  );
}
