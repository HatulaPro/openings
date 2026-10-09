import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answered, type Entry, levelOf, type Mastery, standingAt } from '../src/progress.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const mastery = (counts: Partial<Mastery>): Mastery => {
  const full = { solid: 0, learning: 0, fading: 0, missed: 0, untested: 0, ...counts };
  return { ...full, total: full.solid + full.learning + full.fading + full.missed + full.untested };
};

test('a position is solid after two first-attempt answers and missed after one miss', () => {
  let entry: Entry | undefined;
  assert.equal(standingAt(entry, 0), 'untested');
  entry = answered(entry, true, 0);
  assert.equal(standingAt(entry, 0), 'learning');
  entry = answered(entry, true, 1000);
  assert.equal(standingAt(entry, 1000), 'solid');
  entry = answered(entry, false, 2000);
  assert.equal(standingAt(entry, 2000), 'missed');
});

test('a solid position fades with time, later when it was found on more days', () => {
  let entry = answered(answered(undefined, true, 0), true, 0);
  assert.equal(standingAt(entry, 3 * DAY), 'solid');
  assert.equal(standingAt(entry, 5 * DAY), 'fading');
  entry = answered(entry, true, 5 * DAY);
  assert.equal(standingAt(entry, 5 * DAY), 'solid');
  assert.equal(standingAt(entry, 14 * DAY), 'solid');
  assert.equal(standingAt(entry, 16 * DAY), 'fading');
});

test('repeating a known position in one sitting does not make it last longer', () => {
  let entry = answered(answered(undefined, true, 0), true, 0);
  for (let i = 1; i <= 5; i++) entry = answered(entry, true, i * 60_000);
  assert.equal(entry[0], 2);
  assert.equal(answered(entry, true, 9 * HOUR)[0], 3);
});

test('the level takes coverage into account', () => {
  assert.equal(levelOf(mastery({ untested: 40 })).label, 'Not tested');
  assert.equal(levelOf(mastery({ solid: 10, untested: 30 })).label, 'Started');
  assert.equal(levelOf(mastery({ solid: 20, missed: 8, untested: 12 })).label, 'Shaky');
  assert.equal(levelOf(mastery({ solid: 20, learning: 10, untested: 10 })).label, 'Learning');
  assert.equal(levelOf(mastery({ solid: 20, fading: 18, learning: 2 })).label, 'Rusty');
  assert.equal(levelOf(mastery({ solid: 37, learning: 3 })).label, 'Solid');
});
