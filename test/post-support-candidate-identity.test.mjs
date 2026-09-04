import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  assertAuthoritativePostSupportCandidate,
  createPostSupportCandidateSpec,
  disposePostSupportCandidate,
  loadPostSupportCandidateSpec,
  postSupportExecutablePath,
  postSupportProfile,
  postSupportRevision,
  verifyPostSupportCandidate,
} from "../src/post-support/candidate-identity.mjs";

const hashes = Object.freeze({
  zip: "1".repeat(64),
  executable: "2".repeat(64),
  archive: "3".repeat(64),
  tree: "4".repeat(64),
  proof: "5".repeat(64),
});
const archiveIntegrity = `sha512-${"A".repeat(86)}==`;

test("post-support identity requires every explicit immutable input and serializes no local path", () => {
  assert.throws(() => loadPostSupportCandidateSpec({}), /STASIS_POST_SUPPORT_PACKAGE_RUN_ID is required/u);
  const identity = createPostSupportCandidateSpec(validInput());
  const serialized = JSON.stringify(identity);
  assert.equal(serialized.includes("C:\\private"), false);
  assert.equal(serialized.includes("Path"), false);
  assert.equal(identity.revision, postSupportRevision);
  assert.equal(identity.windows.source, "github_actions_package_workflow_ci_only_bundle");
  assert.equal(identity.sdk.source, "hosted_package_train");
  assert.equal(identity.hostedSdkPackageTrain.source, "github_actions_package_workflow");
  assert.equal(Object.isFrozen(identity.sdk.tree), true);
});

test("post-support identity rejects revision drift and noncanonical pins", () => {
  assert.throws(
    () => createPostSupportCandidateSpec({ ...validInput(), revision: "0".repeat(40) }),
    /requires Stasis revision/u,
  );
  assert.throws(
    () => createPostSupportCandidateSpec({ ...validInput(), executableSha256: "A".repeat(64) }),
    /lowercase hex/u,
  );
  assert.throws(
    () => createPostSupportCandidateSpec({ ...validInput(), sdkTreeFileCount: "01" }),
    /canonical positive integer/u,
  );
  assert.throws(
    () => createPostSupportCandidateSpec({ ...validInput(), packageRunId: "33494380295" }),
    /requires hosted package run 33506181780, attempt 1/u,
  );
  assert.throws(
    () => createPostSupportCandidateSpec({ ...validInput(), packageRunAttempt: "2" }),
    /requires hosted package run 33506181780, attempt 1/u,
  );
});

test("candidate verification binds all files, both archives, and the hosted proof before exposing the SDK", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const verifiedExtractionPath = path.resolve("C:\\verifier-owned\\stasis.exe");
  const observedPaths = [];
  const verified = await verifyPostSupportCandidate(identity, {
    platform: "win32",
    architecture: "x64",
    nodeVersion: "v22.20.0",
    inspectFile: async (filePath) => {
      observedPaths.push(filePath);
      const sizes = new Map([
        [path.resolve("C:\\private\\stasis-0.3.3-windows-x86_64-ci.zip"), 10],
        [path.resolve("C:\\private\\stasis.exe"), 20],
        [path.resolve("C:\\private\\oxhq-stasis-0.3.3.tgz"), 30],
        [path.resolve("C:\\private\\stasis-0.3.3-typescript-act-settle-inspect.json"), 50],
      ]);
      return { size: sizes.get(filePath) };
    },
    inspectDirectory: async (directoryPath) => directoryPath,
    hashFile: async (filePath) => {
      if (filePath.endsWith(".zip")) return hashes.zip;
      if (filePath.endsWith(".exe")) return hashes.executable;
      if (filePath.endsWith(".json")) return hashes.proof;
      return hashes.archive;
    },
    hashTree: async () => ({ sha256: hashes.tree, fileCount: 5, totalBytes: 40 }),
    hashArchiveIntegrity: async () => archiveIntegrity,
    readManifest: async () => ({ name: "@oxhq/stasis", version: "0.3.3" }),
    loadDistributionManifest: async () => validDistributionManifest(),
    readSdkProof: async () => validSdkProof(),
    verifyWindowsArchive: async (input) => {
      assert.equal(input.expectedRunId, "33506181780");
      assert.equal(input.expectedRunAttempt, "1");
      assert.equal(input.expectedRevision, postSupportRevision);
      return {
        fileCount: 21,
        executablePath: verifiedExtractionPath,
      };
    },
    verifySdkArchive: async () => ({ fileCount: 5 }),
    loadSdk: async () => ({
      launch() {},
      crawlWithStasis() {},
      createStasisSessionPool() {},
      CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
    }),
    inspectRuntime: async (_sdk, executablePath) => {
      assert.equal(executablePath, verifiedExtractionPath);
      return {
        implementationName: "stasis-shell",
        implementationVersion: "0.3.3",
        stasisRevision: postSupportRevision,
        v2ProfileAdvertised: true,
      };
    },
  });
  assert.equal(observedPaths.length, 4);
  assert.equal(verified.identity, identity);
  assert.equal(typeof verified.sdk.launch, "function");
  assert.equal(verified.runtime.stasisRevision, postSupportRevision);
  assert.equal(postSupportExecutablePath(verified), verifiedExtractionPath);
  assert.throws(
    () => assertAuthoritativePostSupportCandidate(verified),
    /direct default candidate verification/u,
  );

  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      platform: "win32",
      architecture: "x64",
      nodeVersion: "v22.20.0",
      inspectFile: async () => ({ size: 10 }),
      inspectDirectory: async (directoryPath) => directoryPath,
    }),
    /byte length mismatch/u,
  );
});

