import { useCallback, useState, type ReactNode } from "react";
import {
  BreadcrumbLabelContext,
  BreadcrumbLabelSetterContext,
  BreadcrumbTrailContext,
  BreadcrumbTrailSetterContext,
  type BreadcrumbCrumb,
} from "./breadcrumb-context";

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
