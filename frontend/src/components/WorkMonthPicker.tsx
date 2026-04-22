import { useMemo, useState } from "react";
import { format, isValid, parse, startOfMonth } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function parseYearMonth(ym: string | null | undefined): Date | undefined {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return undefined;
  const d = parse(`${ym}-01`, "yyyy-MM-dd", new Date());
  return isValid(d) ? startOfMonth(d) : undefined;
}

function toYearMonth(d: Date): string {
  return format(startOfMonth(d), "yyyy-MM");
}

type WorkMonthPickerProps = {
  id?: string;
  label: string;
  /** Stored as `yyyy-MM` (first of month). */
  value: string | null;
  onChange: (ym: string | null) => void;
  /** When true, show “Present / no end date” to clear the value. */
  allowPresent?: boolean;
};

export function WorkMonthPicker({ id, label, value, onChange, allowPresent }: WorkMonthPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseYearMonth(value);

  const display = useMemo(() => {
    if (allowPresent && (value === null || value === "")) return "Present";
    if (value && /^\d{4}-\d{2}$/.test(value)) {
      const d = parse(`${value}-01`, "yyyy-MM-dd", new Date());
      return isValid(d) ? format(d, "yyyy-MM") : "Select month";
    }
    return "Select month";
  }, [value, allowPresent]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              allowPresent && (value === null || value === "") && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate tabular-nums">{display}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            onSelect={(d) => {
              if (d) {
                onChange(toYearMonth(d));
                setOpen(false);
              }
            }}
            captionLayout="buttons"
            fromDate={new Date(1970, 0, 1)}
            toDate={new Date(2036, 11, 31)}
            initialFocus
            classNames={{
              caption: "flex justify-center pt-1 relative items-center mb-1 gap-1 px-1",
              caption_label: "text-sm font-medium whitespace-nowrap text-center flex-1 min-w-0",
              nav: "flex items-center gap-0 shrink-0",
            }}
          />
          {allowPresent && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                No end date (present)
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
