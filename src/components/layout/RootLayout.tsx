import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./Sidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import { BreadcrumbProvider } from "./BreadcrumbContext";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { UploadQueueProvider } from "@/components/shared/UploadQueue";

/// Layout racine : sidebar fixe + zone principale + toaster + file d'upload
export function RootLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" storageKey="dedale-theme">
      <BreadcrumbProvider>
        <UploadQueueProvider>
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex flex-1 flex-col min-h-0">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex flex-1 items-center justify-center">
                      <p className="text-sm text-muted-foreground">Chargement...</p>
                    </div>
                  }
                >
                  <div className="flex flex-1 flex-col min-h-0 overflow-y-auto" data-slot="page-scroll">
                    <Outlet />
                  </div>
                </Suspense>
              </ErrorBoundary>
            </main>
          </div>
          <Toaster />
          <CommandPalette />
        </UploadQueueProvider>
      </BreadcrumbProvider>
    </ThemeProvider>
  );
}
