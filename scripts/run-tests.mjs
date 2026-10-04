import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const sources = [
  "lib/types.ts",
  "lib/behavioralBaseline.ts",
  "lib/featureEngineering.ts",
  "lib/fraudAnalysis.ts",
  "lib/transactionStorage.ts",
  "lib/transactionService.ts",
  "lib/transactionMetrics.ts",
];

const compilation = spawnSync(process.execPath, [
  tsc,
  "--strict",
  "--skipLibCheck",
  "--target", "ES2022",
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--outDir", ".test-build",
  ...sources,
], { cwd: projectRoot, stdio: "inherit" });

if (compilation.status !== 0) process.exit(compilation.status ?? 1);

const tests = spawnSync(process.execPath, ["--test", "tests/feature-engineering.test.mjs"], {
  cwd: projectRoot,
  stdio: "inherit",
});
process.exit(tests.status ?? 1);
