const { spawnSync } = require("child_process");
const path = require("path");

const cwd = path.join(__dirname, "..");
function hardhat(args) {
  const result = spawnSync("npx", ["hardhat", ...args], { cwd, stdio: "inherit" });
  return result.status === null ? 1 : result.status;
}

let coverageStatus = hardhat(["clean"]);
if (coverageStatus === 0) coverageStatus = hardhat(["coverage"]);

// solidity-coverage leaves instrumented artifacts in the normal artifact path.
// Always restore production artifacts, even when coverage itself fails.
const cleanStatus = hardhat(["clean"]);
const compileStatus = cleanStatus === 0 ? hardhat(["compile"]) : cleanStatus;
process.exitCode = coverageStatus || compileStatus;
