import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { ROUTE_LABELS } from "@/router";
import { useBreadcrumbLabels, useBreadcrumbTrail } from "./BreadcrumbContext";

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
}

/// En-tête de page — fil-titre fusionné, style homogène
export function PageHeader({ title, children }: PageHeaderProps) {
  const location = useLocation();
  const dynamicLabels = useBreadcrumbLabels();
  const trail = useBreadcrumbTrail();

  const allCrumbs = trail ?? buildAutoCrumbs(location.pathname, dynamicLabels);
  const parentCrumbs = allCrumbs.slice(0, -1);

  return (
    <div className="flex items-center justify-between gap-4">
      <nav className="flex items-center gap-1.5 min-w-0 text-lg">
        {parentCrumbs.map((crumb) => (
          <Fragment key={crumb.path}>
            <Link
              to={crumb.path}
              title={crumb.label}
              className="max-w-[20ch] truncate text-muted-foreground hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
          </Fragment>
        ))}
        <h1 className="font-semibold truncate" title={title}>{title}</h1>
      </nav>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

/// Construction automatique des crumbs à partir de l'URL
function buildAutoCrumbs(pathname: string, dynamicLabels: Map<string, string>) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; path: string }[] = [];
  let currentPath = "";

  for (const segment of segments) {
    currentPath += `/${segment}`;
    const label = ROUTE_LABELS[currentPath];

    if (label) {
      crumbs.push({ label, path: currentPath });
    } else {
      const dynamicLabel = dynamicLabels.get(currentPath);
      crumbs.push({ label: dynamicLabel ?? `#${segment}`, path: currentPath });
    }
  }

  return crumbs;
}
