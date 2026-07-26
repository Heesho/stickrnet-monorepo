const { spawnSync } = require("child_process");

function run(args) {
  const result = spawnSync("forge", ["coverage", "--report", "summary", ...args], {
    cwd: require("path").join(__dirname, ".."),
    encoding: "utf8",
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  return { status: result.status, output: `${result.stdout || ""}\n${result.stderr || ""}` };
}

const standard = run([]);
if (standard.status === 0) process.exit(0);

const viaIr = run(["--ir-minimum"]);
if (viaIr.status === 0) process.exit(0);

const combined = `${standard.output}\n${viaIr.output}`;
const knownCompilerLimitation = combined.includes("Stack too deep") && combined.includes("Yul exception");
if (!knownCompilerLimitation) process.exit(viaIr.status || 1);

console.log(
  "Foundry coverage is unavailable for this via-IR codebase: standard coverage hits stack-too-deep and --ir-minimum hits a Yul stack-depth exception. Hardhat coverage remains the authoritative line/branch report.",
);
