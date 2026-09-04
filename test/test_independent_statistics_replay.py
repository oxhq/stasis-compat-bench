from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
from fractions import Fraction
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = REPOSITORY_ROOT / "src" / "performance" / "independent_statistics_replay.py"
SPEC = importlib.util.spec_from_file_location("independent_statistics_replay", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
replay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(replay)


RWA_BASELINE = [11_000_000 + index * 2_000_000 for index in range(10)]
RWA_STASIS = [5_000_000 + index * 1_000_000 for index in range(10)]
CRAWL_BASELINE = [9_000_000 + index * 500_000 for index in range(10)]
CRAWL_STASIS = [6_000_000 + index * 200_000 for index in range(10)]

CLAIM_INTERPRETATION = (
    "Each retained timing summary is single-host and exploratory within its own "
    "preregistered track. This combined artifact does not pool the Windows RWA "
    "and hosted Linux crawl timings into a cross-host benchmark and does not "
    "support a general speed claim."
)
RWA_INTERPRETATION = (
    "RWA timings compare the same complete eight application intents from the frozen "
    "authentication slice. They are not a Cypress API-equivalence claim and not a "
    "claim about all 45 RWA tests."
)
CRAWL_INTERPRETATION = (
    "Crawl timings compare the complete frozen deterministic 20-page workload on its "
    "retained host only. They do not support a cross-host or general speed claim."
)


def _fraction(numerator: int, denominator: int = 1) -> dict[str, str]:
    return {"numerator": str(numerator), "denominator": str(denominator)}


def _distribution(
    values: list[int],
    *,
    median: int,
    q1: int,
    q3: int,
    iqr: int,
) -> dict[str, object]:
    return {
        "sortedNs": [str(value) for value in values],
        "medianNs": _fraction(median),
        "q1Ns": _fraction(q1),
        "q3Ns": _fraction(q3),
        "iqrNs": _fraction(iqr),
        "medianMilliseconds": f"{median / 1_000_000:.6f}",
        "iqrMilliseconds": f"{iqr / 1_000_000:.6f}",
    }


def _statistics(
    *,
    baseline_label: str,
    baseline_distribution: dict[str, object],
    stasis_distribution: dict[str, object],
    ratio_numerator: int,
    ratio_denominator: int,
    ratio_decimal: str,
) -> dict[str, object]:
    return {
        "schema": "stasis-v0.3.3-performance-statistics-v1",
        "sampleCount": 10,
        "units": {
            "durationInput": "integer_nanoseconds",
            "durationDisplay": "milliseconds_fixed_6_half_up",
            "ratioDisplay": "fixed_6_half_up",
            "quartileMethod": "median_of_halves_excluding_odd_center",
            "pairedRatio": f"{baseline_label}_over_stasis",
        },
        baseline_label: baseline_distribution,
        "stasis": stasis_distribution,
        "pairedBaselineOverCandidate": {
            "exact": _fraction(ratio_numerator, ratio_denominator),
            "decimal": ratio_decimal,
        },
    }


def _valid_documents() -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    rwa_host = {
        "platform": "win32",
        "arch": "x64",
        "runnerOs": "Windows",
        "imageOs": "windows",
        "imageVersion": "2025",
        "cpuModel": "Fixture CPU",
        "logicalCpuCount": 8,
        "identityDigest": "1" * 64,
        "instanceDigest": "2" * 64,
    }
    crawl_host = {
        "platform": "linux",
        "arch": "x64",
        "runnerOs": "Linux",
        "imageOs": "ubuntu",
        "imageVersion": "24.04",
        "cpuModel": "Fixture CPU",
        "logicalCpuCount": 4,
        "bootInstanceDigest": "3" * 64,
        "hostClassDigest": "4" * 64,
    }

    rwa_samples: list[dict[str, object]] = []
    rwa_pairs: list[dict[str, object]] = []
    clock = 1_000
    sequence = 0
    for pair_index in range(1, 11):
        order = "AB" if pair_index % 2 == 1 else "BA"
        durations = {
            "cypress": RWA_BASELINE[pair_index - 1],
            "stasis-v0.3.3": RWA_STASIS[pair_index - 1],
        }
        runners = ["cypress", "stasis-v0.3.3"] if order == "AB" else ["stasis-v0.3.3", "cypress"]
        for position, runner in enumerate(runners, 1):
            sequence += 1
            start = clock
            end = start + durations[runner]
            clock = end
            rwa_samples.append(
                {
                    "hostIdentityDigest": rwa_host["identityDigest"],
                    "hostInstanceDigest": rwa_host["instanceDigest"],
                    "sequence": sequence,
                    "pairIndex": pair_index,
                    "pairOrder": order,
                    "position": position,
                    "runner": runner,
                    "status": "passed",
                    "timing": {
                        "startNs": str(start),
                        "endNs": str(end),
                        "durationNs": str(durations[runner]),
                    },
                    "result": {},
                    "error": None,
                }
            )
        rwa_pairs.append(
            {
                "pairIndex": pair_index,
                "order": order,
                "baselineRunner": "cypress",
                "stasisRunner": "stasis",
                "baselineDurationNs": str(RWA_BASELINE[pair_index - 1]),
                "stasisDurationNs": str(RWA_STASIS[pair_index - 1]),
            }
        )

    warmup_common = {
        "warmupIndex": 1,
        "status": "passed",
        "result": {},
        "error": None,
        "hostIdentityDigest": rwa_host["identityDigest"],
        "hostInstanceDigest": rwa_host["instanceDigest"],
    }
    rwa_raw = {
        "schema": "stasis-v0.3.3-performance-rwa-raw-v1",
        "protocol": "stasis-v0.3.3-performance-rwa-v1",
        "track": "rwa-auth-eight-intents",
        "source": {},
        "host": rwa_host,
        "plan": {"denominator": 8, "pairedSamples": 10},
        "semanticDifferenceDisclosure": {},
        "serverLifecycle": {
            "startupComplete": True,
            "startupOutsideTiming": True,
            "shutdownComplete": True,
            "shutdownOutsideTiming": True,
            "error": None,
        },
        "warmups": [
            {**warmup_common, "sequence": 1, "runner": "cypress"},
            {**warmup_common, "sequence": 2, "runner": "stasis-v0.3.3"},
        ],
        "samples": rwa_samples,
        "authority": {
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
        },
    }
    rwa_wrapper = {
        "schema": "stasis-v0.3.3-performance-rwa-artifact-v1",
        "protocol": "stasis-v0.3.3-performance-rwa-v1",
        "track": "rwa-auth-eight-intents",
        "recordedAt": "2026-09-03T00:00:00.000Z",
        "host": {},
        "identities": {},
        "provenance": {},
        "sealedRuntime": {},
        "authorityRaw": rwa_raw,
    }

    crawl_pairs: list[dict[str, object]] = []
    combined_crawl_pairs: list[dict[str, object]] = []
    clock = 2_000
    valid_oracle = {"valid": True, "expectedPages": 20, "exactOraclePages": 20, "reasons": []}
    for pair_index in range(1, 11):
        order = "AB" if pair_index % 2 == 1 else "BA"
        lanes = ["crawlee", "stasis"] if order == "AB" else ["stasis", "crawlee"]
        durations = {
            "crawlee": CRAWL_BASELINE[pair_index - 1],
            "stasis": CRAWL_STASIS[pair_index - 1],
        }
        observations: list[dict[str, object]] = []
        for lane in lanes:
            start = clock
            end = start + durations[lane]
            clock = end
            observations.append(
                {
                    "lane": lane,
                    "timed": True,
                    "status": "completed",
                    "timing": {
                        "startNs": str(start),
                        "endNs": str(end),
                        "durationNs": str(durations[lane]),
                    },
                    "run": {},
                    "oracle": copy.deepcopy(valid_oracle),
                    "error": None,
                }
            )
        crawl_pairs.append(
            {
                "pairIndex": pair_index,
                "order": order,
                "lanes": lanes,
                "observations": observations,
                "equivalence": {"evaluated": True, "valid": True, "exactEquivalentPages": 20},
            }
        )
        combined_crawl_pairs.append(
            {
                "pairIndex": pair_index,
                "order": order,
                "baselineRunner": "crawlee",
                "stasisRunner": "stasis",
                "baselineDurationNs": str(CRAWL_BASELINE[pair_index - 1]),
                "stasisDurationNs": str(CRAWL_STASIS[pair_index - 1]),
            }
        )

    crawl_raw = {
        "schema": "stasis-v0.3.3-performance-crawl-raw-v1",
        "protocol": "stasis-v0.3.3-performance-crawl-v1",
        "track": "deterministic-crawl-20-page",
        "identity": {
            "host": crawl_host,
            "provenance": {},
            "corpus": {},
            "crawlee": {},
            "stasis": {},
        },
        "rules": {},
        "warmups": [
            {"lane": "crawlee", "timed": False, "run": {}, "oracle": copy.deepcopy(valid_oracle)},
            {"lane": "stasis", "timed": False, "run": {}, "oracle": copy.deepcopy(valid_oracle)},
        ],
        "pairs": crawl_pairs,
        "controls": {
            "status": "complete",
            "timed": False,
            "includedInPrimaryDenominator": False,
            "observations": [],
        },
        "authority": {
            "status": "valid",
            "valid": True,
            "requiredPairs": 10,
            "completedPairs": 10,
            "exactEquivalentPairs": 10,
            "primaryPagesPerLane": 20,
            "reasonCodes": [],
        },
    }

    rwa_statistics = _statistics(
        baseline_label="cypress",
        baseline_distribution=_distribution(
            RWA_BASELINE, median=20_000_000, q1=15_000_000, q3=25_000_000, iqr=10_000_000
        ),
        stasis_distribution=_distribution(
            RWA_STASIS, median=9_500_000, q1=7_000_000, q3=12_000_000, iqr=5_000_000
        ),
        ratio_numerator=379,
        ratio_denominator=180,
        ratio_decimal="2.105556",
    )
    crawl_statistics = _statistics(
        baseline_label="crawlee",
        baseline_distribution=_distribution(
            CRAWL_BASELINE, median=11_250_000, q1=10_000_000, q3=12_500_000, iqr=2_500_000
        ),
        stasis_distribution=_distribution(
            CRAWL_STASIS, median=6_900_000, q1=6_400_000, q3=7_400_000, iqr=1_000_000
        ),
        ratio_numerator=194,
        ratio_denominator=119,
        ratio_decimal="1.630252",
    )
    combined = {
        "schema": "stasis-v0.3.3-combined-performance-evidence-v1",
        "authority": {
            "status": "valid",
            "valid": True,
            "rule": "both_track_authorities_must_be_valid",
        },
        "claimBoundary": {
            "scope": "per_track_single_host_exploratory_only",
            "crossHostClaimed": False,
            "generalSpeedClaimed": False,
            "interpretation": CLAIM_INTERPRETATION,
        },
        "rwa": {
            "protocol": "stasis-v0.3.3-performance-rwa-v1",
            "rawSchema": "stasis-v0.3.3-performance-rwa-raw-v1",
            "track": "rwa-auth-eight-intents",
            "host": copy.deepcopy(rwa_host),
            "hostBinding": {"field": "instanceDigest", "digest": rwa_host["instanceDigest"]},
            "workload": {
                "denominatorKind": "application_intents",
                "denominatorCount": 8,
                "timedPairs": 10,
                "interpretation": RWA_INTERPRETATION,
            },
            "pairs": rwa_pairs,
            "statistics": rwa_statistics,
        },
        "crawl": {
            "protocol": "stasis-v0.3.3-performance-crawl-v1",
            "rawSchema": "stasis-v0.3.3-performance-crawl-raw-v1",
            "track": "deterministic-crawl-20-page",
            "host": copy.deepcopy(crawl_host),
            "hostBinding": {"field": "bootInstanceDigest", "digest": crawl_host["bootInstanceDigest"]},
            "workload": {
                "denominatorKind": "pages",
                "denominatorCount": 20,
                "timedPairs": 10,
                "interpretation": CRAWL_INTERPRETATION,
            },
            "pairs": combined_crawl_pairs,
            "statistics": crawl_statistics,
        },
    }
    return rwa_wrapper, crawl_raw, combined


def _write_json(path: Path, value: object) -> bytes:
    payload = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.write_bytes(payload)
    return payload


class IndependentStatisticsReplayTests(unittest.TestCase):
    def test_replays_both_tracks_and_emits_canonical_hashed_receipt(self) -> None:
        rwa_wrapper, crawl_raw, combined = _valid_documents()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rwa_path = root / "rwa-wrapper.json"
            crawl_path = root / "crawl-raw.json"
            combined_path = root / "combined.json"
            rwa_payload = _write_json(rwa_path, rwa_wrapper)
            crawl_payload = _write_json(crawl_path, crawl_raw)
            combined_payload = _write_json(combined_path, combined)

            completed = subprocess.run(
                [sys.executable, str(MODULE_PATH), str(rwa_path), str(crawl_path), str(combined_path)],
                cwd=REPOSITORY_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=False,
            )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stderr, "")
        receipt = json.loads(completed.stdout)
        self.assertEqual(receipt["status"], "passed")
        self.assertEqual(
            receipt["scope"],
            {
                "behavioralAuthorityReverification": "not_performed",
                "name": "statistics_only",
                "requiredPriorVerificationSchema":
                    "stasis-v0.3.3-combined-performance-verification-v1",
            },
        )
        self.assertTrue(receipt["verification"]["combinedProjectionAndStatisticsExact"])
        self.assertEqual(
            receipt["verification"]["declaredAuthorityPrerequisites"],
            {"crawl": "valid", "rwa": "valid"},
        )
        self.assertNotIn("authority", receipt["verification"]["rwa"])
        self.assertNotIn("authority", receipt["verification"]["crawl"])
        self.assertEqual(receipt["verification"]["rwa"]["pairCount"], 10)
        self.assertEqual(receipt["verification"]["crawl"]["pairCount"], 10)
        self.assertEqual(
            receipt["inputs"]["rwaHostedWrapper"]["sha256"], hashlib.sha256(rwa_payload).hexdigest()
        )
        self.assertEqual(receipt["inputs"]["crawlRaw"]["sha256"], hashlib.sha256(crawl_payload).hexdigest())
        self.assertEqual(
            receipt["inputs"]["combinedEvidence"]["sha256"], hashlib.sha256(combined_payload).hexdigest()
        )
        self.assertEqual(completed.stdout, replay.canonical_receipt(receipt))

    def test_rejects_any_combined_statistic_drift(self) -> None:
        rwa_wrapper, crawl_raw, combined = _valid_documents()
        combined["rwa"]["statistics"]["pairedBaselineOverCandidate"]["decimal"] = "2.105555"
        with self.assertRaisesRegex(replay.ReplayError, "does not replay exactly"):
            replay.verify_documents(rwa_wrapper, crawl_raw, combined)

    def test_rejects_invalid_raw_authority_and_non_alternating_schedule(self) -> None:
        for mutation in ("authority", "schedule", "timed status"):
            with self.subTest(mutation=mutation):
                rwa_wrapper, crawl_raw, combined = _valid_documents()
                if mutation == "authority":
                    rwa_wrapper["authorityRaw"]["authority"]["valid"] = False
                    expected = "authority is not exactly valid"
                elif mutation == "schedule":
                    crawl_raw["pairs"][1]["order"] = "AB"
                    expected = "violates the AB/BA schedule"
                else:
                    crawl_raw["pairs"][0]["observations"][0]["status"] = "clock_error"
                    expected = "violates the lane schedule"
                with self.assertRaisesRegex(replay.ReplayError, expected):
                    replay.verify_documents(rwa_wrapper, crawl_raw, combined)

    def test_rejects_timing_that_does_not_replay_from_boundaries(self) -> None:
        rwa_wrapper, crawl_raw, combined = _valid_documents()
        rwa_wrapper["authorityRaw"]["samples"][0]["timing"]["durationNs"] = "11000001"
        with self.assertRaisesRegex(replay.ReplayError, "boundaries do not replay"):
            replay.verify_documents(rwa_wrapper, crawl_raw, combined)

    def test_json_reader_rejects_duplicate_keys(self) -> None:
        rwa_wrapper, crawl_raw, _ = _valid_documents()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rwa_path = root / "rwa.json"
            crawl_path = root / "crawl.json"
            combined_path = root / "combined.json"
            _write_json(rwa_path, rwa_wrapper)
            _write_json(crawl_path, crawl_raw)
            combined_path.write_text('{"schema":"first","schema":"second"}\n', encoding="utf-8")
            with self.assertRaisesRegex(replay.ReplayError, "duplicate object key"):
                replay.replay_files(rwa_path, crawl_path, combined_path)

    def test_exact_fraction_rounding_is_half_up(self) -> None:
        self.assertEqual(replay.format_fixed_6(Fraction(1, 2), 1_000_000), "0.000001")
        self.assertEqual(replay.format_fixed_6(Fraction(2_469_131, 2_000_000)), "1.234566")


if __name__ == "__main__":
    unittest.main()