test("candidate verification rejects external exact-SHA labels over an uncommitted binary", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const dependencies = validVerificationDependencies();
  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      ...dependencies,
      inspectRuntime: async () => ({
        implementationName: "stasis-shell",
        implementationVersion: "0.3.3",
        stasisRevision: "uncommitted",
        v2ProfileAdvertised: true,
      }),
    }),
    /embedded runtime identity mismatch/u,
  );
});

test("a zero-own-key dependency Proxy cannot mint candidate authority", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const injected = validVerificationDependencies();
  const proxy = new Proxy({}, {
    get(_target, key) { return injected[key]; },
    ownKeys() { return []; },
    getOwnPropertyDescriptor() { return undefined; },
  });
  const verified = await verifyPostSupportCandidate(identity, proxy);
  assert.throws(
    () => assertAuthoritativePostSupportCandidate(verified),
    /direct default candidate verification/u,
  );
});

test("candidate verification rejects empty hosted slices and a detached tarball integrity", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      ...validVerificationDependencies(),
      readSdkProof: async () => ({ ...validSdkProof(), v2MessageChannel: {} }),
    }),
    /exact v2MessageChannel evidence/u,
  );
  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      ...validVerificationDependencies(),
      hashArchiveIntegrity: async () => `sha512-${"B".repeat(86)}==`,
    }),
    /exact package train/u,
  );
  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      ...validVerificationDependencies(),
      readSdkProof: async () => ({ ...validSdkProof(), nativeBinarySha256: "0".repeat(64) }),
    }),
    /exact package train/u,
  );
  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      ...validVerificationDependencies(),
      loadDistributionManifest: async () => {
        const manifest = validDistributionManifest();
        manifest.artifacts["darwin-arm64"].executableSha256 = "0".repeat(64);
        return manifest;
      },
    }),
    /exact package train/u,
  );
});

test("candidate verification binds every hosted HTTP image proof field exactly", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const fields = [
    "httpNavigationBoundary",
    "httpOutcome",
    "httpProducerPending",
    "httpProducerTerminal",
    "httpPendingImages",
    "httpRuntimeFailures",
    "httpUnsupportedWork",
    "httpExternalIo",
    "httpCompletionTrace",
    "httpEvidenceProfile",
  ];

  for (const field of fields) {
    for (const mutation of ["delete", "type drift"]) {
      const proof = validSdkProof();
      if (mutation === "delete") delete proof.v2DirectDataSvg[field];
      else proof.v2DirectDataSvg[field] = 0;
      await assert.rejects(
        verifyPostSupportCandidate(identity, {
          ...validVerificationDependencies(),
          readSdkProof: async () => proof,
        }),
        /exact v2DirectDataSvg evidence/u,
        `${field}: ${mutation}`,
      );
    }
  }

  const extra = validSdkProof();
  extra.v2DirectDataSvg.unboundHttpClaim = true;
  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      ...validVerificationDependencies(),
      readSdkProof: async () => extra,
    }),
    /exact v2DirectDataSvg evidence/u,
    "extra HTTP proof field",
  );
});

test("candidate verification binds every shared-pending inline SVG proof field exactly", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const fields = [
    "sharedNavigationBoundary",
    "sharedOutcome",
    "sharedProducerPending",
    "sharedProducerTerminal",
    "sharedPendingImages",
    "sharedRuntimeFailures",
    "sharedUnsupportedWork",
    "sharedExternalIo",
    "sharedFixtureTrace",
    "sharedEvidenceProfile",
  ];

  for (const field of fields) {
    for (const mutation of ["delete", "type drift", "value drift"]) {
      const proof = validSdkProof();
      if (mutation === "delete") delete proof.v2InlineSvgRendering[field];
      else if (mutation === "type drift") proof.v2InlineSvgRendering[field] = 0;
      else {
        const value = proof.v2InlineSvgRendering[field];
        proof.v2InlineSvgRendering[field] =
          typeof value === "boolean" ? !value : `${value}-drift`;
      }
      await assert.rejects(
        verifyPostSupportCandidate(identity, {
          ...validVerificationDependencies(),
          readSdkProof: async () => proof,
        }),
        /exact v2InlineSvgRendering evidence/u,
        `${field}: ${mutation}`,
      );
    }
  }

  const extra = validSdkProof();
  extra.v2InlineSvgRendering.privateUrl = "https://private.example.test/secret";
  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      ...validVerificationDependencies(),
      readSdkProof: async () => extra,
    }),
    /exact v2InlineSvgRendering evidence/u,
    "extra inline SVG proof field",
  );
});

