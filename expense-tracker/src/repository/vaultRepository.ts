import { storage } from '../storage';
import { newId, now } from '../core/util';
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

  async add(label: string, amount: number, note?: string): Promise<VaultItem> {
    const existing = await storage.vaultItems.getAll();
    const order = existing.reduce((mx, v) => Math.max(mx, v.order ?? 0), 0) + 1;
    const ts = now();
    const item: VaultItem = {
      id: newId(),
      label: label.trim(),
      amount,
      note: note?.trim() || undefined,
      order,
      createdAt: ts,
      updatedAt: ts,
    };
    await storage.vaultItems.put(item);
    return item;
  },

  async update(item: VaultItem): Promise<void> {
    await storage.vaultItems.put({ ...item, updatedAt: now() });
  },

  async remove(id: ID): Promise<void> {
    await storage.vaultItems.delete(id);
  },

  async clearAll(): Promise<void> {
    await storage.vaultItems.clear();
  },
};
