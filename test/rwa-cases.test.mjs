import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  rwaAuthAdapters,
  rwaAuthCases,
  rwaAuthInventory,
  rwaAuthNoAppModificationConstraints,
  rwaAuthSemanticDifferences,
  rwaAuthSource,
} from "../src/rwa/cases.mjs";

const expectedCases = [
  [1, "auth-01-unauthenticated-redirect", "should redirect unauthenticated user to signin page", 20, 24],
  [2, "auth-02-login-home-redirect", "should redirect to the home page after login", 26, 31],
  [3, "auth-03-remember-user-thirty-days", "should remember a user for 30 days after login", 33, 48],
  [4, "auth-04-signup-login-onboard-logout", "should allow a visitor to sign-up, login, and logout", 50, 109],
  [5, "auth-05-login-validation-errors", "should display login errors", 111, 129],
  [6, "auth-06-signup-validation-errors", "should display signup errors", 131, 165],
  [7, "auth-07-invalid-user", "should error for an invalid user", 167, 174],
  [8, "auth-08-invalid-password-existing-user", "should error for an invalid password for existing user", 176, 185],
];

const expectedOracleIds = [
  ["final-path"],
  ["final-path"],
  ["remember-cookie-expiry", "final-path"],
  [
    "signup-title",
    "signup-response",
    "created-user",
    "onboarding-step-one",
    "onboarding-bank-title",
    "bank-account-response",
    "created-bank-account",
    "onboarding-finished",
    "transaction-list",
    "final-path",
  ],
  ["username-required", "password-too-short", "signin-submit-disabled"],
  [
    "first-name-required",
    "last-name-required",
    "username-required",
    "password-required",
    "confirm-password-mismatch",
    "signup-submit-disabled",
  ],
  ["invalid-credentials-error"],
  ["invalid-credentials-error"],
];

const allowedPublicOperations = new Set([
  "openSession",
  "settle",
  "fill",
  "focus",
  "check",
  "activate",
  "query",
  "text",
  "extract",
  "getCookies",
  "requests",
  "evidence",
]);

function assertDeepFrozen(value, path = "inventory") {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, `${path} is mutable`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}

test("the RWA auth denominator is pinned to the exact upstream source identity", () => {
  assert.deepEqual(rwaAuthSource, {
    repository: "cypress-io/cypress-realworld-app",
    revision: "28ca4d03e4c68d366ccdbb25d43e1f37b3c67a4d",
    specPath: "cypress/tests/ui/auth.spec.ts",
    specBlobOid: "9554bac0826cb996c5bb4cab3c46d3ad81e2603c",
    specBlobSha256: "1bdea574f3b9dd6c608522ddf698a72d2295963bb8e400ae27966d1fa011366d",
    windowsCrlfWorktreeSha256: "b5e2150c626b7c8e9849f70b25f143759a7fafaba1421e804bb94471fe748966",
    worktreeLineEndings: "CRLF",
    describeTitle: "User Sign-up and Login",
    denominator: 8,
    order: "exact source order",
  });
  assert.equal(rwaAuthCases.length, 8);
  assert.deepEqual(
    rwaAuthCases.map(({ ordinal, id, source }) => [
      ordinal,
      id,
      source.title,
      source.declarationLine,
      source.endLine,
    ]),
    expectedCases,
  );
  for (const entry of rwaAuthCases) {
    assert.equal(
      entry.source.lineIdentity,
      `${rwaAuthSource.specPath}:${entry.source.declarationLine}-${entry.source.endLine}`,
    );
  }
});

test("every case has a frozen, pre-registered behavioral oracle and no visual oracle", () => {
  assert.deepEqual(
    rwaAuthCases.map((entry) => entry.oracles.map(({ id }) => id)),
    expectedOracleIds,
  );
  for (const entry of rwaAuthCases) {
    assert.equal(new Set(entry.oracles.map(({ id }) => id)).size, entry.oracles.length);
    for (const oracle of entry.oracles) {
      assert.equal(/visual|snapshot|screenshot|layout|animation/i.test(oracle.kind), false);
      const observerIsPublic = allowedPublicOperations.has(oracle.observer);
      const observerIsAdapter = Object.hasOwn(rwaAuthAdapters, oracle.observer);
      assert.equal(observerIsPublic || observerIsAdapter, true, `${entry.id}: unknown oracle observer ${oracle.observer}`);
    }
  }
});