test("candidate verification binds the complete settlement URL proof and schema 10 exactly", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const fields = Object.keys(validSdkProof().v2SettlementUrl);

  for (const field of fields) {
    for (const mutation of ["delete", "type drift", "value drift"]) {
      const proof = validSdkProof();
      if (mutation === "delete") delete proof.v2SettlementUrl[field];
      else if (mutation === "type drift") proof.v2SettlementUrl[field] = 0;
      else {
        const value = proof.v2SettlementUrl[field];
        proof.v2SettlementUrl[field] =
          typeof value === "boolean" ? !value : `${value}-drift`;
      }
      await assert.rejects(
        verifyPostSupportCandidate(identity, {
          ...validVerificationDependencies(),
          readSdkProof: async () => proof,
        }),
        /exact v2SettlementUrl evidence/u,
        `${field}: ${mutation}`,
      );
    }
  }

  for (const [label, mutate] of [
    ["missing top-level slice", (proof) => delete proof.v2SettlementUrl],
    ["private top-level extension", (proof) => {
      proof.v2SettlementUrl.privateQuery = "credential=PRIVATE_SENTINEL";
    }],
    ["schema downgrade", (proof) => { proof.schema = 9; }],
  ]) {
    const proof = validSdkProof();
    mutate(proof);
    await assert.rejects(
      verifyPostSupportCandidate(identity, {
        ...validVerificationDependencies(),
        readSdkProof: async () => proof,
      }),
      label === "private top-level extension"
        ? /exact v2SettlementUrl evidence/u
        : /exact package train/u,
      label,
    );
  }
});

test("candidate verification binds every persistent-interval progression field exactly", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const fields = Object.keys(validSdkProof().v2PersistentIntervalProgression);

  for (const field of fields) {
    for (const mutation of ["delete", "type drift", "value drift"]) {
      const proof = validSdkProof();
      if (mutation === "delete") delete proof.v2PersistentIntervalProgression[field];
      else if (mutation === "type drift") proof.v2PersistentIntervalProgression[field] = 0;
      else {
        const value = proof.v2PersistentIntervalProgression[field];
        proof.v2PersistentIntervalProgression[field] =
          typeof value === "boolean" ? !value : `${value}-drift`;
      }
      await assert.rejects(
        verifyPostSupportCandidate(identity, {
          ...validVerificationDependencies(),
          readSdkProof: async () => proof,
        }),
        /exact v2PersistentIntervalProgression evidence/u,
        `${field}: ${mutation}`,
      );
    }
  }

  for (const [label, mutate] of [
    ["missing top-level slice", (proof) => delete proof.v2PersistentIntervalProgression],
    ["extra field", (proof) => {
      proof.v2PersistentIntervalProgression.unboundProgressionClaim = true;
    }],
  ]) {
    const proof = validSdkProof();
    mutate(proof);
    await assert.rejects(
      verifyPostSupportCandidate(identity, {
        ...validVerificationDependencies(),
        readSdkProof: async () => proof,
      }),
      label === "extra field"
        ? /exact v2PersistentIntervalProgression evidence/u
        : /exact package train/u,
      label,
    );
  }
});

test("candidate verification binds every final cookie-session proof field exactly", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const fields = Object.keys(validSdkProof().v2CookieSession);

  for (const field of fields) {
    for (const mutation of ["delete", "type drift", "value drift"]) {
      const proof = validSdkProof();
      if (mutation === "delete") delete proof.v2CookieSession[field];
      else if (mutation === "type drift") proof.v2CookieSession[field] = 0;
      else {
        const value = proof.v2CookieSession[field];
        proof.v2CookieSession[field] =
          typeof value === "boolean" ? !value : `${value}-drift`;
      }
      await assert.rejects(
        verifyPostSupportCandidate(identity, {
          ...validVerificationDependencies(),
          readSdkProof: async () => proof,
        }),
        /exact v2CookieSession evidence/u,
        `${field}: ${mutation}`,
      );
    }
  }

  const extra = validSdkProof();
  extra.v2CookieSession.unboundCookieClaim = true;
  await assert.rejects(
    verifyPostSupportCandidate(identity, {
      ...validVerificationDependencies(),
      readSdkProof: async () => extra,
    }),
    /exact v2CookieSession evidence/u,
    "extra cookie-session proof field",
  );
});

