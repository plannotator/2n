import solidPlugin from "@opentui/solid/bun-plugin";

const result = await Bun.build({
  entrypoints: ["./src/ascii-auditions-main.tsx"],
  target: "bun",
  plugins: [solidPlugin],
  minify: true,
  compile: {
    outfile: "./dist/2e",
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
