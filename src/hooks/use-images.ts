import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { Image, ImageInput, ImageLibraryItem } from "@/lib/types/images";

export const imageKeys = {
  all: ["images"] as const,
  detail: (id: number) => ["images", id] as const,
};

/// Images immutables après upload → staleTime Infinity, invalidées par les mutations

export function useImages(enabled = true) {
  return useInvokeQuery<ImageLibraryItem[]>(
    "get_images",
    {},
    { queryKey: imageKeys.all, enabled, staleTime: Infinity },
  );
}

export function useImage(id: number | null | undefined) {
  return useInvokeQuery<Image>(
    "get_image",
    { id: id! },
    { queryKey: imageKeys.detail(id!), enabled: !!id, staleTime: Infinity },
  );
}

export function useUploadImage() {
  const qc = useQueryClient();
  return useInvokeMutation<Image, { input: ImageInput }>(
    "upload_image",
    { onSettled: () => qc.invalidateQueries({ queryKey: imageKeys.all }) },
  );
}

export function useDeleteImage() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_image",
    {
      onSettled: () => {
        qc.invalidateQueries({ queryKey: imageKeys.all });
        qc.invalidateQueries({ queryKey: ["gammes"] });
        qc.invalidateQueries({ queryKey: ["equipements"] });
        qc.invalidateQueries({ queryKey: ["ordres-travail"] });
      },
    },
  );
}
