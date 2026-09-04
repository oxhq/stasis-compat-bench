#!/usr/bin/env python3
"""Independent, standard-library replay of the v0.3.3 performance statistics.

The command accepts the hosted RWA wrapper, the hosted crawl raw artifact, and
the combined evidence JSON, in that order.  A successful replay writes one
stable, sorted-key JSON receipt to stdout.  It never performs network access or
mutates an input artifact.  This program independently checks the retained
schedule, external timing boundaries, and arithmetic.  It does not duplicate
the JavaScript verifier's full runner-identity or behavioral-oracle replay, so
its receipt requires that separate verification instead of claiming it here.
"""

from __future__ import annotations

import argparse
import copy
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
from typing import Any, Iterable, Mapping, Sequence


PAIR_COUNT = 10
RWA_WRAPPER_SCHEMA = "stasis-v0.3.3-performance-rwa-artifact-v1"
RWA_RAW_SCHEMA = "stasis-v0.3.3-performance-rwa-raw-v1"
RWA_PROTOCOL = "stasis-v0.3.3-performance-rwa-v1"
RWA_TRACK = "rwa-auth-eight-intents"
CRAWL_RAW_SCHEMA = "stasis-v0.3.3-performance-crawl-raw-v1"
CRAWL_PROTOCOL = "stasis-v0.3.3-performance-crawl-v1"
CRAWL_TRACK = "deterministic-crawl-20-page"
COMBINED_SCHEMA = "stasis-v0.3.3-combined-performance-evidence-v1"
STATISTICS_SCHEMA = "stasis-v0.3.3-performance-statistics-v1"
RECEIPT_SCHEMA = "stasis-v0.3.3-independent-statistics-replay-v1"

_POSITIVE_DECIMAL = re.compile(r"^[1-9][0-9]*$")
_UNSIGNED_DECIMAL = re.compile(r"^(?:0|[1-9][0-9]*)$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")

_CLAIM_BOUNDARY = {
    "scope": "per_track_single_host_exploratory_only",
    "crossHostClaimed": False,
    "generalSpeedClaimed": False,
    "interpretation": (
        "Each retained timing summary is single-host and exploratory within its own "
        "preregistered track. This combined artifact does not pool the Windows RWA "
        "and hosted Linux crawl timings into a cross-host benchmark and does not "
        "support a general speed claim."
    ),
}
_RWA_WORKLOAD_INTERPRETATION = (
    "RWA timings compare the same complete eight application intents from the frozen "
    "authentication slice. They are not a Cypress API-equivalence claim and not a "
    "claim about all 45 RWA tests."
)
_CRAWL_WORKLOAD_INTERPRETATION = (
    "Crawl timings compare the complete frozen deterministic 20-page workload on its "
    "retained host only. They do not support a cross-host or general speed claim."
)


