const positiveDecimalPattern = /^[1-9][0-9]*$/u;

export const performanceStatisticsSchema =
  "stasis-v0.3.3-performance-statistics-v1";

export function summarizePairedDurations(pairs, {
  baselineLabel,
  candidateLabel = "stasis",
} = {}) {
  if (!Array.isArray(pairs) || pairs.length < 2) {
    throw new TypeError("At least two paired duration samples are required");
  }
  const exactBaselineLabel = exactLabel(baselineLabel, "baselineLabel");
  const exactCandidateLabel = exactLabel(candidateLabel, "candidateLabel");
  const reserved = new Set([
    "schema",
    "sampleCount",
    "units",
    "pairedBaselineOverCandidate",
  ]);
  if (
    exactBaselineLabel === exactCandidateLabel ||
    reserved.has(exactBaselineLabel) ||
    reserved.has(exactCandidateLabel)
  ) {
    throw new TypeError("Baseline and candidate labels must be distinct non-reserved identifiers");
  }

  const normalized = pairs.map((pair, index) => {
    if (
      pair === null ||
      typeof pair !== "object" ||
      Array.isArray(pair) ||
      Object.keys(pair).sort().join("\0") !== "baselineNs\0candidateNs"
    ) {
      throw new TypeError(`Pair ${index + 1} must contain only baselineNs and candidateNs`);
    }
    return Object.freeze({
      baselineNs: positiveNanoseconds(pair.baselineNs, `pair ${index + 1} baselineNs`),
      candidateNs: positiveNanoseconds(pair.candidateNs, `pair ${index + 1} candidateNs`),
    });
  });
  const baseline = distribution(normalized.map(({ baselineNs }) => baselineNs));
  const candidate = distribution(normalized.map(({ candidateNs }) => candidateNs));
  const pairedBaselineOverCandidate = medianRational(
    normalized.map(({ baselineNs, candidateNs }) => rational(baselineNs, candidateNs)),
  );

  return deepFreeze({
    schema: performanceStatisticsSchema,
    sampleCount: normalized.length,
    units: {
      durationInput: "integer_nanoseconds",
      durationDisplay: "milliseconds_fixed_6_half_up",
      ratioDisplay: "fixed_6_half_up",
      quartileMethod: "median_of_halves_excluding_odd_center",
      pairedRatio: `${exactBaselineLabel}_over_${exactCandidateLabel}`,
    },
    [exactBaselineLabel]: baseline,
    [exactCandidateLabel]: candidate,
    pairedBaselineOverCandidate: {
      exact: projectRational(pairedBaselineOverCandidate),
      decimal: formatRational(pairedBaselineOverCandidate, 6),
    },
  });
}

export function replayPerformanceStatistics(pairs, options) {
  return summarizePairedDurations(pairs, options);
}

export function assertStatisticsForPairs(value, pairs, options) {
  const expected = summarizePairedDurations(pairs, options);
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new TypeError("Performance statistics do not replay exactly from retained raw pairs");
  }
  return value;
}

function distribution(values) {
  const sorted = [...values].sort(compareBigInt);
  const median = medianIntegers(sorted);
  const split = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, split);
  const upper = sorted.slice(Math.ceil(sorted.length / 2));
  const q1 = medianIntegers(lower);
  const q3 = medianIntegers(upper);
  const iqr = subtractRational(q3, q1);
  return {
    sortedNs: sorted.map((value) => value.toString(10)),
    medianNs: projectRational(median),
    q1Ns: projectRational(q1),
    q3Ns: projectRational(q3),
    iqrNs: projectRational(iqr),
    medianMilliseconds: formatNanosecondsAsMilliseconds(median),
    iqrMilliseconds: formatNanosecondsAsMilliseconds(iqr),
  };
}

function medianIntegers(sorted) {
  if (!Array.isArray(sorted) || sorted.length === 0) {
    throw new TypeError("Median requires at least one value");
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? rational(sorted[middle], 1n)
    : rational(sorted[middle - 1] + sorted[middle], 2n);
}

function medianRational(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("Median ratio requires at least one value");
  }
  const sorted = [...values].sort(compareRational);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : divideRational(addRational(sorted[middle - 1], sorted[middle]), 2n);
}

function rational(numerator, denominator) {
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint" || denominator <= 0n) {
    throw new TypeError("Rational values require a BigInt numerator and positive denominator");
  }
  const divisor = greatestCommonDivisor(numerator < 0n ? -numerator : numerator, denominator);
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor });
}

function addRational(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtractRational(left, right) {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function divideRational(value, divisor) {
  if (typeof divisor !== "bigint" || divisor <= 0n) {
    throw new TypeError("Rational divisor must be a positive BigInt");
  }
  return rational(value.numerator, value.denominator * divisor);
}

function compareRational(left, right) {
  return compareBigInt(
    left.numerator * right.denominator,
    right.numerator * left.denominator,
  );
}

function compareBigInt(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function greatestCommonDivisor(left, right) {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a === 0n ? 1n : a;
}

function projectRational(value) {
  return {
    numerator: value.numerator.toString(10),
    denominator: value.denominator.toString(10),
  };
}

function formatNanosecondsAsMilliseconds(value) {
  return formatScaledRational(value, 1_000_000n, 6);
}

function formatRational(value, decimalPlaces) {
  return formatScaledRational(value, 1n, decimalPlaces);
}

function formatScaledRational(value, unitDivisor, decimalPlaces) {
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 12) {
    throw new TypeError("decimalPlaces must be a safe integer from 0 through 12");
  }
  if (value.numerator < 0n) {
    throw new TypeError("Displayed benchmark values must be nonnegative");
  }
  const scale = 10n ** BigInt(decimalPlaces);
  const divisor = value.denominator * unitDivisor;
  const scaledNumerator = value.numerator * scale;
  let quotient = scaledNumerator / divisor;
  const remainder = scaledNumerator % divisor;
  if (remainder * 2n >= divisor) quotient += 1n;
  if (decimalPlaces === 0) return quotient.toString(10);
  const whole = quotient / scale;
  const fraction = (quotient % scale).toString(10).padStart(decimalPlaces, "0");
  return `${whole}.${fraction}`;
}

function positiveNanoseconds(value, label) {
  if (typeof value !== "string" || !positiveDecimalPattern.test(value)) {
    throw new TypeError(`${label} must be a canonical positive integer string`);
  }
  return BigInt(value);
}

function exactLabel(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(value)) {
    throw new TypeError(`${label} must be a lowercase identifier`);
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
