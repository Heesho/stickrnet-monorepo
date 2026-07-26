const fs = require("fs");
const path = require("path");

const snapshotDir = path.join(__dirname, "../foundry/snapshots");
const hardhat = JSON.parse(fs.readFileSync(path.join(snapshotDir, "hardhat.json"), "utf8"));
const foundryLines = fs.readFileSync(path.join(snapshotDir, "foundry.snapshot"), "utf8").trim().split("\n");
const foundryScenarios = [];
const foundryByName = new Map();
for (const line of foundryLines) {
  const [scenario, key, value] = line.split("\t");
  if (!foundryByName.has(scenario)) {
    const entry = { scenario };
    foundryByName.set(scenario, entry);
    foundryScenarios.push(entry);
  }
  foundryByName.get(scenario)[key] = value;
}
const foundry = { framework: "normalized", scenarios: foundryScenarios };

if (hardhat.framework !== foundry.framework) throw new Error("snapshot normalization versions differ");
if (hardhat.scenarios.length !== foundry.scenarios.length) {
  throw new Error(`scenario count differs: Hardhat=${hardhat.scenarios.length}, Foundry=${foundry.scenarios.length}`);
}

const differences = [];
for (let index = 0; index < hardhat.scenarios.length; index++) {
  const left = hardhat.scenarios[index];
  const right = foundry.scenarios[index];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    if (left[key] !== right[key]) {
      differences.push(`${left.scenario || index}.${key}: Hardhat=${left[key]} Foundry=${right[key]}`);
    }
  }
}

if (differences.length) {
  throw new Error(`Differential verification failed:\n${differences.join("\n")}`);
}
console.log(`Differential verification passed: ${hardhat.scenarios.length} normalized scenarios are identical.`);
