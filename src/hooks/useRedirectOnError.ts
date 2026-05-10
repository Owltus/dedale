import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/// Redirige vers `path` si une query est passée en isError (entité supprimée, etc.).
/// `replace: true` évite que le retour arrière retombe sur la page disparue.
export function useRedirectOnError(isError: boolean, path: string) {
  const navigate = useNavigate();
  useEffect(() => {
    if (isError) navigate(path, { replace: true });
  }, [isError, navigate, path]);
}
