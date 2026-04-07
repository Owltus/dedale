import { useEffect, useRef, useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { fr } from "date-fns/locale";
import { useIMask } from "react-imask";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangePickerProps {
  from: Date | undefined;
  to: Date | undefined;
  onSelect: (range: { from: Date | undefined; to: Date | undefined }) => void;
  className?: string;
}

const DATE_FMT = "dd/MM/yyyy";
const MASK = "from{/}From{/}FROM — to{/}To{/}TO";
const START_MONTH = new Date(2020, 0);
const END_MONTH = new Date(2035, 11);

/// Tente de parser une valeur masquée en plage de dates
function parseMasked(text: string): { from: Date | undefined; to: Date | undefined } | null {
  const parts = text.split(" — ").map((s) => s.trim());
  if (parts.length >= 1 && parts[0]) {
    const d1 = parse(parts[0], DATE_FMT, new Date());
    if (!isValid(d1)) return null;
    if (parts.length === 2 && parts[1]) {
      const d2 = parse(parts[1], DATE_FMT, new Date());
      if (isValid(d2)) return { from: d1, to: d2 };
    }
    return { from: d1, to: undefined };
  }
  return null;
}

function formatRange(from: Date | undefined, to: Date | undefined): string {
  if (!from) return "";
  if (!to) return format(from, DATE_FMT, { locale: fr });
  return `${format(from, DATE_FMT, { locale: fr })} — ${format(to, DATE_FMT, { locale: fr })}`;
}

/// Sélecteur de plage de dates avec masque de saisie et calendrier
export function DateRangePicker({ from, to, onSelect, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const externalUpdate = useRef(false);

  const { ref, setValue, value } = useIMask({
    mask: MASK,
    lazy: false,
    overwrite: true,
    blocks: {
      from: { mask: "00", placeholderChar: "j" },
      From: { mask: "00", placeholderChar: "m" },
      FROM: { mask: "0000", placeholderChar: "a" },
      to: { mask: "00", placeholderChar: "j" },
      To: { mask: "00", placeholderChar: "m" },
      TO: { mask: "0000", placeholderChar: "a" },
    },
  }, {
    onComplete: (val) => {
      if (externalUpdate.current) return;
      const parsed = parseMasked(val);
      if (parsed) onSelect(parsed);
    },
  });

  // Synchronise la valeur quand la sélection change depuis le calendrier ou le reset
  useEffect(() => {
    externalUpdate.current = true;
    setValue(formatRange(from, to));
    // Petit délai pour que le flag reste actif pendant le cycle de mise à jour du masque
    requestAnimationFrame(() => { externalUpdate.current = false; });
  }, [from, to, setValue]);

  const handleCalendarSelect = (range: DateRange | undefined) => {
    onSelect({ from: range?.from, to: range?.to });
  };

  const handleBlur = () => {
    const parsed = parseMasked(value);
    if (parsed) {
      onSelect(parsed);
    } else if (value) {
      // Saisie incomplète → remet la dernière valeur valide
      setValue(formatRange(from, to));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative flex items-center", className)}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="absolute left-2.5 z-10 flex items-center text-muted-foreground hover:text-foreground"
            />
          }
        >
          <CalendarIcon className="size-4" />
        </PopoverTrigger>
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          placeholder="jj/mm/aaaa — jj/mm/aaaa"
          onBlur={handleBlur}
          className={cn(
            "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
            "pl-9",
            from && "pr-8"
          )}
        />
        {from && (
          <span
            role="button"
            className="absolute right-2.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect({ from: undefined, to: undefined });
            }}
          >
            <X className="size-3.5" />
          </span>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={{ from, to }}
          onSelect={handleCalendarSelect}
          numberOfMonths={1}
          captionLayout="dropdown"
          showWeekNumber
          weekStartsOn={1}
          ISOWeek
          startMonth={START_MONTH}
          endMonth={END_MONTH}
          locale={fr}
        />
      </PopoverContent>
    </Popover>
  );
}
