import { useCallback, useEffect, useRef, useState } from "react";

export interface ResourceState<T> {
  data: T | null;
  error: Error | null;
  initialLoading: boolean;
  refreshing: boolean;
  stale: boolean;
  retry: () => void;
}

export const useResource = <T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
): ResourceState<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [generation, setGeneration] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    setError(null);
    void loadRef
      .current(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause : new Error("UNKNOWN_ERROR"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });
    return () => controller.abort();
  }, [key, generation]);

  return {
    data,
    error,
    initialLoading: data === null && refreshing,
    refreshing: data !== null && refreshing,
    stale: data !== null && error !== null,
    retry: useCallback(() => setGeneration((value) => value + 1), []),
  };
};
