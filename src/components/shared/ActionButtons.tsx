import { Pencil, Trash2, Unlink2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconActionProps {
  icon: ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}

function IconAction({ icon, label, onClick }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); onClick(e); }} />}>
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface ActionButtonsProps {
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onUnlink?: (e: React.MouseEvent) => void;
  editLabel?: string;
  deleteLabel?: string;
  unlinkLabel?: string;
  extra?: ReactNode;
}

export function ActionButtons({ onEdit, onDelete, onUnlink, editLabel = "Modifier", deleteLabel = "Supprimer", unlinkLabel = "Retirer", extra }: ActionButtonsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {extra}
      {onEdit && <IconAction icon={<Pencil className="size-3.5" />} label={editLabel} onClick={onEdit} />}
      {onUnlink && <IconAction icon={<Unlink2 className="size-3.5 text-destructive" />} label={unlinkLabel} onClick={onUnlink} />}
      {onDelete && <IconAction icon={<Trash2 className="size-3.5 text-destructive" />} label={deleteLabel} onClick={onDelete} />}
    </div>
  );
}
