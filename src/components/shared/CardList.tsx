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
  compact?: boolean;
  rowHeight?: number;
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
  compact = false,
  rowHeight,
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

  const layout = compact
    ? { estimateSize: rowHeight ?? 28, gap: 2, pad: 2, icon: "w-7 [&_svg]:size-3.5 [&_svg]:stroke-[1.5]", content: "gap-2 px-2 py-0.5" }
    : { estimateSize: 58, gap: 8, pad: 8, icon: "w-16 [&_svg]:size-10 [&_svg]:stroke-1",    content: "gap-6 px-4 py-3" };
  const rowStyle = compact && rowHeight ? { height: rowHeight } : undefined;
  const rowClass = compact && !rowHeight ? "h-[26px]" : "";

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => layout.estimateSize,
    overscan: 10,
    gap: layout.gap,
    paddingStart: layout.pad,
    paddingEnd: layout.pad,
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
      {(showTitle || showSearch || extraToolbar) && (
        <div className={cn("border-b bg-background px-3 flex items-center justify-between gap-3 shrink-0", compact ? "h-7" : "h-12")}>
          {title ? <span className={cn("font-medium shrink-0", compact ? "text-[11px]" : "text-sm", !showTitle && "invisible")}>{title}</span> : <span />}
          <div className="flex items-center gap-2 ml-auto h-8">
            {extraToolbar}
            <div className={cn(!showSearch && "invisible")}>
              <SearchInput value={search} onChange={setSearch} placeholder="Rechercher..." />
            </div>
          </div>
        </div>
      )}
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
                    rowClass,
                    (getHref || onItemClick) && "cursor-pointer hover:bg-muted/30",
                    "transition-colors",
                    cardClassName?.(item)
                  )}
                  style={rowStyle}
                  onClick={getHref ? () => navigate(getHref(item)) : onItemClick ? () => onItemClick(item) : undefined}
                >
                  <div className={cn(
                    "flex shrink-0 items-center justify-center bg-muted border-r overflow-hidden",
                    layout.icon
                  )}>
                    <CardItemIcon imageId={getImageId?.(item)} fallback={getIcon?.(item) ?? icon} />
                  </div>
                  <div className={cn(
                    "flex flex-1 items-center justify-between min-w-0",
                    layout.content
                  )}>
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
