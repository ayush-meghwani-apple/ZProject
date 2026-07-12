import { storage } from '../storage';
import { newId } from '../core/util';
import type { ID, PaymentMethod } from '../types/models';

/** A sensible starting set for a new install (or an empty methods table). */
const DEFAULTS: { name: string; icon: string }[] = [
  { name: 'Cash', icon: '💵' },
  { name: 'UPI', icon: '📲' },
  { name: 'UPI Lite', icon: '⚡' },
  { name: 'Credit Card', icon: '💳' },
  { name: 'Bank Account', icon: '🏦' },
  { name: 'Splitwise', icon: '🤝' },
];

export const PaymentMethodRepository = {
  /** All non-archived methods, in manual order then by name. */
  async list(): Promise<PaymentMethod[]> {
    const all = await storage.paymentMethods.getAll();
    return all
      .filter((m) => !m.archived)
      .map((m, i) => ({ m, i }))
      .sort((a, b) => {
        const ao = a.m.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.m.order ?? Number.MAX_SAFE_INTEGER;
        return ao === bo ? a.i - b.i : ao - bo;
      })
      .map((x) => x.m);
  },

  async add(name: string, icon?: string): Promise<PaymentMethod> {
    const existing = await storage.paymentMethods.getAll();
    const order = existing.reduce((mx, m) => Math.max(mx, m.order ?? 0), 0) + 1;
    const method: PaymentMethod = { id: newId(), name: name.trim(), icon, order };
    await storage.paymentMethods.put(method);
    return method;
  },

  async update(method: PaymentMethod): Promise<void> {
    await storage.paymentMethods.put(method);
  },

  async remove(id: ID): Promise<void> {
    await storage.paymentMethods.delete(id);
  },

  /** Seed the default methods if none exist yet (safe to call on every boot). */
  async ensureDefaults(): Promise<void> {
    const all = await storage.paymentMethods.getAll();
    if (all.length > 0) return;
    await storage.paymentMethods.bulkPut(
      DEFAULTS.map((d, i) => ({ id: newId(), name: d.name, icon: d.icon, order: i + 1 })),
    );
  },
};
