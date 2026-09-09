import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nextSolarEvent,
  remainingHoursMinutes,
  solarEventsForDate
} from '../js/features/sun-times-domain.js';

test('computes plausible sunrise and sunset for Mainz in September', () => {
  const events = solarEventsForDate(new Date('2026-09-09T00:00:00Z'), 49.99, 8.25);
  assert.ok(events);
  assert.ok(events.sunrise < events.sunset);

  const sunriseHourUtc = events.sunrise.getUTCHours() + events.sunrise.getUTCMinutes() / 60;
  const sunsetHourUtc = events.sunset.getUTCHours() + events.sunset.getUTCMinutes() / 60;

  assert.ok(sunriseHourUtc > 4 && sunriseHourUtc < 6.5);
  assert.ok(sunsetHourUtc > 17 && sunsetHourUtc < 19.5);
});

test('chooses the next event rather than always sunrise or sunset', () => {
  const morning = nextSolarEvent(new Date('2026-09-09T04:00:00Z'), 49.99, 8.25);
  const afternoon = nextSolarEvent(new Date('2026-09-09T12:00:00Z'), 49.99, 8.25);

  assert.equal(morning?.kind, 'sunrise');
  assert.equal(afternoon?.kind, 'sunset');
});

test('after sunset the next event is a later sunrise', () => {
  const event = nextSolarEvent(new Date('2026-09-09T21:00:00Z'), 49.99, 8.25);
  assert.equal(event?.kind, 'sunrise');
  assert.ok(event.at > new Date('2026-09-09T21:00:00Z'));
});

test('formats remaining duration from rounded-up minutes', () => {
  const now = new Date('2026-09-09T10:00:30Z');
  const future = new Date('2026-09-09T12:05:00Z');
  assert.deepEqual(remainingHoursMinutes(now, future), { hours: 2, minutes: 5 });
});
