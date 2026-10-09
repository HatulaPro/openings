import { LocalNotifications } from '@capacitor/local-notifications';

// A reminder to learn something, on the mornings of the working week. The
// notifications repeat weekly and are kept by Android, so they arrive without
// the app having been opened, and survive a restart of the phone.

/** Sunday to Thursday, counted from Sunday as 1. */
const WEEKDAYS = [1, 2, 3, 4, 5];
const HOUR = 8;
const MINUTE = 30;

/** Changes with the schedule or the text, so reminders set by an older build are replaced. */
const VERSION = `v1 ${WEEKDAYS.join('')} ${HOUR}:${MINUTE}`;

export async function scheduleReminders(): Promise<void> {
  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      ({ display } = await LocalNotifications.requestPermissions());
    }
    if (display !== 'granted') return;

    const { notifications: pending } = await LocalNotifications.getPending();
    const set = pending.filter(notification => (notification.extra as { version?: string } | undefined)?.version === VERSION);
    if (set.length === WEEKDAYS.length && pending.length === set.length) return;

    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map(({ id }) => ({ id })) });
    await LocalNotifications.schedule({
      notifications: WEEKDAYS.map(weekday => ({
        id: weekday,
        title: 'Openings',
        body: 'Time to learn something: a few minutes on the line that needs it most.',
        schedule: { on: { weekday, hour: HOUR, minute: MINUTE }, allowWhileIdle: true },
        extra: { version: VERSION },
      })),
    });
  } catch {
    // Without reminders the app works as before.
  }
}
