import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ActionButtonsProps {
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  editLabel?: string;
  deleteLabel?: string;
  extra?: React.ReactNode;
}

export function ActionButtons({ onEdit, onDelete, editLabel = "Modifier", deleteLabel = "Supprimer", extra }: ActionButtonsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {extra}
      {onEdit && (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); onEdit(e); }} />}>
            <Pencil className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{editLabel}</TooltipContent>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); onDelete(e); }} />}>
            <Trash2 className="size-3.5 text-destructive" />
          </TooltipTrigger>
          <TooltipContent>{deleteLabel}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