test("candidate verification binds schema-10 provenance and hashes exactly", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const mutations = [
    ["schema", (proof) => { proof.schema = 9; }],
    ["revision", (proof) => { proof.revision = "0".repeat(40); }],
    ["workflow run", (proof) => { proof.workflowRunId = "999"; }],
    ["workflow attempt", (proof) => { proof.workflowRunAttempt = "2"; }],
    ["source revision", (proof) => { proof.source.stasis_revision = "0".repeat(40); }],
    ["source extension", (proof) => { proof.source.unboundSource = true; }],
    ["tarball name", (proof) => { proof.tarball.name = "detached.tgz"; }],
    ["tarball digest", (proof) => { proof.tarball.sha256 = "0".repeat(64); }],
    ["tarball integrity", (proof) => { proof.tarball.integrity = `sha512-${"B".repeat(86)}==`; }],
    ["tarball extension", (proof) => { proof.tarball.unboundDigest = "0".repeat(64); }],
    ["native digest", (proof) => { proof.nativeBinarySha256 = "0".repeat(64); }],
    ["gate log digest", (proof) => { proof.gateLogSha256 = "0".repeat(63); }],
    ["top-level extension", (proof) => { proof.unboundProof = true; }],
  ];

  for (const [label, mutate] of mutations) {
    const proof = validSdkProof();
    mutate(proof);
    await assert.rejects(
      verifyPostSupportCandidate(identity, {
        ...validVerificationDependencies(),
        readSdkProof: async () => proof,
      }),
      /exact package train/u,
      label,
    );
  }
});

test("candidate verification accepts translated automation time and binds its causal invariants", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const translated = validSdkProof();
  translated.v2AutomationEventTimestamps.initialVirtualTimeNs = "240000000";
  translated.v2AutomationEventTimestamps.advancedVirtualTimeNs = "245000000";
  translated.v2AutomationEventTimestamps.dispatchedVirtualTimeNs = "245000000";
  await verifyPostSupportCandidate(identity, {
    ...validVerificationDependencies(),
    readSdkProof: async () => translated,
  });

  const mutations = [
    ["missing initial", (proof) => delete proof.v2AutomationEventTimestamps.initialVirtualTimeNs],
    ["extra field", (proof) => { proof.v2AutomationEventTimestamps.unboundTimeClaim = "1"; }],
    ["noncanonical initial", (proof) => {
      proof.v2AutomationEventTimestamps.initialVirtualTimeNs = "0180000000";
    }],
    ["wrong delta", (proof) => {
      proof.v2AutomationEventTimestamps.advancedVirtualTimeNs = "186000000";
    }],
    ["dispatch before advance", (proof) => {
      proof.v2AutomationEventTimestamps.dispatchedVirtualTimeNs = "184999999";
    }],
    ["u128 overflow", (proof) => {
      proof.v2AutomationEventTimestamps.initialVirtualTimeNs =
        "340282366920938463463374607431768211456";
    }],
    ["trace drift", (proof) => {
      proof.v2AutomationEventTimestamps.controlledEventCount = "10";
    }],
  ];
  for (const [label, mutate] of mutations) {
    const proof = validSdkProof();
    mutate(proof);
    await assert.rejects(
      verifyPostSupportCandidate(identity, {
        ...validVerificationDependencies(),
        readSdkProof: async () => proof,
      }),
      /exact v2AutomationEventTimestamps evidence/u,
      label,
    );
  }
});

test("candidate verification binds the hosted post-reflow CSS queue-drain proof", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  const translated = validSdkProof();
  translated.v2CssAnimationEventTimestamps.postReflowProcessedRenderingOpportunities = "9";
  await verifyPostSupportCandidate(identity, {
    ...validVerificationDependencies(),
    readSdkProof: async () => translated,
  });

  const mutations = [
    ["missing field", (proof) => {
      delete proof.v2CssAnimationEventTimestamps.postReflowOutcome;
    }],
    ["extra field", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowUnboundClaim = true;
    }],
    ["work did not settle", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowOutcome = "pending";
    }],
    ["wrong virtual time", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowVirtualTimeNs = "50000000";
    }],
    ["wrong trace", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowTrace =
        "armed:20|animationstart:trusted:70:70";
    }],
    ["wrong event count", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowEventCount = "1";
    }],
    ["wrong event kinds", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowEventKinds = "animationstart";
    }],
    ["runtime failure", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowRuntimeFailures = "1";
    }],
    ["unsupported work", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowUnsupportedWork = "1";
    }],
    ["external I/O", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowExternalIo = "1";
    }],
    ["queue did not drain", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowPendingAnimationEvents = "1";
    }],
    ["retained another opportunity", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowNextOpportunityNs = "90000000";
    }],
    ["zero rendering opportunities", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowProcessedRenderingOpportunities = "0";
    }],
    ["noncanonical rendering opportunities", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowProcessedRenderingOpportunities = "02";
    }],
    ["numeric rendering opportunities", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowProcessedRenderingOpportunities = 4;
    }],
    ["state token changed", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowStateTokenPreserved = false;
    }],
    ["queue drain not owned", (proof) => {
      proof.v2CssAnimationEventTimestamps.postReflowOwnedQueueDrain = false;
    }],
  ];
  for (const [label, mutate] of mutations) {
    const proof = validSdkProof();
    mutate(proof);
    await assert.rejects(
      verifyPostSupportCandidate(identity, {
        ...validVerificationDependencies(),
        readSdkProof: async () => proof,
      }),
      /exact v2CssAnimationEventTimestamps evidence/u,
      label,
    );
  }
});

