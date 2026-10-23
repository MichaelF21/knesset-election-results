// Mirror of pipeline/seats.py: 3.25% threshold, Bader-Ofer with surplus agreements.
import type { Votes } from './types';

export const SEATS = 120;
export const THRESHOLD = 0.0325;

function maxBy<T>(items: T[], key: (t: T) => [number, number, string]): T {
  let best = items[0];
  let bk = key(best);
  for (const it of items.slice(1)) {
    const k = key(it);
    if (k[0] > bk[0] || (k[0] === bk[0] && (k[1] > bk[1] || (k[1] === bk[1] && k[2] > bk[2])))) {
      best = it;
      bk = k;
    }
  }
  return best;
}

function baderOfer(votes: Votes, seats: number): Record<string, number> {
  const keys = Object.keys(votes);
  const total = keys.reduce((t, k) => t + votes[k], 0);
  const alloc: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  if (seats <= 0 || total <= 0) return alloc;
  const quota = total / seats;
  for (const k of keys) alloc[k] = Math.floor(votes[k] / quota);
  while (keys.reduce((t, k) => t + alloc[k], 0) < seats) {
    alloc[maxBy(keys, (k) => [votes[k] / (alloc[k] + 1), votes[k], k])] += 1;
  }
  return alloc;
}

export function allocate(
  votes: Votes,
  agreements: [string, string][] = [],
  seats = SEATS,
  threshold = THRESHOLD,
): Record<string, number> {
  const valid = Object.values(votes).reduce((t, v) => t + v, 0);
  const result: Record<string, number> = Object.fromEntries(Object.keys(votes).map((k) => [k, 0]));
  const passed: Votes = {};
  for (const [k, v] of Object.entries(votes)) if (valid && v >= threshold * valid) passed[k] = v;
  if (!Object.keys(passed).length) return result;

  const pairOf: Record<string, [string, string]> = {};
  for (const [a, b] of agreements) {
    if (a in passed && b in passed && !(a in pairOf) && !(b in pairOf)) pairOf[a] = pairOf[b] = [a, b];
  }
  const units: Record<string, number> = {};
  const members: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(passed)) {
    const key = pairOf[k] ? pairOf[k].join('+') : k;
    units[key] = (units[key] ?? 0) + v;
    members[key] = pairOf[k] ?? [k];
  }
  const quota = Object.values(passed).reduce((t, v) => t + v, 0) / seats;
  const unitSeats: Record<string, number> = {};
  for (const u of Object.keys(units)) unitSeats[u] = members[u].reduce((t, m) => t + Math.floor(passed[m] / quota), 0);
  const ids = Object.keys(units);
  while (ids.reduce((t, u) => t + unitSeats[u], 0) < seats) {
    unitSeats[maxBy(ids, (u) => [units[u] / (unitSeats[u] + 1), units[u], u])] += 1;
  }
  for (const u of ids) {
    if (members[u].length === 1) result[members[u][0]] = unitSeats[u];
    else Object.assign(result, baderOfer(Object.fromEntries(members[u].map((m) => [m, passed[m]])), unitSeats[u]));
  }
  return result;
}
