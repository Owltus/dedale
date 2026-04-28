import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import {
  isDynamicImportError,
  reloadAfterDynamicImportError,
} from "@/lib/setup/handle-preload-error";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isReloading: boolean;
}

/// Capture les erreurs synchrones dans l'arbre de composants enfants.
/// Cas particulier : si l'erreur est un échec d'import dynamique (chunk
/// périmé, HMR transitoire, app.restart() Tauri), déclenche un reload
/// silencieux au lieu d'afficher le fallback d'erreur.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isReloading: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, isReloading: isDynamicImportError(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (isDynamicImportError(error)) {
      const reloading = reloadAfterDynamicImportError();
      if (!reloading) {
        // En cooldown — on laisse le fallback normal s'afficher pour ne pas
        // boucler. Désactive le mode "Rechargement..." transitoire.
        this.setState({ isReloading: false });
      }
      return;
    }
    console.error("ErrorBoundary a capturé une erreur :", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isReloading) {
        return (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">Rechargement...</p>
          </div>
        );
      }
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <AlertTriangle className="size-12 text-destructive" />
          <h2 className="text-lg font-semibold">Une erreur est survenue</h2>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {this.state.error?.message ?? "Erreur inconnue"}
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null, isReloading: false })}
          >
            Réessayer
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
