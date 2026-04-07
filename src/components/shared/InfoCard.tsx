import { cn } from "@/lib/utils";
import { useImage } from "@/hooks/use-images";
import { ImageIcon } from "lucide-react";

interface InfoCardItem {
  label: string;
  value: string | null | undefined;
  span?: number;
}

interface InfoCardProps {
  items: (InfoCardItem | false | null | undefined)[];
  className?: string;
  imageId?: number | null;
}

export function InfoCard({ items, className, imageId }: InfoCardProps) {
  const { data: image } = useImage(imageId ?? undefined);
  const filtered = items.filter(Boolean) as InfoCardItem[];

  return (
    <div className={cn("shrink-0 rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10", imageId != null ? "pl-0 pr-3 py-0" : "px-3 py-2.5", className)}>
      <div className="flex gap-3">
        {imageId != null && (
          <div className="flex w-20 shrink-0 items-center justify-center overflow-hidden rounded-l-xl bg-muted/50">
            {image ? (
              <img
                src={`data:${image.image_mime};base64,${image.image_data_base64}`}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground/50" />
            )}
          </div>
        )}
        <div className={cn("grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 lg:grid-cols-4", imageId != null ? "py-2.5" : "")}>
          {filtered.map((item) => (
            <div key={item.label} className="min-w-0" style={item.span ? { gridColumn: `span ${item.span}` } : undefined}>
              <p className="text-[11px] leading-tight text-muted-foreground">{item.label}</p>
              <p className="text-xs font-medium truncate">{item.value ?? "—"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
