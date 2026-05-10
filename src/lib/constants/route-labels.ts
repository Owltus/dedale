import { NAV_SECTIONS } from "@/lib/constants/nav-sections";

// Labels français pour le breadcrumb — dérivés de la sidebar + routes hors navigation
const navLabels = Object.fromEntries(
  NAV_SECTIONS.flatMap((section) => section.items)
    .filter((item) => item.path !== "/")
    .map((item) => [item.path, item.label])
);

export const ROUTE_LABELS: Record<string, string> = {
  ...navLabels,
  "/parametres": "Paramètres",
};