test("candidate verification never imports candidate JavaScript before passive archive admission", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  for (const [label, mutate] of [
    ["archive hash", (dependencies) => {
      dependencies.hashFile = async (filePath) =>
        filePath.endsWith(".tgz") ? "0".repeat(64) : validHashForPath(filePath);
    }],
    ["archive binding", (dependencies) => {
      dependencies.verifySdkArchive = async () => {
        throw new Error("detached SDK archive");
      };
    }],
    ["proof bytes", (dependencies) => {
      dependencies.hashFile = async (filePath) =>
        filePath.endsWith(".json") ? "0".repeat(64) : validHashForPath(filePath);
    }],
  ]) {
    const dependencies = validVerificationDependencies();
    let distributionImports = 0;
    let sdkImports = 0;
    dependencies.loadDistributionManifest = async () => {
      distributionImports += 1;
      throw new Error("candidate distribution code executed");
    };
    dependencies.loadSdk = async () => {
      sdkImports += 1;
      throw new Error("candidate SDK code executed");
    };
    mutate(dependencies);
    await assert.rejects(
      verifyPostSupportCandidate(identity, dependencies),
      /mismatch|detached SDK archive/u,
      label,
    );
    assert.equal(distributionImports, 0, `${label}: distribution manifest import`);
    assert.equal(sdkImports, 0, `${label}: SDK import`);
  }
});

test("candidate verification materializes only after SDK admission and disposes every failed extraction", async () => {
  const identity = createPostSupportCandidateSpec(validInput());
  let windowsCalls = 0;
  const sdkFailure = validVerificationDependencies();
  sdkFailure.verifyWindowsArchive = async () => {
    windowsCalls += 1;
    throw new Error("Windows materialization must not run");
  };
  sdkFailure.verifySdkArchive = async () => {
    throw new Error("SDK archive rejected");
  };
  await assert.rejects(verifyPostSupportCandidate(identity, sdkFailure), /SDK archive rejected/u);
  assert.equal(windowsCalls, 0);

  const failures = [
    ["distribution", (dependencies) => {
      dependencies.loadDistributionManifest = async () => {
        throw new Error("distribution rejected");
      };
    }],
    ["hosted proof", (dependencies) => {
      dependencies.readSdkProof = async () => ({ ...validSdkProof(), workflowRunId: "999" });
    }],
    ["SDK import", (dependencies) => {
      dependencies.loadSdk = async () => {
        throw new Error("SDK import rejected");
      };
    }],
    ["runtime inspection", (dependencies) => {
      dependencies.inspectRuntime = async () => {
        throw new Error("runtime inspection rejected");
      };
    }],
  ];
  for (const [label, mutate] of failures) {
    const dependencies = validVerificationDependencies();
    let disposeCount = 0;
    let sdkDisposeCount = 0;
    dependencies.verifySdkArchive = async () => ({
      packageRoot: path.resolve("C:\\verifier-owned-sdk\\package"),
      async dispose() { sdkDisposeCount += 1; },
    });
    dependencies.verifyWindowsArchive = async () => ({
      executablePath: path.resolve("C:\\verifier-owned\\stasis.exe"),
      async dispose() { disposeCount += 1; },
    });
    mutate(dependencies);
    await assert.rejects(
      verifyPostSupportCandidate(identity, dependencies),
      /rejected|exact package train/u,
      label,
    );
    assert.equal(disposeCount, 1, label);
    assert.equal(sdkDisposeCount, 1, `${label}: SDK extraction`);
  }

  const success = validVerificationDependencies();
  let successDisposals = 0;
  let successSdkDisposals = 0;
  success.verifySdkArchive = async () => ({
    packageRoot: path.resolve("C:\\verifier-owned-sdk\\package"),
    async dispose() { successSdkDisposals += 1; },
  });
  success.verifyWindowsArchive = async () => ({
    executablePath: path.resolve("C:\\verifier-owned\\stasis.exe"),
    async dispose() { successDisposals += 1; },
  });
  const verified = await verifyPostSupportCandidate(identity, success);
  assert.equal(successDisposals, 0);
  await disposePostSupportCandidate(verified);
  await disposePostSupportCandidate(verified);
  assert.equal(successDisposals, 1);
  assert.equal(successSdkDisposals, 1);
});

function validInput() {
  return {
    packageRunId: "33506181780",
    packageRunAttempt: "1",
    revision: postSupportRevision,
    windowsZipPath: "C:\\private\\stasis-0.3.3-windows-x86_64-ci.zip",
    windowsZipSha256: hashes.zip,
    windowsZipBytes: "10",
    executablePath: "C:\\private\\stasis.exe",
    executableSha256: hashes.executable,
    executableBytes: "20",
    sdkArchivePath: "C:\\private\\oxhq-stasis-0.3.3.tgz",
    sdkArchiveSha256: hashes.archive,
    sdkArchiveBytes: "30",
    sdkProofPath: "C:\\private\\stasis-0.3.3-typescript-act-settle-inspect.json",
    sdkProofSha256: hashes.proof,
    sdkProofBytes: "50",
    sdkPackageRoot: "C:\\private\\oxhq-stasis-0.3.3\\package",
    sdkTreeSha256: hashes.tree,
    sdkTreeFileCount: "5",
    sdkTreeBytes: "40",
  };
}

