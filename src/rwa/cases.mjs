const upstreamRevision = "28ca4d03e4c68d366ccdbb25d43e1f37b3c67a4d";
const upstreamSpecPath = "cypress/tests/ui/auth.spec.ts";

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function source(title, startLine, endLine) {
  return {
    title,
    declarationLine: startLine,
    endLine,
    lineIdentity: `${upstreamSpecPath}:${startLine}-${endLine}`,
  };
}

function action(op, details = {}) {
  return { op, ...details };
}

function oracle(id, kind, expected, observer) {
  return { id, kind, expected, observer };
}

export const rwaAuthSource = deepFreeze({
  repository: "cypress-io/cypress-realworld-app",
  revision: upstreamRevision,
  specPath: upstreamSpecPath,
  specBlobOid: "9554bac0826cb996c5bb4cab3c46d3ad81e2603c",
  specBlobSha256: "1bdea574f3b9dd6c608522ddf698a72d2295963bb8e400ae27966d1fa011366d",
  windowsCrlfWorktreeSha256: "b5e2150c626b7c8e9849f70b25f143759a7fafaba1421e804bb94471fe748966",
  worktreeLineEndings: "CRLF",
  describeTitle: "User Sign-up and Login",
  denominator: 8,
  order: "exact source order",
});

export const rwaAuthNoAppModificationConstraints = deepFreeze({
  upstreamRevision,
  harnessMayWriteUpstream: false,
  serverRuntimeWritablePaths: ["data/database.json"],
  forbiddenUpstreamEdits: [
    "application source",
    "Cypress tests or support code",
    "test server or backend",
    "seed fixtures, including data/database-seed.json",
    "configuration",
    "lockfiles",
  ],
  isolation: {
    cypress: "Upstream Cypress test isolation inside one zero-retry spec run.",
    stasis: "One fresh native process and controlled session per case.",
  },
  rules: [
    {
      id: "exact-upstream-revision",
      requirement: "Run the detached RWA checkout at the exact recorded revision.",
    },
    {
      id: "no-harness-upstream-edits",
      requirement: "The harness must not write any upstream path or alter the pinned source/seed bytes.",
    },
    {
      id: "unaltered-rwa-processes",
      requirement: "Use the upstream production build, scripts/testServer.ts, backend, and lowdb data.",
    },
    {
      id: "case-isolation",
      requirement: "Seed before every case; use Cypress test isolation in one run and a fresh Stasis process/session per case.",
    },
    {
      id: "restore-runtime-database-after-shutdown",
      requirement: "After the upstream server stops, restore data/database.json to its pinned bytes before the final clean-tree gate.",
    },
    {
      id: "zero-retries-no-fallback",
      requirement: "Use zero runner retries and no alternate runner or hidden fallback.",
    },
    {
      id: "public-stasis-session-only",
      requirement: "Use only public controlled-session operations; candidate profiles must be selected explicitly by the lane.",
    },
    {
      id: "no-app-internals-or-script-injection",
      requirement: "Do not invoke React/XState internals, evaluate page scripts, or inject helper code.",
    },
    {
      id: "ui-actions-not-business-api",
      requirement: "Do not call a business API instead of performing the corresponding UI action.",
    },
    {
      id: "seed-endpoint-only-setup-write",
      requirement: "The existing /testData/seed reset is the sole setup-only HTTP mutation exception; its server-owned lowdb write is allowed.",
    },
    {
      id: "no-sleeps-or-dom-polling",
      requirement: "Use settle() for progress; sleeps, waitForTimeout, and DOM polling are forbidden.",
    },
  ],
});

const allConstraintIds = rwaAuthNoAppModificationConstraints.rules.map(({ id }) => id);

