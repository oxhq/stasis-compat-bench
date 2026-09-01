export function rwaReportMarkdown(comparison) {
  const counts = Object.entries(comparison.counts)
    .map(([classification, count]) => `- ${classification}: ${count}`)
    .join("\n");
  const rows = comparison.cases
    .map((entry) => {
      const surface = entry.candidate?.typedSurface ?? "";
      const terminal = [entry.candidate?.phase, entry.candidate?.code].filter(Boolean).join(" / ");
      return `| ${entry.ordinal} | ${escapeCell(entry.title)} | ${entry.baseline?.state ?? "invalid"} | ${entry.classification} | ${escapeCell(surface)} | ${escapeCell(terminal)} |`;
    })
    .join("\n");
  const blocker = comparison.sharedBlocker === null
    ? "No candidate-wide blocker was detected."
    : `All affected cases share \`${comparison.sharedBlocker.code}\` during \`${comparison.sharedBlocker.phase}\` (${comparison.sharedBlocker.classification}, surface \`${comparison.sharedBlocker.typedSurface}\`).`;
  return `# RWA authentication compatibility proof

Protocol: \`${comparison.protocol}\`

This report compares the unchanged eight-case Cypress authentication slice with
the external Stasis intent adapter. It makes no Cypress-API-compatibility or
performance claim.

## Result

- Frozen denominator: ${comparison.denominator} cases
- Baseline valid: ${comparison.baselineValid}
- Candidate artifact valid: ${comparison.candidateValid}
- Exact equivalent rate: ${(comparison.exactEquivalentRate * 100).toFixed(1)}%
- Equivalent-or-disclosed supported rate: ${(comparison.behaviorallySupportedRate * 100).toFixed(1)}%
${counts}

${blocker}

| # | Upstream case | Cypress | Stasis classification | Surface | Terminal |
| ---: | --- | --- | --- | --- | --- |
${rows}

## Interpretation boundary

A completed proof does not require compatibility to pass. A case that terminates
before its oracle remains in the denominator and cannot be upgraded through an
application edit, retry, browser fallback, sleep, or business-API shortcut.

## Performance boundary

Raw wall times are retained only as diagnostics. They are not comparable
execution units and produce no performance claim.
`;
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}
