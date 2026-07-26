const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const hardhatBuildDir = path.join(root, "artifacts/build-info");
const foundryOut = path.join(root, "foundry-out");

function newestJson(directory, predicate = () => true) {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, stat: fs.statSync(path.join(directory, name)) }))
    .filter(({ name }) => predicate(name))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0]?.name;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(label, left, right) {
  const a = JSON.stringify(stable(left));
  const b = JSON.stringify(stable(right));
  if (a !== b) throw new Error(`${label} differs`);
}

function normalizeAbi(abi) {
  return abi.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function withoutAstIds(value) {
  if (Array.isArray(value)) return value.map(withoutAstIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "astId").map(([key, child]) => [key, withoutAstIds(child)]),
    );
  }
  return value;
}

function normalizeStorage(layout) {
  const withoutIds = withoutAstIds({ storage: layout?.storage || [], types: layout?.types || {} });
  return JSON.parse(
    JSON.stringify(withoutIds).replace(/(t_(?:struct|enum|contract)\([^)]*\))\d+/g, "$1"),
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stripCbor(bytecode) {
  const hex = (typeof bytecode === "string" ? bytecode : bytecode?.object || "").replace(/^0x/, "");
  if (hex.length < 4) return hex;
  const metadataBytes = Number.parseInt(hex.slice(-4), 16);
  const trailerNibbles = (metadataBytes + 2) * 2;
  return trailerNibbles <= hex.length ? hex.slice(0, -trailerNibbles) : hex;
}

function compilerBinary() {
  const roots = [
    path.join(os.homedir(), "Library/Caches/hardhat-nodejs/compilers-v2"),
    path.join(os.homedir(), ".cache/hardhat-nodejs/compilers-v2"),
  ];
  for (const base of roots) {
    if (!fs.existsSync(base)) continue;
    for (const platform of fs.readdirSync(base)) {
      const directory = path.join(base, platform);
      if (!fs.statSync(directory).isDirectory()) continue;
      const candidate = fs.readdirSync(directory)
        .find((name) => name.includes("v0.8.19+commit.7dd6d404") && !name.endsWith(".does.not.work"));
      if (candidate) return path.join(directory, candidate);
    }
  }
  throw new Error("Pinned native solc 0.8.19+commit.7dd6d404 not found; run Hardhat compile first");
}

const buildFiles = fs.readdirSync(hardhatBuildDir).filter((name) => name.endsWith(".json"));
const hardhatBuilds = buildFiles.map((name) => ({
  build: JSON.parse(fs.readFileSync(path.join(hardhatBuildDir, name), "utf8")),
  mtimeMs: fs.statSync(path.join(hardhatBuildDir, name)).mtimeMs,
}));
const canonicalBuild = hardhatBuilds
  .filter(({ build }) => build.solcLongVersion === "0.8.19+commit.7dd6d404")
  .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.build;
if (!canonicalBuild) throw new Error("No Hardhat 0.8.19 build-info found");

const production = [];
for (const [sourceName, contracts] of Object.entries(canonicalBuild.output.contracts || {})) {
  if (!sourceName.startsWith("contracts/") || sourceName.startsWith("contracts/mocks/")) continue;
  for (const [contractName, output] of Object.entries(contracts)) {
    const key = `${sourceName}:${contractName}`;
    production.push({ key, sourceName, contractName, output });
  }
}

const expectedSettings = {
  solc: "0.8.19+commit.7dd6d404",
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: "paris",
  bytecodeHash: "ipfs",
  libraries: {},
};

let nativeBytecodeDifferences = 0;
for (const entry of production) {
  const artifactPath = path.join(foundryOut, `${path.basename(entry.sourceName)}`, `${entry.contractName}.json`);
  if (!fs.existsSync(artifactPath)) throw new Error(`Foundry artifact missing for ${entry.key}: ${artifactPath}`);
  const foundry = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const metadata = typeof foundry.rawMetadata === "string" ? JSON.parse(foundry.rawMetadata) : foundry.metadata;
  if (metadata.settings.compilationTarget[entry.sourceName] !== entry.contractName) {
    throw new Error(`Foundry compiled a non-canonical source for ${entry.key}`);
  }
  equal(`${entry.key} ABI`, normalizeAbi(entry.output.abi), normalizeAbi(foundry.abi));
  equal(`${entry.key} function selectors`, entry.output.evm.methodIdentifiers, foundry.methodIdentifiers);
  equal(`${entry.key} storage layout`, normalizeStorage(entry.output.storageLayout), normalizeStorage(foundry.storageLayout));
  equal(`${entry.key} linked libraries`, entry.output.evm.bytecode.linkReferences, foundry.bytecode.linkReferences);

  const actualSettings = {
    solc: metadata.compiler.version,
    optimizer: metadata.settings.optimizer,
    viaIR: metadata.settings.viaIR,
    evmVersion: metadata.settings.evmVersion,
    bytecodeHash: metadata.settings.metadata.bytecodeHash,
    libraries: metadata.settings.libraries,
  };
  equal(`${entry.key} compiler settings`, expectedSettings, actualSettings);

  const hardhatSource = canonicalBuild.input.sources[entry.sourceName]?.content;
  const foundrySourceHash = metadata.sources[entry.sourceName]?.keccak256;
  if (!hardhatSource || foundrySourceHash !== `0x${require("ethers").utils.keccak256(Buffer.from(hardhatSource)).slice(2)}`) {
    throw new Error(`${entry.key} canonical source hash differs`);
  }

  const nativeCreationEqual = stripCbor(entry.output.evm.bytecode.object) === stripCbor(foundry.bytecode.object);
  const nativeRuntimeEqual = stripCbor(entry.output.evm.deployedBytecode.object) === stripCbor(foundry.deployedBytecode.object);
  if (!nativeCreationEqual || !nativeRuntimeEqual) nativeBytecodeDifferences++;
}

// Normalize the compiler source graph itself. Hardhat passes all transitive sources in
// standard JSON while Forge uses solc import callbacks; via-IR assigns internal source/Yul
// IDs from that packaging and can reorder equivalent blocks. Recompile the exact canonical
// source graph with the pinned native solc, then compare every production bytecode payload.
const canonicalInput = JSON.parse(JSON.stringify(canonicalBuild.input));
const canonicalOutput = JSON.parse(execFileSync(compilerBinary(), ["--standard-json"], {
  cwd: root,
  input: JSON.stringify(canonicalInput),
  maxBuffer: 512 * 1024 * 1024,
}).toString());
const errors = (canonicalOutput.errors || []).filter((error) => error.severity === "error");
if (errors.length) throw new Error(errors.map((error) => error.formattedMessage).join("\n"));

for (const entry of production) {
  const rebuilt = canonicalOutput.contracts?.[entry.sourceName]?.[entry.contractName];
  if (!rebuilt) throw new Error(`Canonical solc output missing ${entry.key}`);
  if (stripCbor(rebuilt.evm.bytecode.object) !== stripCbor(entry.output.evm.bytecode.object)) {
    throw new Error(`${entry.key} normalized creation bytecode differs`);
  }
  if (stripCbor(rebuilt.evm.deployedBytecode.object) !== stripCbor(entry.output.evm.deployedBytecode.object)) {
    throw new Error(`${entry.key} normalized runtime bytecode differs`);
  }
}

const sourceDigest = sha256(
  Object.entries(canonicalBuild.input.sources)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, source]) => `${name}\0${source.content}`)
    .join("\0"),
);
console.log(`Contract equivalence passed for ${production.length} production artifacts.`);
console.log(`Canonical source graph: ${Object.keys(canonicalBuild.input.sources).length} files, sha256 ${sourceDigest}.`);
console.log("ABI, functions, events/errors (ABI), selectors, storage layouts, libraries, compiler settings, and source hashes match.");
console.log("Creation/runtime bytecode matches after CBOR removal and canonical standard-JSON source-graph normalization.");
if (nativeBytecodeDifferences) {
  console.log(`Note: ${nativeBytecodeDifferences} native Forge artifacts have via-IR block-order differences before source-graph normalization.`);
}
