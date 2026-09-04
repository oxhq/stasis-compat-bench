export function finalReportMarkdown({ manifest, crawl, rwa, postflight }) {
  const crawlCounts = formatCounts(crawl.counts);
  const rwaCounts = formatCounts(rwa.counts);
  const blocker = formatSharedBlocker(rwa.sharedBlocker);
  const controls = formatNegativeControls(crawl.negativeControls);
  const crawlVerdict = formatTrackVerdict(crawl, "crawl", "pages");
  const rwaVerdict = formatTrackVerdict(rwa, "RWA authentication", "cases");
  return `# stasis-compat-bench-v1 — retained proof

## Verdict

${crawlVerdict}

${rwaVerdict}

This is a compatibility result, not a speed result.

## Frozen identity

- Harness revision: \`${manifest.harness.revision}\`
- Stasis source tree: \`${manifest.stasis.sourceTree}\`
- Windows executable SHA-256: \`${manifest.stasis.executableSha256}\`
- Windows archive SHA-256: \`${manifest.stasis.archiveSha256}\`
- RWA revision: \`${manifest.rwa.revision}\`
- RWA production build tree SHA-256: \`${manifest.rwa.buildTree.sha256}\`
- Node/npm: \`${manifest.environment.node}\` / \`${manifest.environment.npm}\`

## Track A — unchanged RWA auth

- Cypress baseline valid: ${rwa.baselineValid}
- Candidate artifact valid: ${rwa.candidateValid}
- Frozen denominator: ${rwa.denominator} cases
- Exact equivalent rate: ${formatRate(rwa.exactEquivalentRate)}
- Equivalent-or-disclosed supported rate: ${formatRate(rwa.behaviorallySupportedRate)}
${rwaCounts}

${blocker}

The denominator was not reduced. No RWA source/config/test/seed edit, retry,
sleep, page-script injection, business-API substitution, or Chromium fallback
was used.

## Track B — deterministic crawl

- Crawlee/Playwright baseline valid: ${crawl.baselineValid}
- Candidate artifact valid: ${crawl.candidateValid}
- Frozen denominator: ${crawl.primaryDenominator} pages
- Exact equivalent rate: ${formatRate(crawl.exactEquivalentRate)}
- Equivalent-or-disclosed supported rate: ${formatRate(crawl.behaviorallySupportedRate)}
- Scheduled URL-set Jaccard: ${formatDecimal(crawl.scheduledUrlJaccard, 4)}
${crawlCounts}

### Declared negative controls

${controls}

Negative controls remain outside the positive denominator and retain the
classifications produced by the comparison.

## No-modification and postflight proof

- Upstream RWA tracked checkout restored clean: ${postflight.rwa.clean}
- Upstream RWA revision/tree still frozen: ${allTrue(
    postflight.rwa.revisionMatches,
    postflight.rwa.revisionMatchesManifest,
    postflight.rwa.revisionMatchesFrozen,
  ) && allTrue(
    postflight.rwa.treeMatches,
    postflight.rwa.treeMatchesManifest,
    postflight.rwa.treeMatchesFrozen,
  )}
- Upstream RWA build tree still frozen: ${allTrue(
    postflight.rwa.buildTreeMatchesManifest,
    postflight.rwa.buildTreeMatchesFrozen,
  )}
- Upstream RWA/Cypress execution inputs still frozen (full tree; runtime cache empty): ${allTrue(
    postflight.rwa.installed?.nodeModulesTreeMatchesManifest,
    postflight.rwa.installed?.nodeModulesTreeMatchesFrozen,
    postflight.rwa.installed?.cypressPackageTreeMatchesManifest,
    postflight.rwa.installed?.cypressPackageTreeMatchesFrozen,
    postflight.rwa.installed?.tsNodePackageTreeMatchesManifest,
    postflight.rwa.installed?.tsNodePackageTreeMatchesFrozen,
    postflight.rwa.installed?.cypressRuntimeTreeMatchesManifest,
    postflight.rwa.installed?.cypressRuntimeTreeMatchesFrozen,
    postflight.rwa.installed?.cypressExecutableMatchesManifest,
    postflight.rwa.installed?.cypressExecutableMatchesFrozen,
    postflight.rwa.generatedRuntimeFilesMatchManifest,
    postflight.rwa.generatedRuntimeFilesMatchFrozen,
    postflight.rwa.runtimeCacheMatchesManifest,
    postflight.rwa.runtimeCacheMatchesFrozen,
    postflight.rwa.localEnvironmentFilesMatchManifest,
    postflight.rwa.localEnvironmentFilesMatchFrozen,
    postflight.rwa.ambientOverridesMatchManifest,
    postflight.rwa.ambientOverridesMatchFrozen,
  )}
- Harness tracked tree unchanged after execution: ${postflight.harness.trackedClean}
- Candidate source tree still frozen: ${allTrue(
    postflight.stasis.sourceTreeMatches,
    postflight.stasis.sourceTreeMatchesManifest,
    postflight.stasis.sourceTreeMatchesFrozen,
  )}
- Candidate executable still frozen: ${allTrue(
    postflight.stasis.executableSha256Matches,
    postflight.stasis.executableSha256MatchesManifest,
    postflight.stasis.executableSha256MatchesFrozen,
  )}
- Candidate archive still frozen: ${allTrue(
    postflight.stasis.archive?.sha256MatchesManifest,
    postflight.stasis.archive?.sha256MatchesFrozen,
  )}
- Installed JavaScript trees still frozen: ${allTrue(
    postflight.installed?.nodeModulesTreeMatchesManifest,
    postflight.installed?.nodeModulesTreeMatchesFrozen,
    postflight.installed?.packageTreesMatchManifest,
    postflight.installed?.packageTreesMatchFrozen,
  )}
- Node executable bytes still frozen: ${allTrue(
    postflight.nodeRuntime?.pathMatchesManifest,
    postflight.nodeRuntime?.bytesMatchManifest,
    postflight.nodeRuntime?.bytesMatchFrozen,
    postflight.nodeRuntime?.sha256MatchesManifest,
    postflight.nodeRuntime?.sha256MatchesFrozen,
  )}
- Playwright Chromium bytes/version still frozen: ${allTrue(
    postflight.browser?.revisionMatchesManifest,
    postflight.browser?.revisionMatchesFrozen,
    postflight.browser?.versionMatchesManifest,
    postflight.browser?.versionMatchesFrozen,
    postflight.browser?.executableMatchesManifest,
    postflight.browser?.executableMatchesFrozen,
    postflight.browser?.installTreeMatchesManifest,
    postflight.browser?.installTreeMatchesFrozen,
  )}
- RWA servers stopped before finalization: ${postflight.rwa.serversStopped}

The upstream server's documented lowdb newline mutation was restored to the
pinned Git bytes after shutdown.

## Evidence map

- \`manifest.json\`: identities, environment, build/browser hashes, zero-retry rules
- \`rwa/cypress-raw.json\`: safe structured baseline result
- \`rwa/stasis-raw.json\`: Stasis attempts and typed terminals
- \`rwa/build-tree-guard.json\`: RWA production-build hashes between and after lanes
- \`rwa/compatibility.json\` and \`rwa/report.md\`: RWA comparison
- \`crawlee/*-raw.json\`, \`crawlee/compatibility.json\`, and \`crawlee/report.md\`: crawl comparison
- \`postflight.json\`: clean-tree and stopped-server checks
- \`artifact-index.json\`: SHA-256 index of every other retained proof file

## Performance boundary

Wall times are diagnostic only. Browser pages and fresh native Stasis processes
are different execution units, and this protocol emits no performance claim.
`;
}