class ReplayError(ValueError):
    """Raised when retained evidence cannot be replayed exactly."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ReplayError(message)


def _record(value: Any, label: str) -> dict[str, Any]:
    _require(type(value) is dict, f"{label} must be a JSON object")
    return value


def _array(value: Any, label: str) -> list[Any]:
    _require(type(value) is list, f"{label} must be a JSON array")
    return value


def _exact_keys(value: Mapping[str, Any], expected: Iterable[str], label: str) -> None:
    _require(set(value) == set(expected), f"{label} has an invalid field set")


def _exact_integer(value: Any, expected: int, label: str) -> None:
    _require(type(value) is int and value == expected, f"{label} is invalid")


def _canonical_integer(value: Any, label: str, *, positive: bool) -> int:
    pattern = _POSITIVE_DECIMAL if positive else _UNSIGNED_DECIMAL
    _require(type(value) is str and pattern.fullmatch(value) is not None,
             f"{label} must be a canonical integer string")
    return int(value)


def _deep_exact_equal(left: Any, right: Any) -> bool:
    """JSON equality that does not treat True and 1 as interchangeable."""

    if type(left) is not type(right):
        return False
    if type(left) is dict:
        return set(left) == set(right) and all(
            _deep_exact_equal(left[key], right[key]) for key in left
        )
    if type(left) is list:
        return len(left) == len(right) and all(
            _deep_exact_equal(a, b) for a, b in zip(left, right)
        )
    return bool(left == right)


def _median(values: Sequence[Fraction]) -> Fraction:
    _require(len(values) > 0, "Median requires at least one value")
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def _project_fraction(value: Fraction) -> dict[str, str]:
    return {
        "numerator": str(value.numerator),
        "denominator": str(value.denominator),
    }


def format_fixed_6(value: Fraction, unit_divisor: int = 1) -> str:
    """Format a non-negative Fraction with exact fixed-six half-up rounding."""

    _require(isinstance(value, Fraction) and value >= 0,
             "Displayed benchmark value must be a non-negative Fraction")
    _require(type(unit_divisor) is int and unit_divisor > 0,
             "Display unit divisor must be a positive integer")
    scale = 1_000_000
    divisor = value.denominator * unit_divisor
    quotient, remainder = divmod(value.numerator * scale, divisor)
    if remainder * 2 >= divisor:
        quotient += 1
    whole, fractional = divmod(quotient, scale)
    return f"{whole}.{fractional:06d}"


def _distribution(values: Sequence[int]) -> dict[str, Any]:
    _require(len(values) >= 2, "Distribution requires at least two values")
    ordered = sorted(values)
    fractions = [Fraction(value, 1) for value in ordered]
    split = len(fractions) // 2
    median = _median(fractions)
    q1 = _median(fractions[:split])
    q3 = _median(fractions[(len(fractions) + 1) // 2 :])
    iqr = q3 - q1
    return {
        "sortedNs": [str(value) for value in ordered],
        "medianNs": _project_fraction(median),
        "q1Ns": _project_fraction(q1),
        "q3Ns": _project_fraction(q3),
        "iqrNs": _project_fraction(iqr),
        "medianMilliseconds": format_fixed_6(median, 1_000_000),
        "iqrMilliseconds": format_fixed_6(iqr, 1_000_000),
    }


def summarize_paired_durations(
    pairs: Sequence[Mapping[str, str]],
    *,
    baseline_label: str,
    candidate_label: str = "stasis",
) -> dict[str, Any]:
    """Replay the exact integer/Fraction statistics used by the JS publisher."""

    _require(len(pairs) >= 2, "At least two paired duration samples are required")
    _require(
        re.fullmatch(r"[a-z][a-z0-9_]{0,63}", baseline_label) is not None
        and re.fullmatch(r"[a-z][a-z0-9_]{0,63}", candidate_label) is not None
        and baseline_label != candidate_label,
        "Statistic labels are invalid",
    )
    _require(
        baseline_label not in {"schema", "sampleCount", "units", "pairedBaselineOverCandidate"}
        and candidate_label not in {"schema", "sampleCount", "units", "pairedBaselineOverCandidate"},
        "Statistic labels are reserved",
    )
    baseline: list[int] = []
    candidate: list[int] = []
    ratios: list[Fraction] = []
    for index, pair_value in enumerate(pairs, 1):
        pair = _record(pair_value, f"statistics pair {index}")
        _exact_keys(pair, ["baselineNs", "candidateNs"], f"statistics pair {index}")
        baseline_ns = _canonical_integer(
            pair["baselineNs"], f"statistics pair {index} baselineNs", positive=True
        )
        candidate_ns = _canonical_integer(
            pair["candidateNs"], f"statistics pair {index} candidateNs", positive=True
        )
        baseline.append(baseline_ns)
        candidate.append(candidate_ns)
        ratios.append(Fraction(baseline_ns, candidate_ns))

    median_ratio = _median(ratios)
    return {
        "schema": STATISTICS_SCHEMA,
        "sampleCount": len(pairs),
        "units": {
            "durationInput": "integer_nanoseconds",
            "durationDisplay": "milliseconds_fixed_6_half_up",
            "ratioDisplay": "fixed_6_half_up",
            "quartileMethod": "median_of_halves_excluding_odd_center",
            "pairedRatio": f"{baseline_label}_over_{candidate_label}",
        },
        baseline_label: _distribution(baseline),
        candidate_label: _distribution(candidate),
        "pairedBaselineOverCandidate": {
            "exact": _project_fraction(median_ratio),
            "decimal": format_fixed_6(median_ratio),
        },
    }


def _validate_host(
    value: Any,
    *,
    label: str,
    keys: Sequence[str],
    digest_fields: Sequence[str],
) -> dict[str, Any]:
    host = _record(value, label)
    _exact_keys(host, keys, label)
    for field in digest_fields:
        _require(
            type(host[field]) is str and _SHA256.fullmatch(host[field]) is not None,
            f"{label} {field} is invalid",
        )
    _require(
        type(host["logicalCpuCount"]) is int and host["logicalCpuCount"] > 0,
        f"{label} logicalCpuCount is invalid",
    )
    for field in set(keys) - set(digest_fields) - {"logicalCpuCount"}:
        _require(type(host[field]) is str and host[field] != "", f"{label} {field} is invalid")
    return host


def _timing(value: Any, label: str, prior_end: int | None) -> tuple[str, int]:
    timing = _record(value, label)
    _exact_keys(timing, ["durationNs", "endNs", "startNs"], label)
    start = _canonical_integer(timing["startNs"], f"{label} startNs", positive=False)
    end = _canonical_integer(timing["endNs"], f"{label} endNs", positive=False)
    duration = _canonical_integer(timing["durationNs"], f"{label} durationNs", positive=True)
    _require(end > start and end - start == duration, f"{label} boundaries do not replay")
    _require(prior_end is None or start >= prior_end, f"{label} overlaps or moves backwards")
    return timing["durationNs"], end


def _validate_rwa_wrapper(value: Any) -> dict[str, Any]:
    wrapper = _record(value, "RWA hosted wrapper")
    _exact_keys(
        wrapper,
        [
            "authorityRaw",
            "host",
            "identities",
            "protocol",
            "provenance",
            "recordedAt",
            "schema",
            "sealedRuntime",
            "track",
        ],
        "RWA hosted wrapper",
    )
    _require(wrapper["schema"] == RWA_WRAPPER_SCHEMA, "RWA hosted wrapper schema is invalid")
    _require(wrapper["protocol"] == RWA_PROTOCOL, "RWA hosted wrapper protocol is invalid")
    _require(wrapper["track"] == RWA_TRACK, "RWA hosted wrapper track is invalid")
    _require(type(wrapper["recordedAt"]) is str and wrapper["recordedAt"] != "",
             "RWA hosted wrapper recordedAt is invalid")

    raw = _record(wrapper["authorityRaw"], "RWA raw authority")
    _exact_keys(
        raw,
        [
            "authority",
            "host",
            "plan",
            "protocol",
            "samples",
            "schema",
            "semanticDifferenceDisclosure",
            "serverLifecycle",
            "source",
            "track",
            "warmups",
        ],
        "RWA raw authority",
    )
    _require(raw["schema"] == RWA_RAW_SCHEMA, "RWA raw schema is invalid")
    _require(raw["protocol"] == wrapper["protocol"], "RWA raw protocol does not match wrapper")
    _require(raw["track"] == wrapper["track"], "RWA raw track does not match wrapper")
    host = _validate_host(
        raw["host"],
        label="RWA raw host",
        keys=[
            "arch",
            "cpuModel",
            "identityDigest",
            "imageOs",
            "imageVersion",
            "instanceDigest",
            "logicalCpuCount",
            "platform",
            "runnerOs",
        ],
        digest_fields=["identityDigest", "instanceDigest"],
    )
    plan = _record(raw["plan"], "RWA plan")
    _exact_integer(plan.get("denominator"), 8, "RWA plan denominator")
    _exact_integer(plan.get("pairedSamples"), PAIR_COUNT, "RWA plan pairedSamples")

    lifecycle = _record(raw["serverLifecycle"], "RWA server lifecycle")
    _exact_keys(
        lifecycle,
        ["error", "shutdownComplete", "shutdownOutsideTiming", "startupComplete", "startupOutsideTiming"],
        "RWA server lifecycle",
    )
    _require(
        _deep_exact_equal(lifecycle, {
            "startupComplete": True,
            "startupOutsideTiming": True,
            "shutdownComplete": True,
            "shutdownOutsideTiming": True,
            "error": None,
        }),
        "RWA server lifecycle is not a valid completed lifecycle",
    )

    warmups = _array(raw["warmups"], "RWA warmups")
    _require(len(warmups) == 2, "RWA authority requires two passing warmups")
    for index, runner in enumerate(["cypress", "stasis-v0.3.3"], 1):
        warmup = _record(warmups[index - 1], f"RWA warmup {index}")
        _require(
            type(warmup.get("sequence")) is int
            and warmup.get("sequence") == index
            and type(warmup.get("warmupIndex")) is int
            and warmup.get("warmupIndex") == 1
            and warmup.get("runner") == runner
            and warmup.get("status") == "passed"
            and warmup.get("error") is None
            and warmup.get("hostIdentityDigest") == host["identityDigest"]
            and warmup.get("hostInstanceDigest") == host["instanceDigest"],
            f"RWA warmup {index} is not a passing scheduled warmup",
        )

    expected_authority = {
        "status": "valid",
        "valid": True,
        "reasonCodes": [],
        "plannedWarmups": 2,
        "completedWarmups": 2,
        "plannedTimedSamples": 20,
        "completedTimedSamples": 20,
        "retainedTimedFailures": 0,
        "cypressTimedEightOfEight": 10,
        "stasisTimedEightOfEight": 10,
    }
    _require(
        _deep_exact_equal(raw["authority"], expected_authority),
        "RWA raw authority is not exactly valid",
    )
    return raw


def _extract_rwa_pairs(raw: Mapping[str, Any]) -> list[dict[str, Any]]:
    samples = _array(raw["samples"], "RWA timed samples")
    _require(len(samples) == PAIR_COUNT * 2, "RWA authority requires exactly 10 complete pairs")
    host = raw["host"]
    result: list[dict[str, Any]] = []
    prior_end: int | None = None
    sequence = 0
    for pair_index in range(1, PAIR_COUNT + 1):
        order = "AB" if pair_index % 2 == 1 else "BA"
        runners = ["cypress", "stasis-v0.3.3"] if order == "AB" else ["stasis-v0.3.3", "cypress"]
        durations: dict[str, str] = {}
        for position, runner in enumerate(runners, 1):
            sequence += 1
            sample = _record(samples[sequence - 1], f"RWA timed sample {sequence}")
            _exact_keys(
                sample,
                [
                    "error",
                    "hostIdentityDigest",
                    "hostInstanceDigest",
                    "pairIndex",
                    "pairOrder",
                    "position",
                    "result",
                    "runner",
                    "sequence",
                    "status",
                    "timing",
                ],
                f"RWA timed sample {sequence}",
            )
            _require(
                type(sample["sequence"]) is int
                and sample["sequence"] == sequence
                and type(sample["pairIndex"]) is int
                and sample["pairIndex"] == pair_index
                and sample["pairOrder"] == order
                and type(sample["position"]) is int
                and sample["position"] == position
                and sample["runner"] == runner
                and sample["status"] == "passed"
                and sample["error"] is None
                and type(sample["result"]) is dict
                and sample["hostIdentityDigest"] == host["identityDigest"]
                and sample["hostInstanceDigest"] == host["instanceDigest"],
                f"RWA timed sample {sequence} violates the AB/BA authority schedule",
            )
            duration, prior_end = _timing(sample["timing"], f"RWA timed sample {sequence} timing", prior_end)
            durations[runner] = duration
        result.append(
            {
                "pairIndex": pair_index,
                "order": order,
                "baselineRunner": "cypress",
                "stasisRunner": "stasis",
                "baselineDurationNs": durations["cypress"],
                "stasisDurationNs": durations["stasis-v0.3.3"],
            }
        )
    return result


def _valid_crawl_oracle(value: Any, label: str) -> None:
    oracle = _record(value, label)
    expected = {"valid": True, "expectedPages": 20, "exactOraclePages": 20, "reasons": []}
    _require(_deep_exact_equal(oracle, expected), f"{label} is not exactly valid")


def _validate_crawl_raw(value: Any) -> dict[str, Any]:
    raw = _record(value, "crawl raw authority")
    _exact_keys(
        raw,
        ["authority", "controls", "identity", "pairs", "protocol", "rules", "schema", "track", "warmups"],
        "crawl raw authority",
    )
    _require(raw["schema"] == CRAWL_RAW_SCHEMA, "crawl raw schema is invalid")
    _require(raw["protocol"] == CRAWL_PROTOCOL, "crawl raw protocol is invalid")
    _require(raw["track"] == CRAWL_TRACK, "crawl raw track is invalid")
    identity = _record(raw["identity"], "crawl identity")
    _exact_keys(identity, ["corpus", "crawlee", "host", "provenance", "stasis"], "crawl identity")
    _validate_host(
        identity["host"],
        label="crawl raw host",
        keys=[
            "arch",
            "bootInstanceDigest",
            "cpuModel",
            "hostClassDigest",
            "imageOs",
            "imageVersion",
            "logicalCpuCount",
            "platform",
            "runnerOs",
        ],
        digest_fields=["bootInstanceDigest", "hostClassDigest"],
    )

    warmups = _array(raw["warmups"], "crawl warmups")
    _require(len(warmups) == 2, "crawl authority requires two valid warmups")
    for index, lane in enumerate(["crawlee", "stasis"], 1):
        warmup = _record(warmups[index - 1], f"crawl warmup {index}")
        _require(warmup.get("lane") == lane and warmup.get("timed") is False,
                 f"crawl warmup {index} is invalid")
        _valid_crawl_oracle(warmup.get("oracle"), f"crawl warmup {index} oracle")

    controls = _record(raw["controls"], "crawl controls")
    _exact_keys(controls, ["includedInPrimaryDenominator", "observations", "status", "timed"], "crawl controls")
    _require(
        controls["status"] == "complete"
        and controls["timed"] is False
        and controls["includedInPrimaryDenominator"] is False
        and type(controls["observations"]) is list,
        "crawl controls are not complete and untimed",
    )

    expected_authority = {
        "status": "valid",
        "valid": True,
        "requiredPairs": 10,
        "completedPairs": 10,
        "exactEquivalentPairs": 10,
        "primaryPagesPerLane": 20,
        "reasonCodes": [],
    }
    _require(
        _deep_exact_equal(raw["authority"], expected_authority),
        "crawl raw authority is not exactly valid",
    )
    return raw


def _extract_crawl_pairs(raw: Mapping[str, Any]) -> list[dict[str, Any]]:
    pairs = _array(raw["pairs"], "crawl timed pairs")
    _require(len(pairs) == PAIR_COUNT, "crawl authority requires exactly 10 complete pairs")
    result: list[dict[str, Any]] = []
    prior_end: int | None = None
    for pair_index, pair_value in enumerate(pairs, 1):
        pair = _record(pair_value, f"crawl pair {pair_index}")
        _exact_keys(pair, ["equivalence", "lanes", "observations", "order", "pairIndex"], f"crawl pair {pair_index}")
        order = "AB" if pair_index % 2 == 1 else "BA"
        lanes = ["crawlee", "stasis"] if order == "AB" else ["stasis", "crawlee"]
        _require(
            type(pair["pairIndex"]) is int
            and pair["pairIndex"] == pair_index
            and pair["order"] == order
            and _deep_exact_equal(pair["lanes"], lanes),
            f"crawl pair {pair_index} violates the AB/BA schedule",
        )
        _require(
            _deep_exact_equal(
                pair["equivalence"],
                {"evaluated": True, "valid": True, "exactEquivalentPages": 20},
            ),
            f"crawl pair {pair_index} is not exactly equivalent",
        )
        observations = _array(pair["observations"], f"crawl pair {pair_index} observations")
        _require(len(observations) == 2, f"crawl pair {pair_index} is incomplete")
        durations: dict[str, str] = {}
        for position, lane in enumerate(lanes, 1):
            observation = _record(observations[position - 1], f"crawl pair {pair_index} observation {position}")
            _exact_keys(
                observation,
                ["error", "lane", "oracle", "run", "status", "timed", "timing"],
                f"crawl pair {pair_index} observation {position}",
            )
            _require(
                observation["lane"] == lane
                and observation["timed"] is True
                and observation["status"] == "completed"
                and observation["error"] is None
                and type(observation["run"]) is dict,
                f"crawl pair {pair_index} observation {position} violates the lane schedule",
            )
            _valid_crawl_oracle(
                observation["oracle"], f"crawl pair {pair_index} observation {position} oracle"
            )
            duration, prior_end = _timing(
                observation["timing"],
                f"crawl pair {pair_index} observation {position} timing",
                prior_end,
            )
            durations[lane] = duration
        result.append(
            {
                "pairIndex": pair_index,
                "order": order,
                "baselineRunner": "crawlee",
                "stasisRunner": "stasis",
                "baselineDurationNs": durations["crawlee"],
                "stasisDurationNs": durations["stasis"],
            }
        )
    return result


def verify_documents(
    rwa_wrapper: Any,
    crawl_raw_value: Any,
    combined_value: Any,
) -> dict[str, Any]:
    """Gate declared-valid inputs and replay their schedule, timings, and statistics.

    Full identity and behavioral validation intentionally remains the job of
    the separately executed JavaScript combined-performance verifier.
    """

    rwa_raw = _validate_rwa_wrapper(rwa_wrapper)
    crawl_raw = _validate_crawl_raw(crawl_raw_value)
    rwa_pairs = _extract_rwa_pairs(rwa_raw)
    crawl_pairs = _extract_crawl_pairs(crawl_raw)
    expected = {
        "schema": COMBINED_SCHEMA,
        "authority": {
            "status": "valid",
            "valid": True,
            "rule": "both_track_authorities_must_be_valid",
        },
        "claimBoundary": copy.deepcopy(_CLAIM_BOUNDARY),
        "rwa": {
            "protocol": rwa_raw["protocol"],
            "rawSchema": rwa_raw["schema"],
            "track": rwa_raw["track"],
            "host": copy.deepcopy(rwa_raw["host"]),
            "hostBinding": {
                "field": "instanceDigest",
                "digest": rwa_raw["host"]["instanceDigest"],
            },
            "workload": {
                "denominatorKind": "application_intents",
                "denominatorCount": rwa_raw["plan"]["denominator"],
                "timedPairs": rwa_raw["plan"]["pairedSamples"],
                "interpretation": _RWA_WORKLOAD_INTERPRETATION,
            },
            "pairs": rwa_pairs,
            "statistics": summarize_paired_durations(
                [
                    {"baselineNs": pair["baselineDurationNs"], "candidateNs": pair["stasisDurationNs"]}
                    for pair in rwa_pairs
                ],
                baseline_label="cypress",
            ),
        },
        "crawl": {
            "protocol": crawl_raw["protocol"],
            "rawSchema": crawl_raw["schema"],
            "track": crawl_raw["track"],
            "host": copy.deepcopy(crawl_raw["identity"]["host"]),
            "hostBinding": {
                "field": "bootInstanceDigest",
                "digest": crawl_raw["identity"]["host"]["bootInstanceDigest"],
            },
            "workload": {
                "denominatorKind": "pages",
                "denominatorCount": crawl_raw["authority"]["primaryPagesPerLane"],
                "timedPairs": crawl_raw["authority"]["requiredPairs"],
                "interpretation": _CRAWL_WORKLOAD_INTERPRETATION,
            },
            "pairs": crawl_pairs,
            "statistics": summarize_paired_durations(
                [
                    {"baselineNs": pair["baselineDurationNs"], "candidateNs": pair["stasisDurationNs"]}
                    for pair in crawl_pairs
                ],
                baseline_label="crawlee",
            ),
        },
    }
    _require(
        _deep_exact_equal(combined_value, expected),
        "combined evidence does not replay exactly from both retained raw authorities",
    )
    return {"rwaPairCount": len(rwa_pairs), "crawlPairCount": len(crawl_pairs)}


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, child in pairs:
        if key in value:
            raise ReplayError(f"JSON contains duplicate object key {key!r}")
        value[key] = child
    return value


def _reject_number(token: str) -> Any:
    raise ReplayError(f"JSON contains unsupported non-integer number {token!r}")


def _read_json(path_value: str | Path, label: str) -> tuple[Any, str]:
    path = Path(path_value)
    try:
        with path.open("rb") as handle:
            _require(stat.S_ISREG(os.fstat(handle.fileno()).st_mode),
                     f"{label} is not a regular file")
            payload = handle.read()
    except ReplayError:
        raise
    except OSError as error:
        raise ReplayError(f"{label} could not be read: {error.strerror or error.__class__.__name__}") from error
    digest = hashlib.sha256(payload).hexdigest()
    try:
        text = payload.decode("utf-8")
        value = json.loads(
            text,
            object_pairs_hook=_reject_duplicate_keys,
            parse_float=_reject_number,
            parse_constant=_reject_number,
        )
    except UnicodeDecodeError as error:
        raise ReplayError(f"{label} is not UTF-8 JSON") from error
    except json.JSONDecodeError as error:
        raise ReplayError(f"{label} is not valid JSON at line {error.lineno} column {error.colno}") from error
    return value, digest


def replay_files(
    rwa_wrapper_path: str | Path,
    crawl_raw_path: str | Path,
    combined_path: str | Path,
) -> dict[str, Any]:
    """Replay three input files and return a deterministic success receipt."""

    rwa_wrapper, rwa_sha256 = _read_json(rwa_wrapper_path, "RWA hosted wrapper")
    crawl_raw, crawl_sha256 = _read_json(crawl_raw_path, "crawl raw authority")
    combined, combined_sha256 = _read_json(combined_path, "combined evidence")
    counts = verify_documents(rwa_wrapper, crawl_raw, combined)
    return {
        "schema": RECEIPT_SCHEMA,
        "status": "passed",
        "scope": {
            "behavioralAuthorityReverification": "not_performed",
            "name": "statistics_only",
            "requiredPriorVerificationSchema":
                "stasis-v0.3.3-combined-performance-verification-v1",
        },
        "inputs": {
            "combinedEvidence": {"sha256": combined_sha256},
            "crawlRaw": {"sha256": crawl_sha256},
            "rwaHostedWrapper": {"sha256": rwa_sha256},
        },
        "verification": {
            "combinedProjectionAndStatisticsExact": True,
            "declaredAuthorityPrerequisites": {
                "crawl": "valid",
                "rwa": "valid",
            },
            "crawl": {"pairCount": counts["crawlPairCount"]},
            "rwa": {"pairCount": counts["rwaPairCount"]},
            "statistics": {
                "arithmetic": "integer_and_reduced_fraction",
                "decimal": "fixed_6_half_up",
                "quartiles": "median_of_halves_excluding_odd_center",
                "ratio": "median_of_paired_baseline_over_stasis_ratios",
            },
        },
    }


def canonical_receipt(value: Mapping[str, Any]) -> str:
    """Serialize a receipt with a single canonical representation."""

    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Independently replay Stasis v0.3.3 combined performance statistics."
    )
    parser.add_argument("rwa_wrapper", help="hosted RWA wrapper raw JSON")
    parser.add_argument("crawl_raw", help="hosted crawl raw JSON")
    parser.add_argument("combined_evidence", help="combined evidence JSON")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _argument_parser().parse_args(argv)
    try:
        receipt = replay_files(
            arguments.rwa_wrapper,
            arguments.crawl_raw,
            arguments.combined_evidence,
        )
    except ReplayError as error:
        sys.stderr.write(f"independent statistics replay failed: {error}\n")
        return 1
    sys.stdout.write(canonical_receipt(receipt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