function validVerificationDependencies() {
  return {
    platform: "win32",
    architecture: "x64",
    nodeVersion: "v22.20.0",
    inspectFile: async (filePath) => ({
      size: filePath.endsWith(".zip") ? 10 : filePath.endsWith(".exe") ? 20 : filePath.endsWith(".json") ? 50 : 30,
    }),
    inspectDirectory: async (directoryPath) => directoryPath,
    hashFile: async (filePath) =>
      filePath.endsWith(".zip")
        ? hashes.zip
        : filePath.endsWith(".exe")
          ? hashes.executable
          : filePath.endsWith(".json")
            ? hashes.proof
            : hashes.archive,
    hashTree: async () => ({ sha256: hashes.tree, fileCount: 5, totalBytes: 40 }),
    hashArchiveIntegrity: async () => archiveIntegrity,
    readManifest: async () => ({ name: "@oxhq/stasis", version: "0.3.3" }),
    loadDistributionManifest: async () => validDistributionManifest(),
    readSdkProof: async () => validSdkProof(),
    verifyWindowsArchive: async () => ({ fileCount: 21 }),
    verifySdkArchive: async () => ({ fileCount: 5 }),
    loadSdk: async () => ({
      launch() {},
      crawlWithStasis() {},
      createStasisSessionPool() {},
      CONTROLLED_WEB_SESSION_V2_PROFILE: postSupportProfile,
    }),
    inspectRuntime: async () => ({
      implementationName: "stasis-shell",
      implementationVersion: "0.3.3",
      stasisRevision: postSupportRevision,
      v2ProfileAdvertised: true,
    }),
  };
}

function validHashForPath(filePath) {
  return filePath.endsWith(".zip")
    ? hashes.zip
    : filePath.endsWith(".exe")
      ? hashes.executable
      : filePath.endsWith(".json")
        ? hashes.proof
        : hashes.archive;
}

function validDistributionManifest() {
  const archiveFiles = [
    "INSTALL.txt",
    "LICENSE",
    "LICENSE_WHATWG_SPECS",
    "NATIVE-LIBRARIES.txt",
    "README.md",
    "SOURCE.txt",
    "STASIS_UPSTREAM.toml",
    "THIRD_PARTY_LICENSES.html",
    "VERSION.txt",
    "controlled-web-session-v2.json",
    "session-v0.3-candidate.md",
    "stasis",
  ];
  const artifact = (nodePlatform, nodeArch, releasePlatform, digest) => ({
    nodePlatform,
    nodeArch,
    releasePlatform,
    archiveUrl:
      `https://github.com/oxhq/stasis/releases/download/v0.3.3/stasis-0.3.3-${releasePlatform}.tar.gz`,
    archiveSizeBytes: 1,
    archiveSha256: "9".repeat(64),
    archiveRoot: `stasis-0.3.3-${releasePlatform}`,
    archiveFiles,
    executablePath: "stasis",
    executableSha256: digest,
  });
  return {
    schema: 1,
    packageName: "@oxhq/stasis",
    sdkVersion: "0.3.3",
    releaseTag: "v0.3.3",
    implementation: { name: "stasis-shell", source: { stasis_revision: postSupportRevision } },
    artifacts: {
      "darwin-arm64": artifact("darwin", "arm64", "macos-aarch64", "6".repeat(64)),
      "linux-x64": artifact("linux", "x64", "linux-x86_64", "8".repeat(64)),
    },
  };
}

