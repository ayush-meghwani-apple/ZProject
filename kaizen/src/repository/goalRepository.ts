import { storage } from '../storage';
import { newId, now } from '../core/util';
import type { Goal, GoalPlanItem, ID } from '../types/models';

export type NewPlanItemInput = Omit<GoalPlanItem, 'id'>;
export type NewGoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>;

/** Give a fresh id to any plan items that don't have one yet. */
function withItemIds(items: (GoalPlanItem | NewPlanItemInput)[]): GoalPlanItem[] {
  return items.map((it) =>
    'id' in it && it.id ? (it as GoalPlanItem) : { ...it, id: newId() },
  );
}

export const GoalRepository = {
  async getGoals(): Promise<Goal[]> {
    const all = await storage.goals.getAll();
    // Newest first.
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async addGoal(input: NewGoalInput): Promise<Goal> {
    const ts = now();
    const goal: Goal = {
      ...input,
      items: withItemIds(input.items),
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    };
    await storage.goals.put(goal);
    return goal;
  },

  async updateGoal(goal: Goal): Promise<void> {
    await storage.goals.put({ ...goal, items: withItemIds(goal.items), updatedAt: now() });
  },

  async deleteGoal(id: ID): Promise<void> {
    await storage.goals.delete(id);
  },
};
