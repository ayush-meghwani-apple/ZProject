import { storage } from '../storage';
import { newId, now } from '../core/util';
import type { Goal, ID } from '../types/models';

export type NewGoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>;

export const GoalRepository = {
  async getGoals(): Promise<Goal[]> {
    const all = await storage.goals.getAll();
    // Newest first.
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async addGoal(input: NewGoalInput): Promise<Goal> {
    const ts = now();
    const goal: Goal = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
    await storage.goals.put(goal);
    return goal;
  },

  async updateGoal(goal: Goal): Promise<void> {
    await storage.goals.put({ ...goal, updatedAt: now() });
  },

  async deleteGoal(id: ID): Promise<void> {
    await storage.goals.delete(id);
  },
};