export const rwaAuthAdapters = deepFreeze({
  "seed-reset": {
    boundary: "harness",
    availability: "existing",
    allowed: true,
    purpose: "Call the unchanged upstream /testData/seed endpoint before each case.",
  },
  "seeded-user-fixture": {
    boundary: "harness",
    availability: "existing-read-only",
    allowed: true,
    purpose: "Read the first seeded user's username without changing the upstream checkout or database.",
  },
  "network-audit-correlator": {
    boundary: "harness",
    availability: "composable-from-public-session-audits",
    allowed: true,
    purpose: "Join session.requests() and session.evidence() by request identity to observe method, path, and status.",
  },
  "backend-state-observer": {
    boundary: "harness",
    availability: "existing-read-only",
    allowed: true,
    purpose: "Read fresh lowdb state after the UI flow to verify user and bank-account mutations.",
  },
  "controlled-open-final-url": {
    boundary: "public Stasis SDK",
    availability: "existing-owner-attested-open-result",
    allowed: true,
    purpose: "Observe the final URL attested by Session.open for the controlled document it returns.",
  },
  "controlled-settle-final-url": {
    boundary: "public Stasis SDK",
    availability: "candidate-v2-owner-attested-settle-result",
    allowed: true,
    purpose: "Observe the final URL attested by the relevant controlled-web-session-v2 settle result.",
  },
  "current-top-level-path": {
    boundary: "public Stasis SDK",
    availability: "missing-public-surface",
    allowed: false,
    purpose: "Observe the live top-level pathname after client-side history changes.",
    classificationWhenRequired: "SDK_GAP",
    forbiddenWorkaround: "Page evaluation, injected route markers, or non-public engine access.",
  },
});

export const rwaAuthSemanticDifferences = deepFreeze({
  "settle-instead-of-cypress-retry": {
    baseline: "Cypress commands and assertions retry until their command timeout.",
    candidate: "Each Stasis observation is one-shot after explicit deterministic settle().",
    treatment: "Preserve as a semantic difference; do not add sleeps, polling, or retries.",
  },
  "input-replacement-not-key-sequence": {
    baseline: "cy.type() emits a character-oriented keyboard/input sequence and cy.clear() performs its own sequence.",
    candidate: "session.fill() replaces the value and emits one input event without focus, keyboard, or change events.",
    treatment: "Compare final app behavior, not event-log equivalence.",
  },
  "semantic-click-not-actionability": {
    baseline: "cy.click() performs Cypress actionability checks and pointer-like synthesis.",
    candidate: "session.activate() uses HTMLElement.click() without layout, hit-testing, or pointer synthesis.",
    treatment: "Compare resulting semantic state only.",
  },
  "blur-via-focus-transfer": {
    baseline: "The spec calls blur() directly after type/clear.",
    candidate: "The public API has focus() but no blur(); focusing another control produces the native focus transition.",
    treatment: "Use focus transfer and retain the exact validation-message oracle.",
  },
  "visibility-reduced-to-semantic-dom": {
    baseline: "Several assertions use be.visible.",
    candidate: "The Stasis profile has no layout-backed visibility observation.",
    treatment: "Per protocol, require semantic presence/absence and text, not pixel visibility.",
  },
  "visual-snapshots-excluded": {
    baseline: "The upstream cases take Percy visual snapshots.",
    candidate: "Screenshots and layout comparison are outside the selected controlled-session profiles.",
    treatment: "Visual snapshots are explicitly excluded from the equivalence oracle.",
  },
  "disabled-property-via-attribute": {
    baseline: "Cypress's be.disabled checks native disabled state.",
    candidate: "The frozen port reads the native button's raw disabled attribute.",
    treatment: "For these React-rendered native buttons, attribute presence is the pre-registered semantic proxy.",
  },
  "substring-selector-specialized-to-exact": {
    baseline: "getBySelLike() uses an attribute-substring selector.",
    candidate: "practical_selector_v2 rejects substring operators but accepts exact attribute equality and IDs.",
    treatment: "Target the unchanged app's exact bank-account IDs/data-test values; do not modify the app.",
  },
  "graphql-operation-name-redacted": {
    baseline: "Cypress aliases the /graphql request by reading request.body.operationName.",
    candidate: "Public Stasis request/evidence records do not expose request bodies.",
    treatment: "Correlate POST /graphql status with the exact Finished UI and persisted bank-account oracle.",
  },
  "current-path-sdk-gap": {
    baseline: "cy.location(\"pathname\") observes the live SPA pathname.",
    candidate: "Session.url owner-attests the document returned by open; controlled-web-session-v2 settle results additionally owner-attest the final URL after the settlement linearization point.",
    treatment: "Use only the URL returned by the relevant public open or settle result; never inject a page helper or read hidden browser state.",
  },
  "persistent-cookie-profile-gap": {
    baseline: "Remember-me sets a 30-day connect.sid cookie and Express logout clears it with Expires.",
    candidate: "The v0.2 profile rejects Set-Cookie with Expires or Max-Age as unsupported_persistent_cookie.",
    treatment: "Report PROFILE_UNSUPPORTED when that response is reached; do not strip or rewrite headers.",
  },
  "desktop-viewport-not-configurable": {
    baseline: "Cypress runs this spec at 1280x1000 and skips the mobile drawer-toggle branch.",
    candidate: "The public Stasis session API does not expose viewport configuration.",
    treatment: "Record the engine viewport and preserve the branch difference; do not patch responsive app code.",
  },
  "unused-intercept-has-no-oracle": {
    baseline: "The signup-error case installs an unaliased GET /signup intercept without waiting on or asserting it.",
    candidate: "No Stasis action is needed for instrumentation that has no behavioral assertion.",
    treatment: "Do not add request ordering or interception shape to the equivalence oracle.",
  },
});