test("the action maps contain only public controlled-session operations", () => {
  const expectedStarts = ["/personal", "/signin", "/signin", "/", "/", "/signup", "/signin", "/signin"];
  for (const [index, entry] of rwaAuthCases.entries()) {
    assert.equal(entry.stasisActions[0].op, "openSession");
    assert.equal(entry.stasisActions[0].path, expectedStarts[index]);
    assert.equal(entry.stasisActions.some(({ op }) => op === "settle"), true);
    for (const mappedAction of entry.stasisActions) {
      assert.equal(
        allowedPublicOperations.has(mappedAction.op),
        true,
        `${entry.id}: non-public or forbidden action ${mappedAction.op}`,
      );
      assert.equal(
        /sleep|poll|retry|fallback|evaluate|script|react|xstate|business.?api/i.test(mappedAction.op),
        false,
      );
    }
  }

  const signupFlow = rwaAuthCases[3].stasisActions;
  assert.equal(signupFlow.some(({ op, selector }) => op === "activate" && selector === '[data-test="signup-submit"]'), true);
  assert.equal(
    signupFlow.some(({ op, selector }) => op === "activate" && selector === '[data-test="bankaccount-submit"]'),
    true,
  );
  assert.equal(signupFlow.some(({ op, selector }) => op === "activate" && selector === '[data-test="sidenav-signout"]'), true);
  assert.equal(signupFlow.some(({ op, selector }) => op === "fill" && selector === "#bankaccount-bankName-input"), true);
});

test("known semantic differences are referenced before execution", () => {
  for (const entry of rwaAuthCases) {
    assert.equal(entry.semanticDifferenceIds.length > 0, true);
    assert.equal(new Set(entry.semanticDifferenceIds).size, entry.semanticDifferenceIds.length);
    for (const id of entry.semanticDifferenceIds) {
      assert.equal(Object.hasOwn(rwaAuthSemanticDifferences, id), true, `${entry.id}: unknown semantic difference ${id}`);
    }
  }

  for (const index of [1, 2, 3]) {
    assert.equal(rwaAuthCases[index].semanticDifferenceIds.includes("persistent-cookie-profile-gap"), true);
  }
  for (const index of [4, 5]) {
    assert.equal(rwaAuthCases[index].semanticDifferenceIds.includes("blur-via-focus-transfer"), true);
  }
  assert.equal(rwaAuthCases[3].semanticDifferenceIds.includes("substring-selector-specialized-to-exact"), true);
  assert.equal(rwaAuthCases[3].semanticDifferenceIds.includes("graphql-operation-name-redacted"), true);
  assert.equal(rwaAuthCases[5].semanticDifferenceIds.includes("unused-intercept-has-no-oracle"), true);
});

test("all cases inherit the same no-app-modification and isolation constraints", () => {
  const expectedConstraintIds = [
    "exact-upstream-revision",
    "no-harness-upstream-edits",
    "unaltered-rwa-processes",
    "case-isolation",
    "restore-runtime-database-after-shutdown",
    "zero-retries-no-fallback",
    "public-stasis-session-only",
    "no-app-internals-or-script-injection",
    "ui-actions-not-business-api",
    "seed-endpoint-only-setup-write",
    "no-sleeps-or-dom-polling",
  ];
  assert.equal(rwaAuthNoAppModificationConstraints.harnessMayWriteUpstream, false);
  assert.deepEqual(rwaAuthNoAppModificationConstraints.serverRuntimeWritablePaths, ["data/database.json"]);
  assert.deepEqual(rwaAuthNoAppModificationConstraints.isolation, {
    cypress: "Upstream Cypress test isolation inside one zero-retry spec run.",
    stasis: "One fresh native process and controlled session per case.",
  });
  assert.deepEqual(rwaAuthNoAppModificationConstraints.forbiddenUpstreamEdits, [
    "application source",
    "Cypress tests or support code",
    "test server or backend",
    "seed fixtures, including data/database-seed.json",
    "configuration",
    "lockfiles",
  ]);
  assert.deepEqual(
    rwaAuthNoAppModificationConstraints.rules.map(({ id }) => id),
    expectedConstraintIds,
  );
  for (const entry of rwaAuthCases) {
    assert.deepEqual(entry.constraintIds, expectedConstraintIds);
    assert.equal(entry.harnessSetup[0].adapter, "seed-reset");
    for (const adapter of entry.adapterRequirements) {
      assert.equal(Object.hasOwn(rwaAuthAdapters, adapter), true, `${entry.id}: unknown adapter ${adapter}`);
    }
  }
});

