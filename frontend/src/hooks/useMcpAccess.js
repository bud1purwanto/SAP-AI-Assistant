import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useLanguage } from './useLanguage';

const normalizeKey = (value) => String(value || '').toLowerCase().trim();

export const useMcpAccessRequests = (enabled = true) => {
  const { t } = useLanguage();
  const [targets, setTargets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTargets = useCallback(async () => {
    if (!enabled) return [];
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.mcpAccessTargets();
      const list = Array.isArray(data?.targets)
        ? data.targets
        : Array.isArray(data)
          ? data
          : [];
      setTargets(list);
      return list;
    } catch (e) {
      setError(e.message || 'Failed to load access targets');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) fetchTargets();
  }, [enabled, fetchTargets]);

  const byResourceKey = useMemo(() => {
    const map = {};
    targets.forEach((entry) => {
      if (entry.resourceKey) map[normalizeKey(entry.resourceKey)] = entry;
      if (entry.resource_key) map[normalizeKey(entry.resource_key)] = entry;
    });
    return map;
  }, [targets]);

  const byName = useMemo(() => {
    const map = {};
    targets.forEach((entry) => {
      if (entry.name) map[normalizeKey(entry.name)] = entry;
    });
    return map;
  }, [targets]);

  const lookupTarget = useCallback(
    (server) => {
      if (!server) return null;
      const candidates = [
        server.resource_key,
        server.resourceKey,
        server.name,
        server.alias,
        ...(Array.isArray(server.aliases) ? server.aliases : []),
      ];
      for (const cand of candidates) {
        const key = normalizeKey(cand);
        if (!key) continue;
        if (byResourceKey[key]) return byResourceKey[key];
        if (byName[key]) return byName[key];
      }
      return null;
    },
    [byName, byResourceKey],
  );

  const submitRequest = useCallback(
    async (connectionId, reason) => {
      if (!connectionId) throw new Error(t('mcp.requestFailed'));
      try {
        const result = await api.requestMcpAccess({ connectionId, reason });
        await fetchTargets();
        return result;
      } catch (e) {
        throw new Error(e.message || t('mcp.requestFailed'));
      }
    },
    [fetchTargets, t],
  );

  return { targets, isLoading, error, refresh: fetchTargets, lookupTarget, submitRequest };
};