const commonSetup = [{ adapter: "seed-reset", operation: "reset", timing: "before-open" }];

export const rwaAuthCases = deepFreeze([
  {
    id: "auth-01-unauthenticated-redirect",
    ordinal: 1,
    source: source("should redirect unauthenticated user to signin page", 20, 24),
    harnessSetup: commonSetup,
    adapterRequirements: ["seed-reset", "controlled-open-final-url", "network-audit-correlator"],
    stasisActions: [
      action("openSession", { path: "/personal" }),
      action("settle", { stage: "initial redirect and sign-in render" }),
      action("requests", { purpose: "record navigation diagnostics" }),
      action("evidence", { purpose: "record navigation diagnostics" }),
    ],
    oracles: [
      oracle(
        "final-path",
        "controlled-open-final-url",
        "/signin",
        "controlled-open-final-url",
      ),
    ],
    semanticDifferenceIds: [
      "settle-instead-of-cypress-retry",
      "visual-snapshots-excluded",
    ],
    constraintIds: allConstraintIds,
  },
  {
    id: "auth-02-login-home-redirect",
    ordinal: 2,
    source: source("should redirect to the home page after login", 26, 31),
    harnessSetup: [...commonSetup, { adapter: "seeded-user-fixture", operation: "read-first-user" }],
    adapterRequirements: [
      "seed-reset",
      "seeded-user-fixture",
      "controlled-settle-final-url",
      "network-audit-correlator",
    ],
    stasisActions: [
      action("openSession", { path: "/signin" }),
      action("settle", { stage: "sign-in form ready" }),
      action("fill", { selector: "#username", valueRef: "seededUser.username" }),
      action("fill", { selector: "#password", value: "s3cret" }),
      action("check", { selector: '[data-test="signin-remember-me"] input' }),
      action("activate", { selector: '[data-test="signin-submit"]' }),
      action("settle", { stage: "login response and home render", observeSettledPath: true }),
      action("requests", { purpose: "record POST /login and navigation diagnostics" }),
      action("evidence", { purpose: "record POST /login status and navigation diagnostics" }),
    ],
    oracles: [
      oracle(
        "final-path",
        "controlled-settle-final-url",
        "/",
        "controlled-settle-final-url",
      ),
    ],
    semanticDifferenceIds: [
      "settle-instead-of-cypress-retry",
      "input-replacement-not-key-sequence",
      "semantic-click-not-actionability",
      "persistent-cookie-profile-gap",
    ],
    constraintIds: allConstraintIds,
  },
  {
    id: "auth-03-remember-user-thirty-days",
    ordinal: 3,
    source: source("should remember a user for 30 days after login", 33, 48),
    harnessSetup: [...commonSetup, { adapter: "seeded-user-fixture", operation: "read-first-user" }],
    adapterRequirements: [
      "seed-reset",
      "seeded-user-fixture",
      "controlled-settle-final-url",
      "network-audit-correlator",
    ],
    stasisActions: [
      action("openSession", { path: "/signin" }),
      action("settle", { stage: "sign-in form ready" }),
      action("fill", { selector: "#username", valueRef: "seededUser.username" }),
      action("fill", { selector: "#password", value: "s3cret" }),
      action("check", { selector: '[data-test="signin-remember-me"] input' }),
      action("activate", { selector: '[data-test="signin-submit"]' }),
      action("settle", { stage: "remember-me login response and authenticated render" }),
      action("getCookies", { name: "connect.sid" }),
      action("activate", { selector: '[data-test="sidenav-signout"]' }),
      action("settle", { stage: "logout response and sign-in render", observeSettledPath: true }),
      action("requests", { purpose: "record login/logout and navigation diagnostics" }),
      action("evidence", { purpose: "record login/logout status and navigation diagnostics" }),
    ],
    oracles: [
      oracle(
        "remember-cookie-expiry",
        "cookie-property",
        { name: "connect.sid", upstreamProperty: "expiry", stasisField: "expiresUnixTimeNs", predicate: "non-null" },
        "getCookies",
      ),
      oracle(
        "final-path",
        "controlled-settle-final-url",
        "/signin",
        "controlled-settle-final-url",
      ),
    ],
    semanticDifferenceIds: [
      "settle-instead-of-cypress-retry",
      "input-replacement-not-key-sequence",
      "semantic-click-not-actionability",
      "persistent-cookie-profile-gap",
      "desktop-viewport-not-configurable",
      "visual-snapshots-excluded",
    ],
    constraintIds: allConstraintIds,
  },
  {
    id: "auth-04-signup-login-onboard-logout",
    ordinal: 4,
    source: source("should allow a visitor to sign-up, login, and logout", 50, 109),
    harnessSetup: commonSetup,
    fixtureInputs: {
      user: {
        firstName: "Bob",
        lastName: "Ross",
        username: "PainterJoy90",
        password: "s3cret",
      },
      bankAccount: {
        bankName: "The Best Bank",
        accountNumber: "123456789",
        routingNumber: "987654321",
      },
    },
    adapterRequirements: [
      "seed-reset",
      "network-audit-correlator",
      "backend-state-observer",
      "controlled-settle-final-url",
    ],
    stasisActions: [
      action("openSession", { path: "/" }),
      action("settle", { stage: "unauthenticated app ready" }),
      action("activate", { selector: '[data-test="signup"]' }),
      action("settle", { stage: "sign-up form ready" }),
      action("text", { selector: '[data-test="signup-title"]' }),
      action("fill", { selector: "#firstName", valueRef: "user.firstName" }),
      action("fill", { selector: "#lastName", valueRef: "user.lastName" }),
      action("fill", { selector: "#username", valueRef: "user.username" }),
      action("fill", { selector: "#password", valueRef: "user.password" }),
      action("fill", { selector: "#confirmPassword", valueRef: "user.password" }),
      action("activate", { selector: '[data-test="signup-submit"]' }),
      action("settle", { stage: "POST /users and sign-in form ready" }),
      action("fill", { selector: "#username", valueRef: "user.username" }),
      action("fill", { selector: "#password", valueRef: "user.password" }),
      action("activate", { selector: '[data-test="signin-submit"]' }),
      action("settle", { stage: "login and onboarding step one ready" }),
      action("query", { selector: '[data-test="user-onboarding-dialog"]' }),
      action("query", { selector: '[data-test="list-skeleton"]' }),
      action("query", { selector: '[data-test="nav-top-notifications-count"]' }),
      action("activate", { selector: '[data-test="user-onboarding-next"]' }),
      action("settle", { stage: "onboarding bank-account form ready" }),
      action("text", { selector: '[data-test="user-onboarding-dialog-title"]' }),
      action("fill", { selector: "#bankaccount-bankName-input", valueRef: "bankAccount.bankName" }),
      action("fill", { selector: "#bankaccount-accountNumber-input", valueRef: "bankAccount.accountNumber" }),
      action("fill", { selector: "#bankaccount-routingNumber-input", valueRef: "bankAccount.routingNumber" }),
      action("activate", { selector: '[data-test="bankaccount-submit"]' }),
      action("settle", { stage: "CreateBankAccount response and finished step ready" }),
      action("text", { selector: '[data-test="user-onboarding-dialog-title"]' }),
      action("text", { selector: '[data-test="user-onboarding-dialog-content"]' }),
      action("activate", { selector: '[data-test="user-onboarding-next"]' }),
      action("settle", { stage: "transaction list ready" }),
      action("query", { selector: '[data-test="transaction-list"]' }),
      action("activate", { selector: '[data-test="sidenav-signout"]' }),
      action("settle", { stage: "logout response and sign-in render", observeSettledPath: true }),
      action("requests", { purpose: "record /users, /login, /graphql, /logout, and navigation diagnostics" }),
      action("evidence", { purpose: "record response status for the relevant requests" }),
    ],
    oracles: [
      oracle("signup-title", "dom-text", { selector: '[data-test="signup-title"]', contains: "Sign Up" }, "text"),
      oracle(
        "signup-response",
        "network-response",
        { method: "POST", path: "/users", statusRange: [200, 299] },
        "network-audit-correlator",
      ),
      oracle(
        "created-user",
        "persisted-backend-state",
        { entity: "user", matchesFixture: "user", passwordExcludedFromReport: true },
        "backend-state-observer",
      ),
      oracle(
        "onboarding-step-one",
        "semantic-dom",
        {
          present: ['[data-test="user-onboarding-dialog"]', '[data-test="nav-top-notifications-count"]'],
          absent: ['[data-test="list-skeleton"]'],
        },
        "query",
      ),
      oracle(
        "onboarding-bank-title",
        "dom-text",
        { selector: '[data-test="user-onboarding-dialog-title"]', contains: "Create Bank Account" },
        "text",
      ),
      oracle(
        "bank-account-response",
        "network-response",
        { method: "POST", path: "/graphql", statusRange: [200, 299], operationIntent: "CreateBankAccount" },
        "network-audit-correlator",
      ),
      oracle(
        "created-bank-account",
        "persisted-backend-state",
        { entity: "bankAccount", owner: "created-user", matchesFixture: "bankAccount" },
        "backend-state-observer",
      ),
      oracle(
        "onboarding-finished",
        "dom-text-set",
        [
          { selector: '[data-test="user-onboarding-dialog-title"]', contains: "Finished" },
          { selector: '[data-test="user-onboarding-dialog-content"]', contains: "You're all set!" },
        ],
        "text",
      ),
      oracle(
        "transaction-list",
        "semantic-dom",
        { present: ['[data-test="transaction-list"]'], absent: [] },
        "query",
      ),
      oracle(
        "final-path",
        "controlled-settle-final-url",
        "/signin",
        "controlled-settle-final-url",
      ),
    ],
    semanticDifferenceIds: [
      "settle-instead-of-cypress-retry",
      "input-replacement-not-key-sequence",
      "semantic-click-not-actionability",
      "visibility-reduced-to-semantic-dom",
      "visual-snapshots-excluded",
      "substring-selector-specialized-to-exact",
      "graphql-operation-name-redacted",
      "persistent-cookie-profile-gap",
      "desktop-viewport-not-configurable",
    ],
    constraintIds: allConstraintIds,
  },
  {
    id: "auth-05-login-validation-errors",
    ordinal: 5,
    source: source("should display login errors", 111, 129),
    harnessSetup: commonSetup,
    adapterRequirements: ["seed-reset"],
    stasisActions: [
      action("openSession", { path: "/" }),
      action("settle", { stage: "sign-in form ready" }),
      action("focus", { selector: "#username" }),
      action("fill", { selector: "#username", value: "User" }),
      action("fill", { selector: "#username", value: "" }),
      action("focus", { selector: "#password", purpose: "blur username" }),
      action("settle", { stage: "username validation rendered" }),
      action("text", { selector: "#username-helper-text" }),
      action("fill", { selector: "#password", value: "abc" }),
      action("focus", { selector: "#username", purpose: "blur password" }),
      action("settle", { stage: "password validation rendered" }),
      action("text", { selector: "#password-helper-text" }),
      action("extract", { selector: '[data-test="signin-submit"]', field: "attribute:disabled" }),
    ],
    oracles: [
      oracle(
        "username-required",
        "dom-text",
        { selector: "#username-helper-text", contains: "Username is required" },
        "text",
      ),
      oracle(
        "password-too-short",
        "dom-text",
        { selector: "#password-helper-text", contains: "Password must contain at least 4 characters" },
        "text",
      ),
      oracle(
        "signin-submit-disabled",
        "native-disabled",
        { selector: '[data-test="signin-submit"]', value: true },
        "extract",
      ),
    ],
    semanticDifferenceIds: [
      "settle-instead-of-cypress-retry",
      "input-replacement-not-key-sequence",
      "blur-via-focus-transfer",
      "visibility-reduced-to-semantic-dom",
      "disabled-property-via-attribute",
      "visual-snapshots-excluded",
    ],
    constraintIds: allConstraintIds,
  },
  {
    id: "auth-06-signup-validation-errors",
    ordinal: 6,
    source: source("should display signup errors", 131, 165),
    harnessSetup: commonSetup,
    adapterRequirements: ["seed-reset"],
    stasisActions: [
      action("openSession", { path: "/signup" }),
      action("settle", { stage: "sign-up form ready" }),
      action("focus", { selector: "#firstName" }),
      action("fill", { selector: "#firstName", value: "First" }),
      action("fill", { selector: "#firstName", value: "" }),
      action("focus", { selector: "#lastName", purpose: "blur firstName" }),
      action("fill", { selector: "#lastName", value: "Last" }),
      action("fill", { selector: "#lastName", value: "" }),
      action("focus", { selector: "#username", purpose: "blur lastName" }),
      action("fill", { selector: "#username", value: "User" }),
      action("fill", { selector: "#username", value: "" }),
      action("focus", { selector: "#password", purpose: "blur username" }),
      action("fill", { selector: "#password", value: "password" }),
      action("fill", { selector: "#password", value: "" }),
      action("focus", { selector: "#confirmPassword", purpose: "blur password" }),
      action("fill", { selector: "#confirmPassword", value: "DIFFERENT PASSWORD" }),
      action("focus", { selector: "#firstName", purpose: "blur confirmPassword" }),
      action("settle", { stage: "all validation messages rendered" }),
      action("text", { selector: "#firstName-helper-text" }),
      action("text", { selector: "#lastName-helper-text" }),
      action("text", { selector: "#username-helper-text" }),
      action("text", { selector: "#password-helper-text" }),
      action("text", { selector: "#confirmPassword-helper-text" }),
      action("extract", { selector: '[data-test="signup-submit"]', field: "attribute:disabled" }),
    ],
    oracles: [
      oracle(
        "first-name-required",
        "dom-text",
        { selector: "#firstName-helper-text", contains: "First Name is required" },
        "text",
      ),
      oracle(
        "last-name-required",
        "dom-text",
        { selector: "#lastName-helper-text", contains: "Last Name is required" },
        "text",
      ),
      oracle(
        "username-required",
        "dom-text",
        { selector: "#username-helper-text", contains: "Username is required" },
        "text",
      ),
      oracle(
        "password-required",
        "dom-text",
        { selector: "#password-helper-text", contains: "Enter your password" },
        "text",
      ),
      oracle(
        "confirm-password-mismatch",
        "dom-text",
        { selector: "#confirmPassword-helper-text", contains: "Password does not match" },
        "text",
      ),
      oracle(
        "signup-submit-disabled",
        "native-disabled",
        { selector: '[data-test="signup-submit"]', value: true },
        "extract",
      ),
    ],
    semanticDifferenceIds: [
      "settle-instead-of-cypress-retry",
      "input-replacement-not-key-sequence",
      "blur-via-focus-transfer",
      "visibility-reduced-to-semantic-dom",
      "disabled-property-via-attribute",
      "visual-snapshots-excluded",
      "unused-intercept-has-no-oracle",
    ],
    constraintIds: allConstraintIds,
  },
  {
    id: "auth-07-invalid-user",
    ordinal: 7,
    source: source("should error for an invalid user", 167, 174),
    harnessSetup: commonSetup,
    adapterRequirements: ["seed-reset", "network-audit-correlator"],
    stasisActions: [
      action("openSession", { path: "/signin" }),
      action("settle", { stage: "sign-in form ready" }),
      action("fill", { selector: "#username", value: "invalidUserName" }),
      action("fill", { selector: "#password", value: "invalidPa$$word" }),
      action("activate", { selector: '[data-test="signin-submit"]' }),
      action("settle", { stage: "invalid-login response and error render" }),
      action("text", { selector: '[data-test="signin-error"]' }),
      action("requests", { purpose: "record POST /login" }),
      action("evidence", { purpose: "record invalid-login response status" }),
    ],
    oracles: [
      oracle(
        "invalid-credentials-error",
        "dom-text",
        { selector: '[data-test="signin-error"]', exact: "Username or password is invalid" },
        "text",
      ),
    ],
    semanticDifferenceIds: [
      "settle-instead-of-cypress-retry",
      "input-replacement-not-key-sequence",
      "semantic-click-not-actionability",
      "visibility-reduced-to-semantic-dom",
      "visual-snapshots-excluded",
    ],
    constraintIds: allConstraintIds,
  },
  {
    id: "auth-08-invalid-password-existing-user",
    ordinal: 8,
    source: source("should error for an invalid password for existing user", 176, 185),
    harnessSetup: [...commonSetup, { adapter: "seeded-user-fixture", operation: "read-first-user" }],
    adapterRequirements: ["seed-reset", "seeded-user-fixture", "network-audit-correlator"],
    stasisActions: [
      action("openSession", { path: "/signin" }),
      action("settle", { stage: "sign-in form ready" }),
      action("fill", { selector: "#username", valueRef: "seededUser.username" }),
      action("fill", { selector: "#password", value: "INVALID" }),
      action("activate", { selector: '[data-test="signin-submit"]' }),
      action("settle", { stage: "invalid-login response and error render" }),
      action("text", { selector: '[data-test="signin-error"]' }),
      action("requests", { purpose: "record POST /login" }),
      action("evidence", { purpose: "record invalid-login response status" }),
    ],
    oracles: [
      oracle(
        "invalid-credentials-error",
        "dom-text",
        { selector: '[data-test="signin-error"]', exact: "Username or password is invalid" },
        "text",
      ),
    ],
    semanticDifferenceIds: [
      "settle-instead-of-cypress-retry",
      "input-replacement-not-key-sequence",
      "semantic-click-not-actionability",
      "visibility-reduced-to-semantic-dom",
      "visual-snapshots-excluded",
    ],
    constraintIds: allConstraintIds,
  },
]);

export const rwaAuthInventory = deepFreeze({
  source: rwaAuthSource,
  noAppModification: rwaAuthNoAppModificationConstraints,
  adapters: rwaAuthAdapters,
  semanticDifferences: rwaAuthSemanticDifferences,
  cases: rwaAuthCases,
});
