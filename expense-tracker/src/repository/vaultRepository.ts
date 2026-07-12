import { storage } from '../storage';
import type { ID, VaultItem } from '../types/models';

export const VaultRepository = {
  async list(): Promise<VaultItem[]> {
    const all = await storage.vaultItems.getAll();
    return all
      .map((v, i) => ({ v, i }))
      .sort((a, b) => {
        const ao = a.v.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.v.order ?? Number.MAX_SAFE_INTEGER;
        return ao === bo ? a.i - b.i : ao - bo;
      })
      .map((x) => x.v);
  },

  /** Store a raw (already-encrypted) item. */
  async put(item: VaultItem): Promise<void> {
    await storage.vaultItems.put(item);
  },

  async nextOrder(): Promise<number> {
    const all = await storage.vaultItems.getAll();
    return all.reduce((mx, v) => Math.max(mx, v.order ?? 0), 0) + 1;
  },

  async remove(id: ID): Promise<void> {
    await storage.vaultItems.delete(id);
  },

  async clearAll(): Promise<void> {
    await storage.vaultItems.clear();
  },
};
