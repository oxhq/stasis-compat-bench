"use strict";

const net = require("node:net");

const role = typeof process.env.STASIS_COMPAT_RWA_SERVER_ROLE === "string"
  ? process.env.STASIS_COMPAT_RWA_SERVER_ROLE
  : "";
const port = Number(process.env.STASIS_COMPAT_RWA_SERVER_PORT);
const registeredServers = new WeakSet();
const originalListen = net.Server.prototype.listen;

if (
  typeof process.send === "function" &&
  role.length > 0 &&
  Number.isSafeInteger(port) &&
  port > 0
) {
  net.Server.prototype.listen = function patchedListen(...args) {
    if (!registeredServers.has(this)) {
      registeredServers.add(this);
      this.once("listening", () => {
        const address = this.address();
        const observedPort = typeof address === "object" && address !== null ? address.port : null;
        if (observedPort === port) {
          process.send({ type: "rwa-server-ready", role, port });
        }
      });
      this.once("close", () => {
        process.send({ type: "rwa-server-closed", role, port });
      });
    }
    return originalListen.apply(this, args);
  };
}
