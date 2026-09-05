import { jsonReplacer } from "../shared/io.mjs";

const sensitiveKeyPattern = /(?:api[_-]?key|auth(?:data|header|jar|material|payload|state|string|value|values)?|authorization(?:data|header|jar|material|payload|state|string|value|values)?|cookie(?:data|header|jar|material|payload|state|string|value|values)?|credential(?:data|header|jar|material|payload|state|string|value|values)?|password(?:data|header|jar|material|payload|state|string|value|values)?|privatekey|proxyauthorization|rawheaders|secret(?:data|header|jar|material|payload|state|string|value|values)?|session(?:data|state|statetoken)|setcookie|statetoken|token(?:data|header|jar|material|payload|state|string|value|values)?)$/iu;
const forbiddenExactKeys = new Set([
  "auth",
  "authorizationvalue",
  "authorizationvalues",
  "cookie",
  "credentials",
  "credentialvalue",
  "credentialvalues",
  "executablepath",
  "header",
  "headername",
  "headervalue",
  "headervalues",
  "headers",
  "passwordvalue",
  "passwordvalues",
  "passwords",
  "requestheaders",
  "responseheaders",
  "sdkarchivepath",
  "sdkpackageroot",
  "secretvalue",
  "secretvalues",
  "secrets",
  "state",
  "stateblob",
  "tokenvalue",
  "tokenvalues",
  "tokens",
  "windowszippath",
]);
const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "cookie2",
  "proxyauthorization",
  "setcookie",
  "setcookie2",
  "xapikey",
]);
const sensitiveHeaderNamePattern = /(?:api(?:key|token)|auth|authorization|cookie|credential|password|privatekey|secret|session|token)$/u;
const maximumDecodeLayers = 8;
const maximumEmbeddedBase64Candidates = 32;
const maximumEmbeddedBase64TokenLength = 16_384;
const maximumPublicSourcePatchBytes = 1_048_576;
const maximumPublicSourcePatchLines = 100_000;
const maximumPublicSourcePatchLineBytes = 16_384;
const maximumPublicSourceEncodedCandidates = 20_000;
const publicSourceCredentialPatterns = Object.freeze([
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/iu,
  /\bnpm_[A-Za-z0-9]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{35}\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/u,
  /\b(?:authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{4,}/iu,
  /\b(?:password|api[-_. ]?key|access[-_. ]?token|refresh[-_. ]?token|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/iu,
  /\b(?:cookie|set-cookie)\s*[:=]\s*["']?[^\s"']{8,}/iu,
  /(?:^|\s)_authToken\s*=\s*["']?[^$\s"'{}<>]{8,}/imu,
  /[?&](?:code|token|secret|password|api[-_. ]?key|access[-_. ]?token|refresh[-_. ]?token)=[^\s&#"']{4,}/iu,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{16,}/iu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
]);
const publicSourcePrivateTaskPathPatterns = Object.freeze([
  /\bE:[\\/]+stasis(?:[\\/]|\b)/iu,
  /\bC:[\\/]+Users[\\/]+garae(?:[\\/]|\b)/iu,
  /\/(?:Users|home)\/garae(?:\/|\b)/iu,
]);
const frozenRwaRouteNarratives = new Set([
  "record POST /login and navigation diagnostics",
  "record POST /login status and navigation diagnostics",
  "POST /users and sign-in form ready",
  "record /users, /login, /graphql, /logout, and navigation diagnostics",
  "record POST /login",
]);
const frozenRwaSemanticRouteNarratives = new Map([
  [
    "graphql-operation-name-redacted:baseline",
    "Cypress aliases the /graphql request by reading request.body.operationName.",
  ],
  [
    "graphql-operation-name-redacted:treatment",
    "Correlate POST /graphql status with the exact Finished UI and persisted bank-account oracle.",
  ],
  [
    "unused-intercept-has-no-oracle:baseline",
    "The signup-error case installs an unaliased GET /signup intercept without waiting on or asserting it.",
  ],
]);

export function serializePostSupportArtifact(value) {
  const snapshot = privacySnapshot(value, [], new WeakSet());
  const json = JSON.stringify(snapshot, jsonReplacer, 2);
  if (typeof json !== "string") throw new TypeError("Post-support artifact is not serializable");
  const projected = JSON.parse(json);
  privacySnapshot(projected, [], new WeakSet());
  return `${json}\n`;
}

export function assertPostSupportArtifactPrivacy(value) {
  privacySnapshot(value, [], new WeakSet());
  return value;
}

export function assertPostSupportArtifactHtmlPrivacy(value) {
  if (typeof value !== "string") {
    throw new TypeError("Post-support HTML privacy input must be a string");
  }
  const withoutMarkupSlashes = value
    .replace(/<\/(?=[a-z][a-z0-9:-]*(?:\s|>))/giu, "<")
    .replace(/\/(?=\s*>)/gu, "");
  assertSafeString(withoutMarkupSlashes, ["controlledPublicDocumentHtml"]);
  return value;
}

export function assertPostSupportPublicSourcePatchPrivacy(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") ||
    Buffer.byteLength(value, "utf8") > maximumPublicSourcePatchBytes) {
    throw new TypeError("Post-support public source patch is outside its byte bound");
  }
  assertPublicSourceSensitiveProjections(value, ["publicGitHubSourcePatch"]);
  for (const decoded of decodedPublicSourceBase64Candidates(value)) {
    assertPublicSourceSensitiveProjections(
      decoded,
      ["publicGitHubSourcePatch", "decodedBase64"],
    );
  }
  const lines = value.split("\n");
  if (lines.length > maximumPublicSourcePatchLines) {
    throw new TypeError("Post-support public source patch exceeds its line bound");
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (Buffer.byteLength(line, "utf8") > maximumPublicSourcePatchLineBytes) {
      throw new TypeError(`Post-support public source patch line exceeds its byte bound at ${index}`);
    }
  }
  return value;
}

function assertPublicSourceSensitiveProjections(value, location) {
  for (const projection of publicSourceTextProjections(value)) {
    assertPublicSourceSensitiveText(projection, location);
    for (const reconstructed of publicSourceAdjacentLiteralCandidates(projection)) {
      for (const reconstructedProjection of publicSourceTextProjections(reconstructed)) {
        assertPublicSourceSensitiveText(
          reconstructedProjection,
          [...location, "adjacentLiterals"],
        );
      }
    }
  }
}

function decodedPublicSourceBase64Candidates(value) {
  const results = [];
  const pending = [{ depth: 0, value }];
  const seenEncoded = new Set();
  const seenDecoded = new Set([value]);
  for (let pendingIndex = 0; pendingIndex < pending.length; pendingIndex += 1) {
    const current = pending[pendingIndex];
    for (const projection of publicSourceTextProjections(current.value)) {
      const candidates = projection.match(
        /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{8,16384}={0,2}(?![A-Za-z0-9+/_=-])/gu,
      ) ?? [];
      candidates.push(...publicSourceAdjacentBase64Candidates(projection));
      candidates.push(...publicSourceAdjacentLiteralCandidates(projection));
      candidates.push(...publicSourceWhitespaceJoinedBase64Candidates(projection));
      for (const candidate of candidates) {
        if (seenEncoded.has(candidate)) continue;
        seenEncoded.add(candidate);
        if (seenEncoded.size > maximumPublicSourceEncodedCandidates) {
          throw new TypeError("Post-support public source patch encoded-candidate bound exceeded");
        }
        const canonical = candidate.replaceAll("-", "+").replaceAll("_", "/");
        const unpadded = canonical.replace(/=+$/u, "");
        const padded = unpadded + "=".repeat((4 - unpadded.length % 4) % 4);
        const bytes = Buffer.from(padded, "base64");
        if (bytes.length < 8 ||
          bytes.toString("base64").replace(/=+$/u, "") !== unpadded) continue;
        const decoded = bytes.toString("utf8");
        if (!Buffer.from(decoded, "utf8").equals(bytes) ||
          !/^[\x09\x0a\x0d\x20-\x7e\p{L}\p{N}\p{P}\p{S}]+$/u.test(decoded) ||
          seenDecoded.has(decoded)) continue;
        if (current.depth >= maximumDecodeLayers) {
          throw new TypeError(
            `Post-support public source patch exceeds ${maximumDecodeLayers} decode layers`,
          );
        }
        seenDecoded.add(decoded);
        results.push(decoded);
        pending.push({ depth: current.depth + 1, value: decoded });
      }
    }
  }
  return results;
}

function publicSourceAdjacentBase64Candidates(value) {
  const literals = [...value.matchAll(/(["'`])([A-Za-z0-9+/_-]{1,16384}={0,2})\1/gu)]
    .map((match) => ({
      end: match.index + match[0].length,
      start: match.index,
      value: match[2],
    }));
  const candidates = [];
  let attempts = 0;
  for (let start = 0; start < literals.length; start += 1) {
    let joined = literals[start].value;
    for (let end = start + 1; end < literals.length; end += 1) {
      const separator = value.slice(literals[end - 1].end, literals[end].start);
      if (!isPublicSourceStringConcatenationSeparator(separator)) break;
      joined += literals[end].value;
      attempts += 1;
      if (attempts > maximumPublicSourceEncodedCandidates) {
        throw new TypeError("Post-support public source patch segmented-candidate bound exceeded");
      }
      if (joined.length > maximumEmbeddedBase64TokenLength) {
        throw new TypeError("Post-support public source patch segmented candidate is oversized");
      }
      if (joined.length >= 8) candidates.push(joined);
    }
  }
  return candidates;
}

function publicSourceAdjacentLiteralCandidates(value) {
  const literals = publicSourceQuotedLiterals(value);
  const candidates = [];
  let attempts = 0;
  for (let start = 0; start < literals.length; start += 1) {
    let joined = literals[start].value;
    for (let end = start + 1; end < literals.length; end += 1) {
      const separator = value.slice(literals[end - 1].end, literals[end].start);
      if (!isPublicSourceStringConcatenationSeparator(separator)) break;
      joined += literals[end].value;
      attempts += 1;
      if (attempts > maximumPublicSourceEncodedCandidates) {
        throw new TypeError("Post-support public source patch adjacent-literal bound exceeded");
      }
      if (joined.length > maximumEmbeddedBase64TokenLength) {
        throw new TypeError("Post-support public source patch adjacent literal is oversized");
      }
      candidates.push(joined);
    }
  }
  return candidates;
}

function publicSourceQuotedLiterals(value) {
  const literals = [];
  for (let start = 0; start < value.length; start += 1) {
    const quote = value[start];
    if (quote !== "\"" && quote !== "'" && quote !== "`") continue;
    let content = "";
    let end = start + 1;
    for (; end < value.length; end += 1) {
      const character = value[end];
      if (character === "\\") {
        if (end + 1 >= value.length) break;
        content += character + value[end + 1];
        end += 1;
        continue;
      }
      if (character === quote) {
        literals.push({
          end: end + 1,
          start: publicSourceLiteralTokenStart(value, start, quote),
          value: content,
        });
        start = end;
        break;
      }
      if (quote !== "`" && (character === "\r" || character === "\n")) break;
      content += character;
      if (content.length > maximumEmbeddedBase64TokenLength) {
        throw new TypeError("Post-support public source patch quoted literal is oversized");
      }
    }
  }
  return literals;
}

function publicSourceLiteralTokenStart(value, quoteStart, quote) {
  if (quote === "`") return quoteStart;
  const prefix = value.slice(Math.max(0, quoteStart - 2), quoteStart)
    .match(/(?:u8|br|rb|fr|rf|[lubrf])$/iu)?.[0];
  if (prefix === undefined) return quoteStart;
  const tokenStart = quoteStart - prefix.length;
  return tokenStart === 0 || !/[A-Za-z0-9_$]/u.test(value[tokenStart - 1])
    ? tokenStart
    : quoteStart;
}

function publicSourceWhitespaceJoinedBase64Candidates(value) {
  const candidates = [];
  let attempts = 0;
  const matches = value.matchAll(
    /(?<![A-Za-z0-9+/_-])((?:[A-Za-z0-9+/_-]+={0,2}[ \t\r\n\f\v]+)+[A-Za-z0-9+/_-]+={0,2})(?![A-Za-z0-9+/_=-])/gu,
  );
  for (const match of matches) {
    const tokens = match[1].split(/[ \t\r\n\f\v]+/gu);
    for (let start = 0; start < tokens.length - 1; start += 1) {
      let joined = tokens[start];
      for (let end = start + 1; end < tokens.length; end += 1) {
        joined += tokens[end];
        attempts += 1;
        if (attempts > maximumPublicSourceEncodedCandidates) {
          throw new TypeError(
            "Post-support public source patch whitespace-joined candidate bound exceeded",
          );
        }
        if (joined.length > maximumEmbeddedBase64TokenLength) break;
        if (joined.length >= 8) candidates.push(joined);
      }
    }
  }
  return candidates;
}

function isPublicSourceStringConcatenationSeparator(value) {
  const withoutComments = removePublicSourceComments(value);
  if (withoutComments === null) return false;
  return /^[ \t\r\n\f\v]*$/u.test(withoutComments) ||
    /^[ \t\r\n\f\v)]*\+[ \t\r\n\f\v(]*$/u.test(withoutComments) ||
    /^[ \t\f\v)]*\+[ \t\f\v]*\r?\n\+[ \t\f\v(]*$/u.test(withoutComments) ||
    /^[ \t\f\v)]*\r?\n\+[ \t\f\v)]*\+[ \t\r\n\f\v(]*$/u.test(withoutComments);
}

function removePublicSourceComments(value) {
  let output = "";
  for (let offset = 0; offset < value.length; offset += 1) {
    if (value.startsWith("/*", offset)) {
      const closing = value.indexOf("*/", offset + 2);
      if (closing < 0) return null;
      offset = closing + 1;
      continue;
    }
    if (value.startsWith("//", offset) || value[offset] === "#") {
      while (offset < value.length && value[offset] !== "\r" && value[offset] !== "\n") {
        offset += 1;
      }
      if (offset >= value.length) return null;
      output += value[offset];
      continue;
    }
    if (value.startsWith("*/", offset)) return null;
    output += value[offset];
  }
  return output;
}

function publicSourceTextProjections(value) {
  const results = [];
  const seen = new Set();
  const add = (candidate) => {
    const normalized = candidate.normalize("NFKC").replace(/\p{Cf}/gu, "");
    if (seen.has(normalized)) return;
    if (results.length >= 64) {
      throw new TypeError("Post-support public source patch projection bound exceeded");
    }
    seen.add(normalized);
    results.push(normalized);
  };
  add(value);
  for (const diffView of projectUnifiedDiffViews(value)) add(diffView);
  for (let index = 0; index < results.length; index += 1) {
    const candidate = results[index];
    add(candidate.replace(/\\\r?\n/gu, ""));
    add(candidate.replace(/[\r\n\u2028\u2029]/gu, ""));
    add(candidate.replace(/%([0-9a-f]{2})/giu, (_match, digits) =>
      String.fromCharCode(Number.parseInt(digits, 16))));
    add(candidate
      .replace(/\\n/gu, "\n")
      .replace(/\\r/gu, "\r")
      .replace(/\\t/gu, "\t")
      .replace(/\\f/gu, "\f")
      .replace(/\\v/gu, "\v")
      .replace(/\\x([0-9a-f]{2})/giu, (_match, digits) =>
        String.fromCharCode(Number.parseInt(digits, 16)))
      .replace(/\\u([0-9a-f]{4})/giu, (_match, digits) =>
        String.fromCharCode(Number.parseInt(digits, 16))));
  }
  return results;
}

function projectUnifiedDiffViews(value) {
  const lines = value.split("\n");
  const oldView = [];
  const newView = [];
  const hunkBoundary = ";/*STASIS_DIFF_HUNK_BOUNDARY*/;";
  let hunkCount = 0;
  let inHunk = false;
  let oldContentCount = 0;
  let newContentCount = 0;
  for (const line of lines) {
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@(?: .*?)?\r?$/u.test(line)) {
      if (hunkCount > 0) {
        oldView.push(hunkBoundary);
        newView.push(hunkBoundary);
      }
      hunkCount += 1;
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (/^\\ No newline at end of file\r?$/u.test(line)) continue;
    if (line.startsWith(" ")) {
      const content = line.slice(1);
      oldView.push(content);
      newView.push(content);
      oldContentCount += 1;
      newContentCount += 1;
      continue;
    }
    if (line.startsWith("+")) {
      newView.push(line.slice(1));
      newContentCount += 1;
      continue;
    }
    if (line.startsWith("-")) {
      oldView.push(line.slice(1));
      oldContentCount += 1;
      continue;
    }
    inHunk = false;
  }
  if (hunkCount === 0) return [];
  return [
    ...(oldContentCount > 0 ? [oldView.join("\n")] : []),
    ...(newContentCount > 0 ? [newView.join("\n")] : []),
  ];
}

function assertPublicSourceSensitiveText(value, location) {
  if (publicSourceCredentialPatterns.some((pattern) => pattern.test(value))) {
    throw new TypeError(
      `Post-support public source patch contains credential-like text at ${format(location)}`,
    );
  }
  if (publicSourcePrivateTaskPathPatterns.some((pattern) => pattern.test(value))) {
    throw new TypeError(
      `Post-support public source patch contains a private task path at ${format(location)}`,
    );
  }
}

function privacySnapshot(value, location, seen) {
  if (typeof value === "string") {
    assertSafeString(value, location);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Post-support artifact contains a non-finite number at ${format(location)}`);
    }
    return value;
  }
  if (["boolean", "bigint"].includes(typeof value) || value === null) {
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`Post-support artifact contains ${typeof value} at ${format(location)}`);
  }
  if (seen.has(value)) throw new TypeError(`Post-support artifact contains a cycle at ${format(location)}`);
  seen.add(value);
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new TypeError(`Post-support artifact contains an invalid array at ${format(location)}`);
    }
    const snapshot = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`Post-support artifact contains a sparse or accessor array at ${format(location)}`);
      }
      snapshot.push(privacySnapshot(descriptor.value, [...location, index], seen));
    }
    const extraKeys = Reflect.ownKeys(descriptors).filter(
      (key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)),
    );
    if (extraKeys.length > 0) {
      throw new TypeError(`Post-support artifact contains an extended array at ${format(location)}`);
    }
    assertNotSensitiveHeaderTuple(snapshot, location);
    seen.delete(value);
    return snapshot;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`Post-support artifact contains a non-plain object at ${format(location)}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) {
    throw new TypeError(`Post-support artifact contains a symbol key at ${format(location)}`);
  }
  const snapshot = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (normalize(key) === "tojson") {
      throw new TypeError(`Post-support artifact contains a toJSON hook at ${format([...location, key])}`);
    }
    if (!descriptor.enumerable) continue;
    if (!("value" in descriptor)) {
      throw new TypeError(`Post-support artifact contains an accessor at ${format([...location, key])}`);
    }
    assertSafeKey(key, descriptor.value, location);
    snapshot[key] = privacySnapshot(descriptor.value, [...location, key], seen);
  }
  assertNotSensitiveHeaderRecord(snapshot, location);
  seen.delete(value);
  return snapshot;
}

function assertSafeKey(key, value, location) {
  const variants = expandedDecodedVariants(key, [...location, key], "key");
  for (const variant of variants) {
    const normalized = normalize(variant);
    if (
      forbiddenExactKeys.has(normalized) ||
      sensitiveKeyPattern.test(normalized)
    ) {
      throw new TypeError(`Post-support artifact contains a sensitive key at ${format([...location, key])}`);
    }
    assertTypedSensitiveMetadata(normalized, value, [...location, key]);
    if (normalized === "cookies") assertSafeCookieProjection(value, [...location, key]);
  }
}

function assertSafeCookieProjection(value, location) {
  if (!Array.isArray(value)) {
    throw new TypeError(`Post-support cookie projection is not an array at ${format(location)}`);
  }
  for (const cookie of value) {
    if (
      cookie === null ||
      typeof cookie !== "object" ||
      Array.isArray(cookie) ||
      !sameKeys(cookie, ["expiresUnixTimeNs", "name", "valuePresent"]) ||
      typeof cookie.name !== "string" ||
      typeof cookie.valuePresent !== "boolean" ||
      !(cookie.expiresUnixTimeNs === null || /^-?[0-9]+$/u.test(cookie.expiresUnixTimeNs))
    ) {
      throw new TypeError(`Post-support cookie projection contains raw state at ${format(location)}`);
    }
  }
}

function assertNotSensitiveHeaderRecord(value, location) {
  const entries = Object.entries(value).map(([key, item]) => [
    expandedDecodedVariants(key, [...location, key], "key").map(normalize),
    item,
  ]);
  const headerPayloadPresent = entries.some(([keys]) =>
    keys.some((key) => [
      "body",
      "content",
      "data",
      "headervalue",
      "headervalues",
      "payload",
      "value",
      "values",
    ].includes(key))
  );
  const sensitive = entries.some(([keys, item]) =>
    typeof item === "string" &&
    (
      keys.includes("headername") ||
      keys.some((key) => ["key", "name"].includes(key))
    ) &&
    isSensitiveHeaderName(item, location, keys.includes("headername") || headerPayloadPresent)
  );
  if (sensitive) {
    throw new TypeError(`Post-support artifact contains a sensitive header record at ${format(location)}`);
  }
}

function assertNotSensitiveHeaderTuple(value, location) {
  if (
    value.length >= 1 &&
    typeof value[0] === "string" &&
    isSensitiveHeaderName(value[0], [...location, 0])
  ) {
    throw new TypeError(`Post-support artifact contains a sensitive header tuple at ${format(location)}`);
  }
}

function assertTypedSensitiveMetadata(normalized, value, location) {
  if (/(?:credential|cookie|token|secret|authorization)(?:present|observed)$/u.test(normalized)) {
    if (typeof value !== "boolean") {
      throw new TypeError(`Post-support sensitive presence metadata is not boolean at ${format(location)}`);
    }
    return;
  }
  if (/(?:credential|cookie|token|secret|authorization)count$/u.test(normalized)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`Post-support sensitive count metadata is invalid at ${format(location)}`);
    }
  }
}

function isSensitiveHeaderName(value, location, allowPattern = true) {
  return expandedDecodedVariants(value, location, "header name")
    .some((variant) => {
      const normalized = normalize(variant);
      return sensitiveHeaderNames.has(normalized) ||
        ((allowPattern || normalized.startsWith("x")) && sensitiveHeaderNamePattern.test(normalized));
    });
}

function assertSafeString(original, location) {
  for (const value of expandedDecodedVariants(original, location, "text")) {
    assertDecodedString(original, value, location);
  }
}

function assertDecodedString(original, value, location) {
  const scanned = value.normalize("NFKC").replace(/\p{Cf}/gu, "");
  const typedSlashText =
    isTypedUrlPath(scanned, location) ||
    isTypedRwaRouteNarrative(original, value, scanned, location) ||
    isTypedRwaSemanticRouteNarrative(original, value, scanned, location);
  if (
    /\bfile:(?:\/\/|\\\\)/iu.test(scanned) ||
    /(?:^|[^a-z0-9])[a-z]:[^\s"']*[\\/]/iu.test(scanned) ||
    /\\\\(?:[?.]\\|[^\\])/u.test(scanned) ||
    (!typedSlashText &&
      /(?:^|[^a-z0-9\\/])[\\/](?![\\/])[^\s"']+/iu.test(scanned)) ||
    /(?:^|[\s"'=(])\/\/[^/\s"']+\/[^\s"']+/u.test(scanned) ||
    /(?:^|[^a-z0-9])\/(?:build|data|etc|home|mnt|opt|private|root|srv|tmp|usr|users|var|workspace)\//iu.test(scanned) ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(scanned)
  ) {
    throw new TypeError(`Post-support artifact contains a local path at ${format(location)}`);
  }
  if (
    /\b(?:authorization|proxy[-_. ]?authorization|cookie|set[-_. ]?cookie|x[-_. ]?api[-_. ]?key|api[-_. ]?key|password|access[-_. ]?token|refresh[-_. ]?token)\\?["']?\s*[:=]/iu.test(scanned) ||
    /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]{4,}/iu.test(scanned) ||
    /[?&](?:code|token|secret|password|api[-_. ]?key|access[-_. ]?token|refresh[-_. ]?token)=/iu.test(scanned) ||
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/iu.test(scanned) ||
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/iu.test(scanned)
  ) {
    throw new TypeError(`Post-support artifact contains credential-like text at ${format(location)}`);
  }
}

function isTypedUrlPath(value, location) {
  const key = location.at(-1);
  if (typeof key !== "string") return false;
  const normalizedKey = normalize(key);
  const insideRwaCase = location.some((part) =>
    typeof part === "string" && normalize(part) === "cases"
  );
  const insideTypedRwaEvidence = insideRwaCase && location.some((part) =>
    typeof part === "string" && ["checkpoints", "oracles"].includes(normalize(part))
  );
  const oracleValue =
    ["expected", "observed"].includes(normalizedKey) &&
    normalize(String(location.at(-3) ?? "")) === "oracles" &&
    insideTypedRwaEvidence;
  if (!(normalizedKey === "path" && insideTypedRwaEvidence) && !oracleValue) return false;
  return (
    value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") &&
    !/[\x00-\x20"'<>]/u.test(value) &&
    !value.split("/").some((part) => part === "." || part === "..")
  );
}

function isTypedRwaRouteNarrative(original, value, scanned, location) {
  if (
    original !== value ||
    value !== scanned ||
    !frozenRwaRouteNarratives.has(original) ||
    location.length !== 6
  ) {
    return false;
  }
  const key = location.at(-1);
  return (
    ["stage", "purpose"].includes(key) &&
    location.at(-2) === "action" &&
    Number.isSafeInteger(location.at(-3)) &&
    location.at(-3) >= 0 &&
    location.at(-4) === "checkpoints" &&
    Number.isSafeInteger(location.at(-5)) &&
    location.at(-5) >= 0 &&
    location.at(-6) === "cases"
  );
}

function isTypedRwaSemanticRouteNarrative(original, value, scanned, location) {
  if (original !== value || value !== scanned || location.length < 3) return false;
  const field = location.at(-1);
  const differenceId = location.at(-2);
  if (
    typeof field !== "string" ||
    typeof differenceId !== "string" ||
    location.at(-3) !== "definitions" ||
    (location.length !== 3 && location.at(-4) !== "semanticDifferenceDisclosure")
  ) {
    return false;
  }
  return frozenRwaSemanticRouteNarratives.get(`${differenceId}:${field}`) === original;
}

function expandedDecodedVariants(original, location, label) {
  const variants = [];
  const seen = new Set([original]);
  const pending = [{ value: original, depth: 0 }];
  const embeddedCandidates = new Set();
  while (pending.length > 0) {
    const { value, depth } = pending.shift();
    variants.push(value);
    const decoded = [];
    if (/%[0-9a-f]{2}/iu.test(value)) {
      try {
        const percentDecoded = decodeURIComponent(value);
        if (percentDecoded !== value) decoded.push(percentDecoded);
      } catch {
        throw new TypeError(`Post-support artifact contains invalid encoded ${label} at ${format(location)}`);
      }
    }
    const escapeDecoded = decodeEscapedText(value);
    if (escapeDecoded !== null && escapeDecoded !== value) decoded.push(escapeDecoded);
    const base64Prefix = /^base64:/iu.exec(value);
    const base64Payload = base64Prefix === null ? value : value.slice(base64Prefix[0].length);
    if (
      base64Payload.length > maximumEmbeddedBase64TokenLength &&
      /^[a-z0-9+/_-]+={0,2}$/iu.test(base64Payload)
    ) {
      throw new TypeError(
        `Post-support artifact contains an oversized encoded ${label} at ${format(location)}`,
      );
    }
    const base64Decoded = decodePlausibleBase64(value, label === "text" ? 12 : 4);
    if (base64Decoded !== null && base64Decoded !== value) decoded.push(base64Decoded);
    if (label === "key") {
      const segmentedBase64Decoded = decodeSegmentedBase64Key(value);
      if (segmentedBase64Decoded !== null && segmentedBase64Decoded !== value) {
        decoded.push(segmentedBase64Decoded);
      }
    } else {
      for (const candidate of segmentedBase64TextCandidates(value, location)) {
        if (embeddedCandidates.has(candidate.encoded)) continue;
        embeddedCandidates.add(candidate.encoded);
        if (embeddedCandidates.size > maximumEmbeddedBase64Candidates) {
          throw new TypeError(
            `Post-support artifact exceeds ${maximumEmbeddedBase64Candidates} embedded Base64 candidates at ${format(location)}`,
          );
        }
        decoded.push(candidate.decoded);
      }
    }
    for (const candidate of embeddedBase64Candidates(
      value,
      location,
      label === "text" ? 8 : 4,
    )) {
      if (embeddedCandidates.has(candidate)) continue;
      const embeddedDecoded = decodePlausibleBase64(candidate, label === "text" ? 8 : 4);
      if (embeddedDecoded === null || embeddedDecoded === value) continue;
      embeddedCandidates.add(candidate);
      if (embeddedCandidates.size > maximumEmbeddedBase64Candidates) {
        throw new TypeError(
          `Post-support artifact exceeds ${maximumEmbeddedBase64Candidates} embedded Base64 candidates at ${format(location)}`,
        );
      }
      decoded.push(embeddedDecoded);
    }
    for (const next of decoded) {
      if (seen.has(next)) continue;
      if (depth >= maximumDecodeLayers) {
        throw new TypeError(
          `Post-support artifact exceeds ${maximumDecodeLayers} decode layers at ${format(location)}`,
        );
      }
      seen.add(next);
      pending.push({ value: next, depth: depth + 1 });
    }
  }
  return variants;
}

function decodeEscapedText(value) {
  let changed = false;
  const decoded = value
    .replace(/\\u([0-9a-f]{4})/giu, (_match, digits) => {
      changed = true;
      return String.fromCharCode(Number.parseInt(digits, 16));
    })
    .replace(/\\(["'\\/bfnrt])/gu, (_match, escape) => {
      changed = true;
      return ({ b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" })[escape] ?? escape;
    });
  return changed ? decoded : null;
}

function decodeSegmentedBase64Key(value) {
  const joined = value.replace(/[^a-z0-9+/=]/giu, "");
  if (joined === value || joined.length < 4) return null;
  return decodePlausibleBase64(joined, 4);
}

function segmentedBase64TextCandidates(value, location) {
  const candidates = [];
  const tokens = value.match(/[a-z0-9+/=]+|[^a-z0-9+/=]+/giu) ?? [];
  let attempts = 0;
  for (let start = 0; start < tokens.length; start += 1) {
    if (!/^[a-z0-9+/=]+$/iu.test(tokens[start])) continue;
    let joined = "";
    let separatorCount = 0;
    let encoded = "";
    for (let end = start; end < tokens.length; end += 1) {
      const token = tokens[end];
      encoded += token;
      if (/^[a-z0-9+/=]+$/iu.test(token)) joined += token;
      else separatorCount += 1;
      if (
        separatorCount < 2 ||
        joined.length < 8 ||
        end === start ||
        !/^[a-z0-9+/=]+$/iu.test(token)
      ) {
        continue;
      }
      attempts += 1;
      if (attempts > maximumEmbeddedBase64Candidates * maximumEmbeddedBase64Candidates * 2) {
        throw new TypeError(
          `Post-support artifact exceeds bounded segmented Base64 analysis at ${format(location)}`,
        );
      }
      if (encoded.length > maximumEmbeddedBase64TokenLength) {
        throw new TypeError(
          `Post-support artifact contains an oversized segmented Base64 candidate at ${format(location)}`,
        );
      }
      const decoded = decodePlausibleBase64(joined, 8);
      if (decoded !== null) candidates.push({ encoded, decoded });
    }
  }
  return candidates;
}

function decodePlausibleBase64(value, minimumLength = 12) {
  const prefix = /^base64:/iu.exec(value);
  const encoded = prefix === null ? value : value.slice(prefix[0].length);
  const requiredLength = prefix === null ? minimumLength : 4;
  if (encoded.length < requiredLength || !/^[a-z0-9+/_-]+={0,2}$/iu.test(encoded)) {
    return null;
  }
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/").replace(/=+$/u, "");
  if (normalized.length % 4 === 1) return null;
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  const decoded = Buffer.from(padded, "base64");
  if (decoded.length === 0 || decoded.toString("base64").replace(/=+$/u, "") !== normalized) {
    return null;
  }
  const text = decoded.toString("utf8");
  if (text.includes("\uFFFD") || !/^[\x09\x0a\x0d\x20-\x7e]+$/u.test(text)) return null;
  return text;
}

function embeddedBase64Candidates(value, location, minimumLength = 8) {
  const candidates = new Set();
  const patterns = [
    new RegExp(
      `(?:^|[^a-z0-9+/_-])([a-z0-9+/_-]{${minimumLength},}={0,2})(?=$|[^a-z0-9+/_=-])`,
      "giu",
    ),
    new RegExp(
      `(?:^|[^a-z0-9+/])([a-z0-9+/]{${minimumLength},}={0,2})(?=$|[^a-z0-9+/=])`,
      "giu",
    ),
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const candidate = match[1];
      if (candidate.length > maximumEmbeddedBase64TokenLength) {
        throw new TypeError(
          `Post-support artifact contains an oversized embedded Base64 candidate at ${format(location)}`,
        );
      }
      if (decodePlausibleBase64(candidate, minimumLength) !== null) candidates.add(candidate);
    }
  }
  return [...candidates];
}

function normalize(value) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function sameKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function format(location) {
  return location.reduce(
    (current, part) => Number.isSafeInteger(part) ? `${current}[${part}]` : `${current}[${JSON.stringify(part)}]`,
    "$",
  );
}
