import { canonicalHttpUrl } from "../shared/io.mjs";

export const origin = "http://stasis-compat.test";
export const startUrl = `${origin}/`;
export const maxDepth = 2;
export const maxPages = 20;
export const concurrency = 1;

const contentHeaders = [
  ["Content-Type", "text/html; charset=utf-8"],
  ["Cache-Control", "no-store"],
];

function document(title, body, script = "") {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body>
    <main>${body}</main>
    ${script.length === 0 ? "" : `<script>${script}</script>`}
  </body>
</html>`;
}

function status(state = "complete") {
  return `<p id="status" data-state="${state}">${state}</p>`;
}

function leaf(name) {
  return document(`leaf-${name}`, `${status()}<p data-value="${name}">${name}</p>`);
}

function addLinkAndComplete(path, label) {
  return `
    const link = document.createElement("a");
    link.href = ${JSON.stringify(path)};
    link.textContent = ${JSON.stringify(label)};
    document.querySelector("main").append(link);
    const marker = document.querySelector("#status");
    marker.dataset.state = "complete";
    marker.textContent = "complete";
  `;
}

const primary = [
  {
    path: "/",
    body: document(
      "root",
      `${status()}
       <a href="/static#first">static</a>
       <a href="/canonical">canonical</a>
       <a href="/microtask">microtask</a>
       <a href="/timer">timer</a>
       <a href="/raf">raf</a>
       <a href="/fetch">fetch</a>
       <a href="/xhr">xhr</a>
       <a href="/state">state</a>
       <a href="/navigation-start">navigation</a>
       <a href="/interval">interval</a>
       <a href="/static#duplicate">static duplicate</a>
       <a href="https://outside.test/not-admitted">outside origin</a>
       <a href="mailto:reviewer@example.test">mail</a>
       <a href="javascript:void 0">script URL</a>`,
    ),
  },
  {
    path: "/static",
    body: document(
      "static",
      `${status()}
       <a href="/leaf/static#first">static leaf</a>
       <a href="/leaf/static#duplicate">static leaf duplicate</a>`,
    ),
  },
  {
    path: "/canonical",
    body: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>canonical</title>
    <base href="${origin}/base-target/">
  </head>
  <body>
    <main>
      ${status()}
      <a href="../leaf/canonical#first">canonical leaf</a>
      <a href="../leaf/canonical#duplicate">canonical leaf duplicate</a>
      <a href="https://outside.test/not-admitted">outside origin</a>
      <a href="ftp://stasis-compat.test/not-http">non-HTTP</a>
    </main>
  </body>
</html>`,
  },
  {
    path: "/microtask",
    body: document(
      "microtask",
      status("pending"),
      `Promise.resolve().then(() => { ${addLinkAndComplete("/leaf/microtask", "microtask leaf")} });`,
    ),
  },
  {
    path: "/timer",
    body: document(
      "timer",
      status("pending"),
      `setTimeout(() => { ${addLinkAndComplete("/leaf/timer", "timer leaf")} }, 25);`,
    ),
  },
  {
    path: "/raf",
    body: document(
      "raf",
      status("pending"),
      `requestAnimationFrame(() => {
         requestAnimationFrame(() => { ${addLinkAndComplete("/leaf/raf", "raf leaf")} });
       });`,
    ),
  },
  {
    path: "/fetch",
    body: document(
      "fetch",
      status("pending"),
      `Promise.all([
         fetch("/api/link").then((response) => {
           if (!response.ok) throw new Error("link fixture failed");
           return response.json();
         }),
         fetch("/api/failure").then((response) => {
           if (response.status !== 503) throw new Error("failure fixture was not 503");
           return response.status;
         }),
       ]).then(([data]) => {
         if (data.href !== "/leaf/fetch") throw new Error("unexpected link fixture");
         ${addLinkAndComplete("/leaf/fetch", "fetch leaf")}
       });`,
    ),
  },
  {
    path: "/xhr",
    body: document(
      "xhr",
      `${status("pending")}<output id="xhr-result">pending</output>`,
      `const output = document.querySelector("#xhr-result");
       const observer = new MutationObserver(() => {
         if (output.textContent !== "/leaf/xhr") return;
         observer.disconnect();
         ${addLinkAndComplete("/leaf/xhr", "xhr leaf")}
       });
       observer.observe(output, { childList: true });
       const request = new XMLHttpRequest();
       request.open("GET", "/api/xhr", true);
       request.onload = () => { output.textContent = request.responseText; };
       request.send();`,
    ),
  },
  {
    path: "/state",
    body: document(
      "state",
      status("pending"),
      `document.cookie = "bench-cookie=present; Path=/; SameSite=Lax";
       localStorage.setItem("bench-local", "present");
       sessionStorage.setItem("bench-session", "present");
       Promise.resolve().then(() => {
         const stateIsExact = document.cookie.includes("bench-cookie=present") &&
           localStorage.getItem("bench-local") === "present" &&
           sessionStorage.getItem("bench-session") === "present";
         if (!stateIsExact) throw new Error("page-local state contract failed");
         history.pushState({ ready: true }, "", "/state/ready/");
         ${addLinkAndComplete("leaf", "state leaf")}
       });`,
    ),
  },
  {
    path: "/navigation-start",
    body: document(
      "navigation-start",
      status("pending"),
      `location.href = "/navigation-final";`,
    ),
  },
  {
    path: "/navigation-final",
    body: document(
      "navigation-final",
      `${status()}<a href="/leaf/navigation">navigation leaf</a>`,
    ),
  },
  {
    path: "/interval",
    body: document(
      "interval",
      `${status()}<a href="/leaf/static#interval-duplicate">global duplicate</a>`,
      `setInterval(() => {}, 5_000);`,
    ),
  },
  {
    path: "/api/link",
    headers: [
      ["Content-Type", "application/json"],
      ["Cache-Control", "no-store"],
    ],
    body: '{"href":"/leaf/fetch"}',
  },
  {
    path: "/api/failure",
    status: 503,
    headers: [
      ["Content-Type", "text/plain; charset=utf-8"],
      ["Cache-Control", "no-store"],
    ],
    body: "fixture unavailable",
  },
  {
    path: "/api/xhr",
    headers: [
      ["Content-Type", "text/plain; charset=utf-8"],
      ["Cache-Control", "no-store"],
    ],
    body: "/leaf/xhr",
  },
  { path: "/leaf/static", body: leaf("static") },
  { path: "/leaf/canonical", body: leaf("canonical") },
  { path: "/leaf/microtask", body: leaf("microtask") },
  { path: "/leaf/timer", body: leaf("timer") },
  { path: "/leaf/raf", body: leaf("raf") },
  { path: "/leaf/fetch", body: leaf("fetch") },
  { path: "/leaf/xhr", body: leaf("xhr") },
  { path: "/state/ready/leaf", body: leaf("state") },
  { path: "/leaf/navigation", body: leaf("navigation") },
];

