import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

/// Input de recherche avec debounce intégré
export function SearchInput({
  value,
  onChange,
  placeholder = "Rechercher...",
  debounceMs = 300,
}: SearchInputProps) {
  const [internal, setInternal] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setInternal(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => onChangeRef.current(internal), debounceMs);
    return () => clearTimeout(timer);
  }, [internal, debounceMs]);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
