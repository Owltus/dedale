import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/components/layout";

// Labels français pour le breadcrumb
export const ROUTE_LABELS: Record<string, string> = {
  "/planning": "Planning",
  "/ordres-travail": "Ordres de travail",
  "/gammes": "Gammes",
  "/modeles": "Modèles",
  "/equipements": "Équipements",
  "/localisations": "Localisations",
  "/prestataires": "Prestataires",
  "/techniciens": "Techniciens",
  "/demandes": "Demandes d'intervention",
  "/documents": "Documents",
  "/parametres": "Paramètres",
  "/parametres/etablissement": "Établissement",
};

// Lazy imports des pages
const Dashboard = lazy(() =>
  import("@/pages/dashboard/index").then((m) => ({ default: m.Dashboard }))
);
const Planning = lazy(() =>
  import("@/pages/planning/index").then((m) => ({ default: m.Planning }))
);
const OrdresTravailList = lazy(() =>
  import("@/pages/ordres-travail/index").then((m) => ({ default: m.OrdresTravailList }))
);
const OrdresTravailDetail = lazy(() =>
  import("@/pages/ordres-travail/[id]").then((m) => ({ default: m.OrdresTravailDetail }))
);
const GammesList = lazy(() =>
  import("@/pages/gammes/index").then((m) => ({ default: m.GammesList }))
);
const GammesDetail = lazy(() =>
  import("@/pages/gammes/[id]").then((m) => ({ default: m.GammesDetail }))
);
const GammesDomaine = lazy(() =>
  import("@/pages/gammes/domaines/[idDomaine]").then((m) => ({ default: m.GammesDomaine }))
);
const GammesFamille = lazy(() =>
  import("@/pages/gammes/familles/[idFamille]").then((m) => ({ default: m.GammesFamille }))
);
// Modèles — layout + tabs + détails imbriqués
const Modeles = lazy(() =>
  import("@/pages/modeles/index").then((m) => ({ default: m.Modeles }))
);
const OperationsTab = lazy(() =>
  import("@/pages/modeles/OperationsTab").then((m) => ({ default: m.OperationsTab }))
);
const EquipementsTab = lazy(() =>
  import("@/pages/modeles/EquipementsTab").then((m) => ({ default: m.EquipementsTab }))
);
const DiTab = lazy(() =>
  import("@/pages/modeles/DiTab").then((m) => ({ default: m.DiTab }))
);
const ModelesOperationsDetail = lazy(() =>
  import("@/pages/modeles-operations/[id]").then((m) => ({ default: m.ModelesOperationsDetail }))
);
const ModelesEquipementsDetail = lazy(() =>
  import("@/pages/modeles-equipements/[id]").then((m) => ({ default: m.ModelesEquipementsDetail }))
);
const CategorieModeleDetail = lazy(() =>
  import("@/pages/modeles-equipements/categories/[idCategorie]").then((m) => ({ default: m.CategorieModeleDetail }))
);
const ModelesDiDetail = lazy(() =>
  import("@/pages/modeles-di/[id]").then((m) => ({ default: m.ModelesDiDetail }))
);
const Equipements = lazy(() =>
  import("@/pages/equipements/index").then((m) => ({ default: m.Equipements }))
);
const EquipementDetail = lazy(() =>
  import("@/pages/equipements/[id]").then((m) => ({ default: m.EquipementDetail }))
);
const DomaineDetail = lazy(() =>
  import("@/pages/equipements/domaines/[idDomaine]").then((m) => ({ default: m.DomaineDetail }))
);
const FamilleDetail = lazy(() =>
  import("@/pages/equipements/familles/[idFamille]").then((m) => ({ default: m.FamilleDetail }))
);
const Localisations = lazy(() =>
  import("@/pages/localisations/index").then((m) => ({ default: m.Localisations }))
);
const BatimentDetail = lazy(() =>
  import("@/pages/localisations/batiments/[idBatiment]").then((m) => ({ default: m.BatimentDetail }))
);
const NiveauDetail = lazy(() =>
  import("@/pages/localisations/niveaux/[idNiveau]").then((m) => ({ default: m.NiveauDetail }))
);
const LocalDetail = lazy(() =>
  import("@/pages/localisations/locaux/[idLocal]").then((m) => ({ default: m.LocalDetail }))
);
const PrestatairesList = lazy(() =>
  import("@/pages/prestataires/index").then((m) => ({ default: m.PrestatairesList }))
);
const PrestatairesDetail = lazy(() =>
  import("@/pages/prestataires/[id]").then((m) => ({ default: m.PrestatairesDetail }))
);
const Techniciens = lazy(() =>
  import("@/pages/techniciens/index").then((m) => ({ default: m.Techniciens }))
);
const TechnicienDetail = lazy(() =>
  import("@/pages/techniciens/[id]").then((m) => ({ default: m.TechnicienDetail }))
);
const DemandesList = lazy(() =>
  import("@/pages/demandes/index").then((m) => ({ default: m.DemandesList }))
);
const DemandesDetail = lazy(() =>
  import("@/pages/demandes/[id]").then((m) => ({ default: m.DemandesDetail }))
);
const Documents = lazy(() =>
  import("@/pages/documents/index").then((m) => ({ default: m.Documents }))
);
const Parametres = lazy(() =>
  import("@/pages/parametres/index").then((m) => ({ default: m.Parametres }))
);
const Etablissement = lazy(() =>
  import("@/pages/parametres/etablissement").then((m) => ({ default: m.Etablissement }))
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "planning", element: <Planning /> },
      { path: "ordres-travail", element: <OrdresTravailList /> },
      { path: "ordres-travail/:id", element: <OrdresTravailDetail /> },
      { path: "gammes", element: <GammesList /> },
      { path: "gammes/domaines/:idDomaine", element: <GammesDomaine /> },
      { path: "gammes/familles/:idFamille", element: <GammesFamille /> },
      { path: "gammes/:id", element: <GammesDetail /> },
      {
        path: "modeles",
        element: <Modeles />,
        children: [
          { index: true, element: <Navigate to="operations" replace /> },
          { path: "operations", element: <OperationsTab /> },
          { path: "operations/:id", element: <ModelesOperationsDetail /> },
          { path: "equipements", element: <EquipementsTab /> },
          { path: "equipements/categories/:idCategorie", element: <CategorieModeleDetail /> },
          { path: "equipements/:id", element: <ModelesEquipementsDetail /> },
          { path: "di", element: <DiTab /> },
          { path: "di/:id", element: <ModelesDiDetail /> },
        ],
      },
      { path: "equipements", element: <Equipements /> },
      { path: "equipements/domaines/:idDomaine", element: <DomaineDetail /> },
      { path: "equipements/familles/:idFamille", element: <FamilleDetail /> },
      { path: "equipements/:id", element: <EquipementDetail /> },
      { path: "localisations", element: <Localisations /> },
      { path: "localisations/batiments/:idBatiment", element: <BatimentDetail /> },
      { path: "localisations/niveaux/:idNiveau", element: <NiveauDetail /> },
      { path: "localisations/locaux/:idLocal", element: <LocalDetail /> },
      { path: "prestataires", element: <PrestatairesList /> },
      { path: "prestataires/:id", element: <PrestatairesDetail /> },
      { path: "techniciens", element: <Techniciens /> },
      { path: "techniciens/:id", element: <TechnicienDetail /> },
      { path: "demandes", element: <DemandesList /> },
      { path: "demandes/:id", element: <DemandesDetail /> },
      { path: "documents", element: <Documents /> },
      { path: "parametres", element: <Parametres /> },
      { path: "parametres/etablissement", element: <Etablissement /> },
    ],
  },
]);
