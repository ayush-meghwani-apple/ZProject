import { storage } from '../storage';
import { newId, now } from '../core/util';
import type { Activity, ActivityType, ID } from '../types/models';

/** Append-only event log. Never mutate existing activities. */
export const ActivityRepository = {
  async log(
    type: ActivityType,
    entity: string,
    entityId: ID,
    payload?: unknown,
  ): Promise<void> {
    const activity: Activity = {
      id: newId(),
      type,
      entity,
      entityId,
      timestamp: now(),
      payload,
    };
    await storage.activities.put(activity);
  },

  async recent(limit = 50): Promise<Activity[]> {
    const all = await storage.activities.getAll();
    return all
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  },
};
