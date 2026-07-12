/**
 * Best-effort local notifications. A pure client-side PWA can't schedule true
 * push while closed (that needs a server), but when the app is open we can pop
 * a native notification for anything that's due — which covers the common case
 * of opening the app and being reminded.
 */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Ask for permission (no-op if already decided). Returns whether granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function fireLocalNotification(title: string, body?: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'expensify-reminder' });
  } catch {
    /* some browsers only allow notifications from a service worker; ignore */
  }
}
