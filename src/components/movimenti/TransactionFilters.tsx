import { useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface TransactionFilterValues {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  search: string;
  type: "all" | "income" | "expense";
  status: "all" | "unmatched" | "matched";
}

const INITIAL_FILTERS: TransactionFilterValues = {
  dateFrom: undefined,
  dateTo: undefined,
  search: "",
  type: "all",
  status: "all",
};

interface Props {
  filters: TransactionFilterValues;
  onChange: (filters: TransactionFilterValues) => void;
}

export { INITIAL_FILTERS };

export default function TransactionFilters({ filters, onChange }: Props) {
  const [localFrom, setLocalFrom] = useState<Date | undefined>(filters.dateFrom);
  const [localTo, setLocalTo] = useState<Date | undefined>(filters.dateTo);

  const applyDates = () => {
    onChange({ ...filters, dateFrom: localFrom, dateTo: localTo });
  };

  const setQuick = (from: Date, to: Date) => {
    setLocalFrom(from);
    setLocalTo(to);
    onChange({ ...filters, dateFrom: from, dateTo: to });
  };

  const resetAll = () => {
    setLocalFrom(undefined);
    setLocalTo(undefined);
    onChange(INITIAL_FILTERS);
  };

  const now = new Date();

  const quickFilters = [
    { label: "Questo mese", action: () => setQuick(startOfMonth(now), endOfMonth(now)) },
    { label: "Mese scorso", action: () => setQuick(startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1))) },
    { label: "Ultimi 3 mesi", action: () => setQuick(startOfMonth(subMonths(now, 2)), endOfMonth(now)) },
    { label: "Ultimi 6 mesi", action: () => setQuick(startOfMonth(subMonths(now, 5)), endOfMonth(now)) },
    { label: "Tutto", action: resetAll },
  ];

  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.search || filters.type !== "all" || filters.status !== "all";

  return (
    <div className="space-y-3">
      {/* Quick date filters */}
      <div className="flex flex-wrap items-center gap-2">
        {quickFilters.map((q) => (
          <Button key={q.label} variant="outline" size="sm" onClick={q.action} className="text-xs">
            {q.label}
          </Button>
        ))}
      </div>

      {/* Main filter row */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Date From */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Dal</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !localFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                {localFrom ? format(localFrom, "dd/MM/yyyy") : "Data inizio"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={localFrom} onSelect={setLocalFrom} initialFocus className="p-3 pointer-events-auto" locale={it} />
            </PopoverContent>
          </Popover>
        </div>

        {/* Date To */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Al</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !localTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                {localTo ? format(localTo, "dd/MM/yyyy") : "Data fine"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={localTo} onSelect={setLocalTo} initialFocus className="p-3 pointer-events-auto" locale={it} />
            </PopoverContent>
          </Popover>
        </div>

        <Button size="sm" onClick={applyDates}>Applica filtro</Button>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca descrizione o controparte…"
            className="pl-8 h-9 text-sm"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
          />
        </div>

        {/* Type */}
        <Select value={filters.type} onValueChange={(v) => onChange({ ...filters, type: v as any })}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="income">Solo entrate</SelectItem>
            <SelectItem value="expense">Solo uscite</SelectItem>
          </SelectContent>
        </Select>

        {/* Status */}
        <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v as any })}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="unmatched">Non riconciliato</SelectItem>
            <SelectItem value="matched">Riconciliato</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1 text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>
    </div>
  );
}