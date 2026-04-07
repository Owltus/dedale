import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export interface BreadcrumbCrumb {
  label: string;
  path: string;
}

// Contexte labels individuels (pour les pages standard)
const BreadcrumbLabelContext = createContext<Map<string, string>>(new Map());
const BreadcrumbLabelSetterContext = createContext<(path: string, label: string) => void>(() => {});

// Contexte trail custom (remplace entièrement le breadcrumb auto-généré)
const BreadcrumbTrailContext = createContext<BreadcrumbCrumb[] | null>(null);
const BreadcrumbTrailSetterContext = createContext<(trail: BreadcrumbCrumb[] | null) => void>(() => {});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [trail, setTrail] = useState<BreadcrumbCrumb[] | null>(null);

  const setLabel = useCallback((path: string, label: string) => {
    setLabels((prev) => {
      if (prev.get(path) === label) return prev;
      const next = new Map(prev);
      next.set(path, label);
      return next;
    });
  }, []);

  const setTrailCb = useCallback((t: BreadcrumbCrumb[] | null) => {
    setTrail(t);
  }, []);

  return (
    <BreadcrumbLabelContext.Provider value={labels}>
      <BreadcrumbLabelSetterContext.Provider value={setLabel}>
        <BreadcrumbTrailContext.Provider value={trail}>
          <BreadcrumbTrailSetterContext.Provider value={setTrailCb}>
            {children}
          </BreadcrumbTrailSetterContext.Provider>
        </BreadcrumbTrailContext.Provider>
      </BreadcrumbLabelSetterContext.Provider>
    </BreadcrumbLabelContext.Provider>
  );
}

export function useBreadcrumbLabels() {
  return useContext(BreadcrumbLabelContext);
}

export function useSetBreadcrumbLabel(path: string, label: string | undefined) {
  const setLabel = useContext(BreadcrumbLabelSetterContext);
  useEffect(() => {
    if (label) setLabel(path, label);
  }, [path, label, setLabel]);
}

export function useBreadcrumbTrail() {
  return useContext(BreadcrumbTrailContext);
}

/// Déclare un fil d'Ariane custom complet pour la page courante
export function useSetBreadcrumbTrail(crumbs: BreadcrumbCrumb[]) {
  const setTrail = useContext(BreadcrumbTrailSetterContext);
  const json = JSON.stringify(crumbs);
  useEffect(() => {
    const parsed = JSON.parse(json) as BreadcrumbCrumb[];
    if (parsed.length > 0) setTrail(parsed);
    return () => setTrail(null);
  }, [json, setTrail]);
}
