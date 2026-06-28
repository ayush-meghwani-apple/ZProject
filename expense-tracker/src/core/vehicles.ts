// Display metadata for the places money can sit inside a goal plan block.
// Kept separate from the data model so the UI can render icons/labels without
// the persisted records carrying any presentation details.

import type { SavingsVehicle } from '../types/models';

export const VEHICLES: Record<SavingsVehicle, { label: string; icon: string }> = {
  bank: { label: 'Bank account', icon: '🏦' },
  rd: { label: 'Recurring deposit', icon: '🏧' },
  mutual_fund: { label: 'Mutual fund', icon: '📈' },
  bonds: { label: 'Bonds', icon: '📜' },
  fd: { label: 'Fixed deposit', icon: '🔒' },
  other: { label: 'Other', icon: '💰' },
};

/** Vehicles offered for a recurring (monthly) saving block. */
export const RECURRING_VEHICLES: SavingsVehicle[] = ['bank', 'rd', 'mutual_fund', 'bonds', 'other'];

/** Vehicles offered for a lump-sum / one-time deposit block. */
export const LUMPSUM_VEHICLES: SavingsVehicle[] = ['fd', 'bonds', 'mutual_fund', 'other'];

/** Resolve a block's vehicle to its icon, falling back by kind. */
export function vehicleIcon(vehicle: SavingsVehicle | undefined, isRecurring: boolean): string {
  if (vehicle && VEHICLES[vehicle]) return VEHICLES[vehicle].icon;
  return isRecurring ? '🔁' : '🔒';
}
