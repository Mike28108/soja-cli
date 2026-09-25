import { useEffect, useState } from 'react';
import { toDisplayError, type DisplayError } from '../../utils/errors.js';
import { useAppState } from '../app-state.js';

export interface QueryResult<T> {
  data: T | undefined;
  error: DisplayError | null;
  loading: boolean;
}

interface Loaded<T> {
  key: string;
  data: T | undefined;
  error: DisplayError | null;
}

/**
 * Loads data through a service and reloads when `key` or the global data
 * revision changes. Previous data stays on screen while reloading, so
 * nothing flickers after a mutation.
 */
export function useQuery<T>(load: () => Promise<T>, key: string, topics: readonly string[] = [key]): QueryResult<T> {
  const { revision, queryVersion } = useAppState();
  const requestKey = `${key}#${revision}#${queryVersion(topics)}`;
  const [loaded, setLoaded] = useState<Loaded<T>>({ key: '', data: undefined, error: null });

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setLoaded({ key: requestKey, data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ key: requestKey, data: undefined, error: toDisplayError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is recreated every render; `requestKey` describes what it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return { data: loaded.data, error: loaded.error, loading: loaded.key !== requestKey };
}