function validSdkProof() {
  return {
    schema: 10,
    gate: "sdk-act-settle-inspect",
    package: "@oxhq/stasis@0.3.3",
    revision: postSupportRevision,
    workflowRunId: "33506181780",
    workflowRunAttempt: "1",
    source: { stasis_revision: postSupportRevision },
    tarball: {
      name: "oxhq-stasis-0.3.3.tgz",
      sha256: hashes.archive,
      integrity: archiveIntegrity,
    },
    nativeBinarySha256: "6".repeat(64),
    gateLogSha256: "7".repeat(64),
    v2MessageChannel: {
      aggregateProcessedOrdinaryTasks: "16",
      bufferActionRotatedStateToken: true,
      closeResponseAndEof: true,
      drainedMessagePortSources: "0",
      drainedOutcome: "quiescent",
      drainedRuntimeFailures: "0",
      evidenceProfile: postSupportProfile,
      exactBinaryLaunch: true,
      idleMessagePortSources: "0",
      idleOutcome: "quiescent",
      idleRuntimeFailures: "0",
      pendingMessagePortSources: "1",
      pendingPreservedBufferedStateToken: true,
      pendingRuntimeFailures: "0",
      profile: postSupportProfile,
      startActionRotatedStateToken: true,
      trace: "callback1>microtask1>callback2>microtask2",
      unsupportedWork: "0",
    },
    v2DirectDataSvg: {
      closeResponseAndEof: true,
      completionTrace: "load:0>loadend:0|now:0",
      evidenceProfile: postSupportProfile,
      exactBinaryLaunch: true,
      externalIo: "0",
      httpCompletionTrace:
        "loaded:load:0>loadend:0|failed:error:0>loadend:0|cached:load:0|now:0",
      httpEvidenceProfile: postSupportProfile,
      httpExternalIo: "0",
      httpNavigationBoundary: "controlled_ready",
      httpOutcome: "quiescent",
      httpPendingImages: "0",
      httpProducerPending: "0",
      httpProducerTerminal: false,
      httpRuntimeFailures: "0",
      httpUnsupportedWork: "0",
      navigationBoundary: "controlled_ready",
      outcome: "quiescent",
      pendingImages: "0",
      producerPending: "0",
      producerTerminal: false,
      profile: postSupportProfile,
      runtimeFailures: "0",
      sameControlledSession: true,
      unsupportedWork: "0",
    },
    v2SettlementUrl: {
      closeResponseAndEof: true,
      controlledOpenUrl: "https://packed-sdk-message-channel-v2.example.test/",
      exactBinaryLaunch: true,
      historyOutcome: "quiescent",
      historyUrl:
        "https://packed-sdk-settlement-url-v2.example.test/settlement-url/pushed?proof=history#attested",
      initialOutcome: "quiescent",
      initialUrl:
        "https://packed-sdk-settlement-url-v2.example.test/settlement-url/replaced?proof=initial#attested",
      navigationBoundary: "controlled_ready",
      profile: postSupportProfile,
      replacementOutcome: "quiescent",
      replacementTrace: "replaced",
      replacementUrl:
        "https://packed-sdk-settlement-url-v2.example.test/settlement-url/final?proof=replacement#attested",
      sessionEvidenceExcludesUrl: true,
      sessionUrlStayedAtControlledOpen: true,
      standaloneEvidenceExcludesUrl: true,
      unsupportedFailureCode: "unsupported_clock_surface",
      unsupportedOutcome: "unsupported_work",
      unsupportedUrl: "https://packed-sdk-automation-event-timestamps-v2.example.test/",
    },
    v2PersistentIntervalProgression: {
      closeResponseAndEof: true,
      documentElapsedTimeNs: "12000000000",
      evidenceProfile: postSupportProfile,
      exactBinaryLaunch: true,
      externalIo: "0",
      futureFinite: "0",
      implicitFutureFinite: "0",
      implicitPersistentTimers: "1",
      implicitTrace: "interval:1@5000|interval:2@10000|finite@12000",
      implicitVirtualTimeNs: "12260000000",
      navigationBoundary: "controlled_ready",
      persistentCount: "1",
      persistentKind: "timer",
      persistentReason: "interval",
      persistentTimers: "1",
      profile: postSupportProfile,
      reportOutcome: "quiescent_with_persistent_work",
      reportTrace: "interval:1@5000|interval:2@10000|finite@12000",
      reportVirtualTimeNs: "12260000000",
      requestedPeriodNs: "5000000000",
      runtimeFailures: "0",
      sameControlledSession: true,
      sessionBaselineVirtualTimeNs: "260000000",
      strictOutcome: "blocked_on_open_ended_work",
      strictTrace: "interval:1@5000|interval:2@10000|finite@12000",
      strictVirtualTimeNs: "12260000000",
      unsupportedWork: "0",
    },
    v2InlineSvgRendering: {
      closeResponseAndEof: true,
      domCompletionEvents: "0",
      evidenceProfile: postSupportProfile,
      exactBinaryLaunch: true,
      externalIo: "0",
      fixtureTrace: "inline-svg:4x3|events:0|now:0",
      navigationBoundary: "controlled_ready",
      outcome: "quiescent",
      pendingImages: "0",
      producerPending: "0",
      producerTerminal: false,
      profile: postSupportProfile,
      runtimeFailures: "0",
      sameControlledSession: true,
      sharedEvidenceProfile: postSupportProfile,
      sharedExternalIo: "0",
      sharedFixtureTrace: "shared-inline-svg:12|now:0",
      sharedNavigationBoundary: "controlled_ready",
      sharedOutcome: "quiescent",
      sharedPendingImages: "0",
      sharedProducerPending: "0",
      sharedProducerTerminal: false,
      sharedRuntimeFailures: "0",
      sharedUnsupportedWork: "0",
      unsupportedWork: "0",
    },
    v2InputMethodFocus: {
      closeResponseAndEof: true,
      completionTrace: "blurred|4|focus:trusted:0>focusin:trusted:0>blur:trusted:0>focusout:trusted:0|rwa-value|2:5",
      evidenceProfile: postSupportProfile,
      exactBinaryLaunch: true,
      externalIo: "0",
      navigationBoundary: "controlled_ready",
      outcome: "quiescent",
      producerPending: "0",
      producerTerminal: false,
      profile: postSupportProfile,
      runtimeFailures: "0",
      sameControlledSession: true,
      unsupportedWork: "0",
    },
    v2AutomationEventTimestamps: {
      advancedVirtualTimeNs: "12285000000",
      browserEventCountAfterScriptProbe: "12",
      closeResponseAndEof: true,
      controlledEventCount: "11",
      controlledTrace: "25|fill:input:25>activate:click:25>reset:reset:25>check:click:25>check:input:25>check:change:25>select:input:25>select:change:25>invalid:invalid:25>submit:submit:25>submit:formdata:25|not-read|20",
      dispatchedVirtualTimeNs: "12285000000",
      evidenceProfile: postSupportProfile,
      exactBinaryLaunch: true,
      failureCode: "unsupported_clock_surface",
      initialOutcome: "quiescent",
      initialVirtualTimeNs: "12280000000",
      navigationBoundary: "controlled_ready",
      profile: postSupportProfile,
      rejectedOutcome: "unsupported_work",
      sameControlledSession: true,
      scriptCreatedConstructorCount: "5",
      scriptCreatedTrace: "0,0,0,0,0",
      unsupportedCount: "1",
      unsupportedKind: "other",
      unsupportedReason: "time_surface",
      unsupportedTimeSurface: "host_timestamp",
    },
    v2CssAnimationEventTimestamps: {
      closeResponseAndEof: true,
      controlledDispatchTimeCount: "1",
      controlledEventCount: "2",
      controlledEventKinds: "animationend,animationstart",
      controlledExternalIo: "0",
      controlledOutcome: "quiescent",
      controlledOwnedEventCount: "2",
      controlledRuntimeFailures: "0",
      controlledUnsupportedWork: "0",
      evidenceProfile: postSupportProfile,
      exactBinaryLaunch: true,
      failureCode: "unsupported_clock_surface",
      finiteAnimations: "0",
      freshExactBinaryProcess: true,
      infiniteAnimations: "0",
      initialOutcome: "quiescent",
      managedRuntimeFallbackAccesses: "0",
      pendingAnimationEvents: "0",
      processedRenderingOpportunities: "2",
      producerPending: "0",
      producerTerminal: false,
      profile: postSupportProfile,
      publicNonAuxiliaryControlledTarget: true,
      postReflowEventCount: "2",
      postReflowEventKinds: "animationcancel,animationstart",
      postReflowExternalIo: "0",
      postReflowNextOpportunityNs: "none",
      postReflowOutcome: "quiescent",
      postReflowOwnedQueueDrain: true,
      postReflowPendingAnimationEvents: "0",
      postReflowProcessedRenderingOpportunities: "5",
      postReflowRuntimeFailures: "0",
      postReflowStateTokenPreserved: true,
      postReflowTrace:
        "armed:20|animationstart:trusted:70:70>animationcancel:trusted:90:90",
      postReflowUnsupportedWork: "0",
      postReflowVirtualTimeNs: "90000000",
      rejectedOutcome: "unsupported_work",
      sameControlledSession: true,
      scriptCreatedConstructorCount: "2",
      scriptCreatedTrace: "script:0,0",
      settledVirtualTimeNs: "5000000",
      unsupportedAnimations: "0",
      unsupportedCount: "1",
      unsupportedKind: "other",
      unsupportedReason: "time_surface",
      unsupportedTimeSurface: "host_timestamp",
    },
    v2CookieSession: {
      profile: postSupportProfile,
      stateSchemaVersion: "1",
      stateProfile: postSupportProfile,
      responseCookieName: "remember_me",
      responseCookieExpiryUnixTimeNs: "2592000000000000",
      maxAgePrecedenceOverPastExpires: true,
      restoredSameSiteCookieSent: true,
      crossSiteResourceReachedServer: true,
      crossSiteLaxCookieFiltered: true,
      crossSiteRequestMethod: "GET",
      crossSiteRequestPath: "/probe.js",
      evidenceProfile: postSupportProfile,
      memoryOnlyExplicitStatePortability: true,
      noImportControlCookieCount: "0",
      noImportControlRequestCookieHeaderEmpty: true,
      noImportControlSameHostContext: true,
      cookieTimeRangeFailureCode: "unsupported_cookie_time_range",
      cookieTimeRangeFatal: false,
      cookieTimeRangeStateEffect: "partial",
      cookieTimeRangeRequestReachedServer: false,
      credentialEnvironmentMode: "explicit_allowlist",
      freshExactBinaryProcesses: "4",
      gracefulCookieSessionProcesses: "4",
      managedRuntimeFallbackAccesses: "0",
      exactBinaryLaunch: true,
      closeResponseAndEof: true,
    },
  };
}
