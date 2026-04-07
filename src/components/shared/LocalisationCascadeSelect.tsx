import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBatiments, useNiveaux, useLocaux } from "@/hooks/use-localisations";

interface LocalisationCascadeSelectProps {
  value: number | null;
  onChange: (idLocal: number | null) => void;
  labels?: { batiment?: string; niveau?: string; local?: string };
  /** Si fourni, filtre la cascade aux bâtiments/niveaux/locaux contenant des équipements d'une famille */
  filter?: { locaux: number[]; niveaux: number[]; batiments: number[] };
}

/// Sélection en cascade : Bâtiment (si >1) → Niveau → Local
export function LocalisationCascadeSelect({ value, onChange, labels, filter }: LocalisationCascadeSelectProps) {
  const { data: batimentsAll = [] } = useBatiments();
  const [selectedBatiment, setSelectedBatiment] = useState<number | null>(null);
  const [selectedNiveau, setSelectedNiveau] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: niveauxAll = [] } = useNiveaux(selectedBatiment ?? undefined);
  const { data: locauxAll = [] } = useLocaux(selectedNiveau ?? undefined);

  // Filtrage par famille si un filtre est fourni
  const batiments = filter ? batimentsAll.filter(b => filter.batiments.includes(b.id_batiment)) : batimentsAll;
  const niveaux = filter ? niveauxAll.filter(n => filter.niveaux.includes(n.id_niveau)) : niveauxAll;
  const locaux = filter ? locauxAll.filter(l => filter.locaux.includes(l.id_local)) : locauxAll;

  const multiBatiments = batiments.length > 1;
  const labelBatiment = labels?.batiment ?? "Bâtiment";
  const labelNiveau = labels?.niveau ?? "Niveau";
  const labelLocal = labels?.local ?? "Local";

  useEffect(() => {
    if (batiments.length === 1 && !selectedBatiment && batiments[0]) {
      setSelectedBatiment(batiments[0].id_batiment);
    }
  }, [batiments, selectedBatiment]);

  useEffect(() => {
    if (initialized || !value || locaux.length === 0 || niveaux.length === 0) return;
    const local = locaux.find((l) => l.id_local === value);
    if (local) {
      const niveau = niveaux.find((n) => n.id_niveau === local.id_niveau);
      if (niveau) {
        setSelectedBatiment(niveau.id_batiment);
        setSelectedNiveau(niveau.id_niveau);
        setInitialized(true);
      }
    }
  }, [value, locaux, niveaux, initialized]);

  useEffect(() => {
    if (value === null && initialized) {
      setInitialized(false);
      if (batiments.length > 1) setSelectedBatiment(null);
      setSelectedNiveau(null);
    }
  }, [value, initialized, batiments.length]);

  const handleBatimentChange = (v: string | null) => {
    const id = v ? Number(v) : null;
    setSelectedBatiment(id);
    setSelectedNiveau(null);
    onChange(null);
  };

  const handleNiveauChange = (v: string | null) => {
    const id = v ? Number(v) : null;
    setSelectedNiveau(id);
    onChange(null);
  };

  // Mode labels individuels : chaque Select a son propre Label
  if (labels) {
    return (
      <div className="space-y-3">
        {multiBatiments && (
          <div className="space-y-2">
            <Label>{labelBatiment}</Label>
            <Select value={selectedBatiment ? String(selectedBatiment) : undefined} items={Object.fromEntries(batiments.map(b => [String(b.id_batiment), b.nom]))} onValueChange={handleBatimentChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`— ${labelBatiment} —`} />
              </SelectTrigger>
              <SelectContent>
                {batiments.map((b) => (
                  <SelectItem key={b.id_batiment} value={String(b.id_batiment)}>{b.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>{labelNiveau}</Label>
          <Select value={selectedNiveau ? String(selectedNiveau) : undefined} items={Object.fromEntries(niveaux.map(n => [String(n.id_niveau), n.nom]))} onValueChange={handleNiveauChange} disabled={!selectedBatiment}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`— ${labelNiveau} —`} />
            </SelectTrigger>
            <SelectContent>
              {niveaux.map((n) => (
                <SelectItem key={n.id_niveau} value={String(n.id_niveau)}>{n.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{labelLocal}</Label>
          <Select value={value ? String(value) : undefined} items={Object.fromEntries(locaux.map(l => [String(l.id_local), l.nom]))} onValueChange={(v) => onChange(v ? Number(v) : null)} disabled={!selectedNiveau}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`— ${labelLocal} —`} />
            </SelectTrigger>
            <SelectContent>
              {locaux.map((l) => (
                <SelectItem key={l.id_local} value={String(l.id_local)}>{l.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  // Mode compact original : un seul Label "Localisation"
  return (
    <div className="space-y-2">
      <Label>Localisation</Label>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {multiBatiments && (
            <Select value={selectedBatiment ? String(selectedBatiment) : undefined} items={Object.fromEntries(batiments.map(b => [String(b.id_batiment), b.nom]))} onValueChange={handleBatimentChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— Bâtiment —" />
              </SelectTrigger>
              <SelectContent>
                {batiments.map((b) => (
                  <SelectItem key={b.id_batiment} value={String(b.id_batiment)}>{b.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedNiveau ? String(selectedNiveau) : undefined} items={Object.fromEntries(niveaux.map(n => [String(n.id_niveau), n.nom]))} onValueChange={handleNiveauChange} disabled={!selectedBatiment}>
            <SelectTrigger className={multiBatiments ? "w-full" : "w-full col-span-2"}>
              <SelectValue placeholder="— Niveau —" />
            </SelectTrigger>
            <SelectContent>
              {niveaux.map((n) => (
                <SelectItem key={n.id_niveau} value={String(n.id_niveau)}>{n.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={value ? String(value) : undefined} items={Object.fromEntries(locaux.map(l => [String(l.id_local), l.nom]))} onValueChange={(v) => onChange(v ? Number(v) : null)} disabled={!selectedNiveau}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— Local —" />
          </SelectTrigger>
          <SelectContent>
            {locaux.map((l) => (
              <SelectItem key={l.id_local} value={String(l.id_local)}>{l.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
