import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBatiments, useNiveaux, useLocaux, useLocalisationFromLocal } from "@/hooks/use-localisations";

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

  // Fetch unique de toutes les localisations puis filtrage client-side.
  // Évite les changements de queryKey en cours de cascade qui créent des gaps
  // où `data = undefined` le temps qu'une nouvelle fetch aboutisse.
  const { data: niveauxAll = [] } = useNiveaux();
  const { data: locauxAll = [] } = useLocaux();

  // Résolution directe du triplet {bâtiment, niveau, local} à partir de la value,
  // indépendante des listes cascadées — évite la race entre effets au chargement.
  const resolved = useLocalisationFromLocal(value);

  // Cascade : on filtre d'abord par la sélection courante, puis par le filtre famille éventuel
  const niveauxPourBatiment = selectedBatiment
    ? niveauxAll.filter(n => n.id_batiment === selectedBatiment)
    : niveauxAll;
  const locauxPourNiveau = selectedNiveau
    ? locauxAll.filter(l => l.id_niveau === selectedNiveau)
    : locauxAll;

  const batiments = filter ? batimentsAll.filter(b => filter.batiments.includes(b.id_batiment)) : batimentsAll;
  const niveaux = filter ? niveauxPourBatiment.filter(n => filter.niveaux.includes(n.id_niveau)) : niveauxPourBatiment;
  const locaux = filter ? locauxPourNiveau.filter(l => filter.locaux.includes(l.id_local)) : locauxPourNiveau;

  const multiBatiments = batiments.length > 1;
  const labelBatiment = labels?.batiment ?? "Bâtiment";
  const labelNiveau = labels?.niveau ?? "Niveau";
  const labelLocal = labels?.local ?? "Local";

  // Auto-sélection du bâtiment unique (cas création sans value fournie)
  useEffect(() => {
    if (batiments.length === 1 && !selectedBatiment && batiments[0]) {
      setSelectedBatiment(batiments[0].id_batiment);
    }
  }, [batiments, selectedBatiment]);

  // `internalClear` distingue un value=null venant d'un handler (cascade modifiée par user,
  // sélection interne déjà à jour) d'un value=null externe (parent qui reset, reset complet requis).
  const lastSyncedValue = useRef<number | null>(null);
  const internalClear = useRef(false);
  useEffect(() => {
    if (value === null) {
      if (internalClear.current) {
        internalClear.current = false;
        lastSyncedValue.current = null;
        return;
      }
      if (lastSyncedValue.current !== null) {
        if (batiments.length > 1) setSelectedBatiment(null);
        setSelectedNiveau(null);
        lastSyncedValue.current = null;
      }
      return;
    }
    if (!resolved || resolved.id_local !== value || lastSyncedValue.current === value) return;
    setSelectedBatiment(resolved.id_batiment);
    setSelectedNiveau(resolved.id_niveau);
    lastSyncedValue.current = value;
  }, [value, resolved, batiments.length]);

  const handleBatimentChange = (v: string | null) => {
    const id = v ? Number(v) : null;
    internalClear.current = true;
    setSelectedBatiment(id);
    setSelectedNiveau(null);
    onChange(null);
  };

  const handleNiveauChange = (v: string | null) => {
    const id = v ? Number(v) : null;
    internalClear.current = true;
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
            <Select value={selectedBatiment ? String(selectedBatiment) : ""} items={Object.fromEntries(batiments.map(b => [String(b.id_batiment), b.nom]))} onValueChange={handleBatimentChange}>
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
          <Select value={selectedNiveau ? String(selectedNiveau) : ""} items={Object.fromEntries(niveaux.map(n => [String(n.id_niveau), n.nom]))} onValueChange={handleNiveauChange} disabled={!selectedBatiment}>
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
          <Select value={value ? String(value) : ""} items={Object.fromEntries(locaux.map(l => [String(l.id_local), l.nom]))} onValueChange={(v) => onChange(v ? Number(v) : null)} disabled={!selectedNiveau}>
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
            <Select value={selectedBatiment ? String(selectedBatiment) : ""} items={Object.fromEntries(batiments.map(b => [String(b.id_batiment), b.nom]))} onValueChange={handleBatimentChange}>
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

          <Select value={selectedNiveau ? String(selectedNiveau) : ""} items={Object.fromEntries(niveaux.map(n => [String(n.id_niveau), n.nom]))} onValueChange={handleNiveauChange} disabled={!selectedBatiment}>
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

        <Select value={value ? String(value) : ""} items={Object.fromEntries(locaux.map(l => [String(l.id_local), l.nom]))} onValueChange={(v) => onChange(v ? Number(v) : null)} disabled={!selectedNiveau}>
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
