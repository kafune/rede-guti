import { useCallback, useEffect, useState } from 'react';
import { Igreja, IgrejaFormData, IgrejaPayload } from '../../types';
import {
  createIgreja,
  deleteIgreja,
  fetchIgrejas,
  getApiErrorMessage,
  updateIgreja
} from '../../api';

/**
 * Camada de dados do módulo de igrejas. Espelha a interface do spec original
 * (ChurchContext/useChurches) sem exigir um Provider global — o estado vive no
 * hook e é consumido pela tela de igrejas. Carrega no mount e mantém em estado.
 */
export interface UseChurches {
  churches: Igreja[];
  loading: boolean;
  error: string | null;
  addChurch: (data: IgrejaPayload) => Promise<Igreja>;
  updateChurch: (id: string, data: Partial<IgrejaFormData>) => Promise<Igreja>;
  deleteChurch: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useChurches = (): UseChurches => {
  const [churches, setChurches] = useState<Igreja[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setChurches(await fetchIgrejas());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar as igrejas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchIgrejas()
      .then((list) => active && setChurches(list))
      .catch((err) => active && setError(getApiErrorMessage(err, 'Não foi possível carregar as igrejas.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const addChurch = useCallback(async (data: IgrejaPayload) => {
    const created = await createIgreja(data);
    setChurches((prev) => [created, ...prev].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    return created;
  }, []);

  const updateChurch = useCallback(async (id: string, data: Partial<IgrejaFormData>) => {
    const updated = await updateIgreja(id, data);
    setChurches((prev) =>
      prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    );
    return updated;
  }, []);

  const deleteChurch = useCallback(async (id: string) => {
    await deleteIgreja(id);
    setChurches((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { churches, loading, error, addChurch, updateChurch, deleteChurch, refresh };
};
