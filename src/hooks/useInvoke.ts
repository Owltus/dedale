import { invoke } from "@tauri-apps/api/core";
import {
  useQuery,
  useMutation,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";

/// Hook générique pour les requêtes en lecture via invoke()
/// queryKey custom supporté pour aligner invalidation et cache
export function useInvokeQuery<T>(
  command: string,
  params?: Record<string, unknown>,
  options?: Omit<UseQueryOptions<T, Error>, "queryFn" | "queryKey"> & { queryKey?: readonly unknown[] }
) {
  const { queryKey: customKey, ...restOptions } = options ?? {};
  return useQuery<T, Error>({
    queryKey: customKey ?? (params ? [command, params] : [command]),
    queryFn: () => invoke<T>(command, params),
    ...restOptions,
  });
}

/// Hook générique pour les mutations via invoke()
export function useInvokeMutation<
  TData = unknown,
  TVariables = Record<string, unknown>,
>(
  command: string,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">
) {
  return useMutation<TData, Error, TVariables>({
    mutationFn: (params) =>
      invoke<TData>(command, params as Record<string, unknown>),
    onError: (error) => {
      toast.error(String(error));
    },
    ...options,
  });
}
