/**
 * If the top 5 by composite_score are all the same source, replace the 5th with
 * the best-ranked item from a different source (PRD source diversity).
 */

export type WithSourceAndScore = {
  sourceId: number;
  compositeScore: number;
};

export const enforceSourceDiversityInTopFive = <T extends WithSourceAndScore>(
  sortedDesc: T[],
): T[] => {
  if (sortedDesc.length < 5) {
    return sortedDesc;
  }

  const top5 = sortedDesc.slice(0, 5);
  const firstSource = top5[0]?.sourceId;
  const allSame =
    firstSource !== undefined && top5.every((x) => x.sourceId === firstSource);

  if (!allSame) {
    return sortedDesc;
  }

  const rest = sortedDesc.slice(5);
  const replacement = rest.find((x) => x.sourceId !== firstSource);
  if (!replacement) {
    return sortedDesc;
  }

  const next = [...sortedDesc];
  next[4] = replacement;
  return next;
};
