import { type ReactNode, useRef, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { useImage } from "@/hooks/use-images";
import { EmptyState } from "./EmptyState";
import { SearchInput } from "./SearchInput";

/// Affiche l'image si elle existe, sinon le fallback icon
function CardItemIcon({ imageId, fallback }: { imageId?: number | null; fallback: ReactNode }) {
  const { data: image } = useImage(imageId);

  if (image) {
    return (
      <img
        src={`data:${image.image_mime};base64,${image.image_data_base64}`}
        alt={image.nom}
        className="size-full object-cover"
      />
    );
  }

  return <>{fallback}</>;
}

interface CardListProps<T> {
  data: T[];
  getKey: (item: T) => string | number;
  getHref?: (item: T) => string;
  onItemClick?: (item: T) => void;
  getImageId?: (item: T) => number | null | undefined;
  filterFn: (item: T, query: string) => boolean;
  icon: ReactNode;
  getIcon?: (item: T) => ReactNode;
  renderContent: (item: T) => ReactNode;
  renderRight?: (item: T) => ReactNode;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  showTitle?: boolean;
  showSearch?: boolean;
  className?: string;
  cardClassName?: (item: T) => string | undefined;
  extraToolbar?: ReactNode;
}

/// Composant générique pour afficher une liste de cartes avec recherche, navigation et état vide
export function CardList<T>({
  data,
  getKey,
  getHref,
  onItemClick,
  getImageId,
  filterFn,
  icon,
  getIcon,
  renderContent,
  renderRight,
  title,
  emptyTitle = "Aucun élément",
  emptyDescription,
  showTitle = true,
  showSearch = true,
  className,
  cardClassName,
  extraToolbar,
}: CardListProps<T>) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return data;
    return data.filter((item) => filterFn(item, search.toLowerCase()));
  }, [data, search, filterFn]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 58,
    overscan: 10,
    gap: 8,
    paddingStart: 8,
    paddingEnd: 8,
  });

  if (data.length === 0) {
    return (
      <div className={cn("flex flex-1 flex-col rounded-md border min-h-0 items-center justify-center", className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-1 flex-col rounded-md border min-h-0", className)}>
      <div className="border-b bg-background px-3 h-12 flex items-center justify-between gap-3 shrink-0">
        {title ? <span className={cn("text-sm font-medium shrink-0", !showTitle && "invisible")}>{title}</span> : <span />}
        <div className="flex items-center gap-2 ml-auto h-8">
          {extraToolbar}
          <div className={cn(!showSearch && "invisible")}>
            <SearchInput value={search} onChange={setSearch} placeholder="Rechercher..." />
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar min-h-0">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = filtered[virtualRow.index]!;
            return (
              <div
                key={getKey(item)}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute top-0 left-0 w-full px-2"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div
                  className={cn(
                    "flex items-stretch rounded-lg border overflow-hidden",
                    (getHref || onItemClick) && "cursor-pointer hover:bg-muted/30",
                    "transition-colors",
                    cardClassName?.(item)
                  )}
                  onClick={getHref ? () => navigate(getHref(item)) : onItemClick ? () => onItemClick(item) : undefined}
                >
                  <div className="flex w-16 shrink-0 items-center justify-center bg-muted border-r overflow-hidden [&_svg]:size-10 [&_svg]:stroke-1">
                    <CardItemIcon imageId={getImageId?.(item)} fallback={getIcon?.(item) ?? icon} />
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-6 px-4 py-3 min-w-0">
                    {renderContent(item)}
                    {renderRight?.(item)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
