import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface HeaderButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
  className?: string;
}

export function HeaderButton({ icon, label, onClick, variant = "outline", disabled, className }: HeaderButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant={variant} size="icon" className={cn("size-8", className)} onClick={onClick} disabled={disabled} />}>
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
