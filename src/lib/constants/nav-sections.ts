import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  Wrench,
  Server,
  MapPin,
  Building2,
  FolderOpen,
  Layers,
  LineChart,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Opérationnel",
    items: [
      { label: "Tableau de bord", path: "/", icon: LayoutDashboard },
      { label: "Planning", path: "/planning", icon: CalendarDays },
      { label: "Gammes", path: "/gammes", icon: Wrench },
      { label: "Ordres de travail", path: "/ordres-travail", icon: ClipboardList },
      { label: "Demandes d'intervention", path: "/demandes", icon: MessageSquare },
      { label: "Relevés", path: "/releves", icon: LineChart },
      { label: "Documents", path: "/documents", icon: FolderOpen },
    ],
  },
  {
    title: "Référentiels",
    items: [
      { label: "Localisations", path: "/localisations", icon: MapPin },
      { label: "Équipements", path: "/equipements", icon: Server },
      { label: "Prestataires", path: "/prestataires", icon: Building2 },
      { label: "Modèles", path: "/modeles", icon: Layers },
    ],
  },
];
