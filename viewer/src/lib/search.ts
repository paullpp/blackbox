/**
 * Number of items whose `offsetMs` is <= playheadMs, for an array sorted
 * ascending by offsetMs. Items [0, count) are "revealed"; count-1 is the most
 * recent. O(log n) via binary search.
 */
export function countRevealed(
  sorted: { offsetMs: number }[],
  playheadMs: number,
): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].offsetMs <= playheadMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the most recent item at/just before playhead, or -1 if none. */
export function activeIndex(
  sorted: { offsetMs: number }[],
  playheadMs: number,
): number {
  return countRevealed(sorted, playheadMs) - 1;
}
