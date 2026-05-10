import { createContext, useContext, useEffect } from "react";

export interface BreadcrumbCrumb {
  label: string;
  path: string;
}

// Contexte labels individuels (pour les pages standard)
export const BreadcrumbLabelContext = createContext<Map<string, string>>(new Map());
export const BreadcrumbLabelSetterContext = createContext<(path: string, label: string) => void>(() => {});

// Contexte trail custom (remplace entièrement le breadcrumb auto-généré)
export const BreadcrumbTrailContext = createContext<BreadcrumbCrumb[] | null>(null);
export const BreadcrumbTrailSetterContext = createContext<(trail: BreadcrumbCrumb[] | null) => void>(() => {});

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