test("unmet public-surface requirements stay explicit instead of becoming hidden workarounds", () => {
  assert.deepEqual(rwaAuthAdapters["controlled-open-final-url"], {
    boundary: "public Stasis SDK",
    availability: "existing-owner-attested-open-result",
    allowed: true,
    purpose: "Observe the final URL attested by Session.open for the controlled document it returns.",
  });
  assert.deepEqual(rwaAuthAdapters["current-top-level-path"], {
    boundary: "public Stasis SDK",
    availability: "missing-public-surface",
    allowed: false,
    purpose: "Observe the live top-level pathname after client-side history changes.",
    classificationWhenRequired: "SDK_GAP",
    forbiddenWorkaround: "Page evaluation, injected route markers, or non-public engine access.",
  });
  assert.deepEqual(rwaAuthAdapters["controlled-settle-final-url"], {
    boundary: "public Stasis SDK",
    availability: "candidate-v2-owner-attested-settle-result",
    allowed: true,
    purpose: "Observe the final URL attested by the relevant controlled-web-session-v2 settle result.",
  });
  assert.deepEqual(
    rwaAuthCases.filter(({ oracles }) => oracles.some(({ kind }) => kind === "top-level-path")).map(({ ordinal }) => ordinal),
    [],
  );
  assert.deepEqual(
    rwaAuthCases
      .filter(({ oracles }) =>
        oracles.some(({ kind }) => kind === "controlled-settle-final-url"))
      .map(({ ordinal }) => ordinal),
    [2, 3, 4],
  );
  assert.deepEqual(
    rwaAuthCases.slice(1, 4).map(({ stasisActions, oracles }) => ({
      settledPathStages: stasisActions
        .filter(({ op, observeSettledPath }) => op === "settle" && observeSettledPath === true)
        .map(({ stage }) => stage),
      expected: oracles.find(({ kind }) => kind === "controlled-settle-final-url")?.expected,
    })),
    [
      { settledPathStages: ["login response and home render"], expected: "/" },
      { settledPathStages: ["logout response and sign-in render"], expected: "/signin" },
      { settledPathStages: ["logout response and sign-in render"], expected: "/signin" },
    ],
  );
  assert.equal(
    rwaAuthCases.slice(0, 4).some(({ semanticDifferenceIds }) =>
      semanticDifferenceIds.includes("current-path-sdk-gap")),
    false,
  );
  assert.equal(rwaAuthCases[0].oracles[0].kind, "controlled-open-final-url");
  assert.equal(rwaAuthCases[0].oracles[0].expected, "/signin");
  assert.equal(rwaAuthCases[0].semanticDifferenceIds.includes("current-path-sdk-gap"), false);
  assert.equal(rwaAuthSemanticDifferences["persistent-cookie-profile-gap"].candidate.includes("unsupported_persistent_cookie"), true);
});

test("the exported inventory is immutable and changes are review-visible", () => {
  assertDeepFrozen(rwaAuthInventory);
  const digest = createHash("sha256").update(JSON.stringify(rwaAuthInventory)).digest("hex");
  assert.equal(digest, "5cd9ff537d6da7a7dcab4c7994412853141a790b44b5e4edd6e32a8fc16b9609");
});
