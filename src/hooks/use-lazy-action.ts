import { Dispatch, SetStateAction, useEffect, useRef } from "react";

interface UseLazyActionParams<T> {
  enabled: boolean;
  setEnabled: Dispatch<SetStateAction<boolean>>;
  data: T[] | undefined;
  isFetching: boolean;
  onResolve: (data: T[]) => void;
}

/// Coordonne un pattern « lazy fetch + action sur résolution » :
/// `trigger()` arme un flag pending puis active la query via `setEnabled`.
/// Quand le fetch se termine, `onResolve` est invoqué une fois avec les
/// données reçues.
///
/// Le caller possède `enabled`/`setEnabled` (via `useState`) pour pouvoir
/// les passer à sa query lazy avant de connaître `data`/`isFetching`. Le
/// ref `pending` évite un re-render intermédiaire entre l'arrivée des
/// données et l'action ; `onResolveRef` capture la dernière callback sans
/// repolluer les deps de l'effect.
export function useLazyAction<T>({
  enabled,
  setEnabled,
  data,
  isFetching,
  onResolve,
}: UseLazyActionParams<T>): () => void {
  const pendingRef = useRef(false);
  const onResolveRef = useRef(onResolve);

  useEffect(() => {
    onResolveRef.current = onResolve;
  }, [onResolve]);

  useEffect(() => {
    if (!pendingRef.current || !enabled || isFetching) return;
    pendingRef.current = false;
    onResolveRef.current(data ?? []);
  }, [enabled, isFetching, data]);

  return () => {
    pendingRef.current = true;
    setEnabled(true);
  };
}
