import solidPlugin from "@opentui/solid/bun-plugin";

const releaseTargets = [
  { target: "bun-darwin-arm64", outfile: "./dist/2n-darwin-arm64" },
  { target: "bun-darwin-x64-baseline", outfile: "./dist/2n-darwin-x64" },
  { target: "bun-linux-arm64", outfile: "./dist/2n-linux-arm64" },
  { target: "bun-linux-arm64-musl", outfile: "./dist/2n-linux-arm64-musl" },
  { target: "bun-linux-x64-baseline", outfile: "./dist/2n-linux-x64" },
  { target: "bun-linux-x64-musl", outfile: "./dist/2n-linux-x64-musl" },
  { target: "bun-windows-arm64", outfile: "./dist/2n-windows-arm64.exe" },
  { target: "bun-windows-x64-baseline", outfile: "./dist/2n-windows-x64.exe" },
] as const;

const targets = process.argv.includes("--all")
  ? releaseTargets
  : ([{ target: undefined, outfile: "./dist/2n" }] as const);

for (const release of targets) {
  const result = await Bun.build({
    entrypoints: ["./src/main.tsx"],
    target: "bun",
    plugins: [solidPlugin],
    minify: true,
    compile:
      release.target === undefined
        ? { outfile: release.outfile }
        : { target: release.target, outfile: release.outfile },
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}
