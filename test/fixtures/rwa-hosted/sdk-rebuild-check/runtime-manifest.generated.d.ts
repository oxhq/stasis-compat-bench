export declare const RUNTIME_DISTRIBUTION_MANIFEST: {
    readonly schema: 1;
    readonly packageName: "@oxhq/stasis";
    readonly sdkVersion: "0.1.0-alpha.0";
    readonly releaseTag: "v0.1.0-alpha.0";
    readonly implementation: {
        readonly name: "stasis-shell";
        readonly source: {
            readonly servo_repository: "https://github.com/servo/servo.git";
            readonly servo_revision: "0d579bd5aab6df3764fad805427254751632a6e4";
            readonly pliego_repository: "https://github.com/oxhq/pliego.git";
            readonly pliego_revision: "556c774242b272b11bc60999449c5debff1ad20f";
            readonly pliego_servo_merge_base: "313b6d5ecc113b08010ce434140db3ca5abcc71c";
            readonly stasis_repository: "https://github.com/oxhq/stasis.git";
            readonly stasis_revision: "c5b8591d4d7dbe1b2da2f916409867cb18256470";
        };
    };
    readonly artifacts: {
        readonly "darwin-arm64": {
            readonly nodePlatform: "darwin";
            readonly nodeArch: "arm64";
            readonly releasePlatform: "macos-aarch64";
            readonly archiveUrl: "https://github.com/oxhq/stasis/releases/download/v0.1.0-alpha.0/stasis-0.1.0-alpha.0-macos-aarch64.tar.gz";
            readonly archiveSizeBytes: 30077840;
            readonly archiveSha256: "399fa14e506332c816292be5ff3423455c0947547259186c1e91bd70fc5070d9";
            readonly archiveRoot: "stasis-0.1.0-alpha.0-macos-aarch64";
            readonly archiveFiles: readonly ["INSTALL.txt", "LICENSE", "LICENSE_WHATWG_SPECS", "SOURCE.txt", "STASIS_UPSTREAM.toml", "THIRD_PARTY_LICENSES.html", "VERSION.txt", "stasis"];
            readonly executablePath: "stasis";
            readonly executableSha256: "3cd7a759d46b42e8191a17c8bb9191af9672babb7dd08512d8ccd29a13e1c567";
        };
    };
};
//# sourceMappingURL=runtime-manifest.generated.d.ts.map