const negative = [
  {
    path: "/negative/worker",
    body: document(
      "worker",
      status("pending"),
      `const worker = new Worker("/negative/worker.js");
       worker.onmessage = () => { ${addLinkAndComplete("/negative/worker-leaf", "worker leaf")} };`,
    ),
  },
  {
    path: "/negative/worker.js",
    headers: [["Content-Type", "text/javascript; charset=utf-8"]],
    body: 'postMessage("ready");',
  },
  { path: "/negative/worker-leaf", body: leaf("worker") },
  {
    path: "/negative/iframe",
    body: document(
      "iframe",
      `${status("pending")}<iframe id="child" title="fixture"></iframe>`,
      `const frame = document.querySelector("#child");
       frame.addEventListener("load", () => { ${addLinkAndComplete("/negative/iframe-leaf", "iframe leaf")} });
       frame.src = "/negative/frame-content";`,
    ),
  },
  { path: "/negative/frame-content", body: document("frame", status()) },
  { path: "/negative/iframe-leaf", body: leaf("iframe") },
];

export const routes = [...primary, ...negative].map((route) => ({
  method: "GET",
  url: `${origin}${route.path}`,
  status: route.status ?? 200,
  headers: route.headers ?? contentHeaders,
  body: route.body,
}));

export const negativeControls = [
  { id: "worker", start: `${origin}/negative/worker`, expectedSurface: "worker" },
  { id: "iframe", start: `${origin}/negative/iframe`, expectedSurface: "iframe" },
];

export const expectedPrimaryScheduledUrls = [
  `${origin}/`,
  `${origin}/static`,
  `${origin}/canonical`,
  `${origin}/microtask`,
  `${origin}/timer`,
  `${origin}/raf`,
  `${origin}/fetch`,
  `${origin}/xhr`,
  `${origin}/state`,
  `${origin}/navigation-start`,
  `${origin}/interval`,
  `${origin}/leaf/static`,
  `${origin}/leaf/canonical`,
  `${origin}/leaf/microtask`,
  `${origin}/leaf/timer`,
  `${origin}/leaf/raf`,
  `${origin}/leaf/fetch`,
  `${origin}/leaf/xhr`,
  `${origin}/state/ready/leaf`,
  `${origin}/leaf/navigation`,
];

export function fixtureFor(method, url) {
  const canonical = canonicalHttpUrl(url);
  return routes.find((route) => route.method === method && route.url === canonical);
}

export function stasisNetwork() {
  return {
    mode: "fixtures_only",
    routes: routes.map((route) => ({
      match: { method: route.method, url: { exact: route.url } },
      fulfill: {
        status: route.status,
        headers: route.headers,
        body: { utf8: route.body },
      },
    })),
  };
}

export function normalizeLinks(values, base) {
  const seen = new Set();
  const links = [];
  for (const value of values) {
    let canonical;
    try {
      canonical = canonicalHttpUrl(value, base);
    } catch {
      continue;
    }
    const parsed = new URL(canonical);
    if (
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.origin !== origin ||
      seen.has(canonical)
    ) {
      continue;
    }
    seen.add(canonical);
    links.push(canonical);
  }
  return links;
}
