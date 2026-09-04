export { RUNTIME_DISTRIBUTION_MANIFEST } from "./runtime-manifest.generated.js";
/**
 * Native bytes bound to this exact SDK release. Release automation updates this
 * table only after every listed archive and executable digest has been gated and
 * attested. Runtime acquisition fails closed when the installed SDK version or
 * host platform is absent from this manifest.
 */
export function runtimePlatformKey(platform = process.platform, architecture = process.arch) {
    return `${platform}-${architecture}`;
}
//# sourceMappingURL=runtime-manifest.js.map