function formatTrackVerdict(comparison, label, units) {
  const denominator = finiteNumber(comparison?.denominator ?? comparison?.primaryDenominator);
  if (comparison?.baselineValid !== true) {
    return `The ${label} track is benchmark-invalid because its frozen baseline did not validate.`;
  }
  if (comparison?.candidateValid === false) {
    return `The ${label} track is benchmark-invalid because its candidate artifact did not validate.`;
  }
  const exact = finiteNumber(comparison?.exactEquivalentRate);
  const supported = finiteNumber(comparison?.behaviorallySupportedRate);
  const exactCount = finiteNumber(comparison?.counts?.PASS_EQUIVALENT);
  const supportedCount = exactCount + finiteNumber(
    comparison?.counts?.PASS_WITH_SEMANTIC_DIFFERENCE,
  );
  if (denominator > 0 && exact === 1 && exactCount === denominator) {
    return `The frozen candidate is exactly outcome-equivalent on the ${label} track (${exactCount}/${denominator} ${units}).`;
  }
  if (denominator > 0 && supported === 1 && supportedCount === denominator) {
    return `The frozen candidate is behaviorally supported on the ${label} track (${supportedCount}/${denominator} ${units}), with ${exactCount}/${denominator} exactly equivalent.`;
  }
  return `The frozen candidate is not behaviorally equivalent on the ${label} track: ${exactCount}/${denominator} ${units} are exactly equivalent and ${supportedCount}/${denominator} are equivalent or carry a disclosed semantic difference.`;
}

function formatSharedBlocker(sharedBlocker) {
  if (sharedBlocker === null || sharedBlocker === undefined) {
    return "No candidate-wide RWA blocker was detected.";
  }
  const affectedCases = Array.isArray(sharedBlocker.affectedCases)
    ? sharedBlocker.affectedCases.join(", ")
    : "not reported";
  return `The RWA lane has one shared blocker: \`${sharedBlocker.code}\` during \`${sharedBlocker.phase}\` (${sharedBlocker.classification}, surface \`${sharedBlocker.typedSurface}\`), affecting cases ${affectedCases}.`;
}

function formatNegativeControls(controls) {
  if (!Array.isArray(controls) || controls.length === 0) {
    return "No negative-control comparison entries were retained.";
  }
  return controls
    .map((control) => {
      const surface = control.expectedSurface === undefined
        ? ""
        : `; expected surface \`${control.expectedSurface}\``;
      return `- \`${control.id}\`: ${control.classification}${surface}`;
    })
    .join("\n");
}

function formatCounts(counts) {
  const entries = Object.entries(counts ?? {});
  if (entries.length === 0) return "- No classifications retained";
  return entries
    .map(([classification, count]) => `- ${classification}: ${count}`)
    .join("\n");
}

function formatRate(value) {
  return `${(finiteNumber(value) * 100).toFixed(1)}%`;
}

function formatDecimal(value, digits) {
  return finiteNumber(value).toFixed(digits);
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function allTrue(...values) {
  const retained = values.filter((value) => value !== undefined);
  return retained.length > 0 && retained.every((value) => value === true);
}
