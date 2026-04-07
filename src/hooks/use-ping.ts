import { useInvokeQuery } from "./useInvoke";

/// Hook pour la commande ping — retourne la version SQLite
export function usePing() {
  return useInvokeQuery<string>("ping");
}
