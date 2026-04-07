import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const OUTPUT_SIZE = 150;
const WEBP_QUALITY = 0.82;

interface ImageCropDialogProps {
  cropSrc: string | null;
  onClose: () => void;
  onConfirm: (base64: string) => void;
}

/// Dialogue de rognage d'image avec react-easy-crop
export function ImageCropDialog({ cropSrc, onClose, onConfirm }: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedArea(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!cropSrc || !croppedArea) return;
    const base64 = await cropAndResize(cropSrc, croppedArea);
    onConfirm(base64);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      // Réinitialiser l'état interne au prochain ouverture
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  };

  return (
    <Dialog open={!!cropSrc} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rogner l'image</DialogTitle>
        </DialogHeader>
        <div className="relative h-64 w-full overflow-hidden rounded-md bg-muted">
          {cropSrc && (
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              cropShape="rect"
              showGrid={false}
            />
          )}
        </div>
        <div className="space-y-2">
          <Label>Zoom</Label>
          <Slider
            min={1}
            max={3}
            step={0.05}
            value={[zoom]}
            onValueChange={(v) => setZoom(Array.isArray(v) ? v[0]! : v)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleConfirm}>Valider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cropAndResize(src: string, crop: Area): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas non disponible"));

      ctx.drawImage(
        img,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
      );

      const dataUrl = canvas.toDataURL("image/webp", WEBP_QUALITY);
      resolve(dataUrl.split(",")[1] ?? "");
    };
    img.onerror = reject;
    img.src = src;
  });
}
