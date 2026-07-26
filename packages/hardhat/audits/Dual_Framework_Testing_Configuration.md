# StickrNet Shared Hardhat and Foundry Configuration

**Canonical contracts:** `packages/hardhat/contracts`  
**Baseline commit:** `5009638333b17aa17f26ba13c92207fa4123dfb9`

| Setting | Hardhat | Foundry requirement |
|---|---|---|
| Source root | `contracts` | `src = "contracts"` |
| Solidity | 0.8.19 | 0.8.19 |
| Long version | `0.8.19+commit.7dd6d404` | same downloaded solc release |
| Optimizer | enabled | enabled |
| Optimizer runs | 200 | 200 |
| via-IR | true | true |
| EVM version | explicit `paris` | explicit `paris` |
| Metadata | CBOR/IPFS metadata | same metadata settings; equivalence also strips the CBOR trailer |
| OpenZeppelin | resolved 4.9.6 | same monorepo `node_modules/@openzeppelin` files |
| Libraries | none linked | none linked |
| Chain ID | Hardhat default locally; Base Sepolia 84532 for deployment | 31337 locally unless a test sets it explicitly |
| Initial timestamp | framework-controlled | differential scenarios set an identical explicit timestamp |
| Source duplication | none | prohibited |

Foundry maps `@openzeppelin/` directly to the monorepo dependency tree with `@openzeppelin/=../../node_modules/@openzeppelin/`. It must not install or resolve a second OpenZeppelin version. Protocol artifacts are accepted only when their compiler target is the canonical `contracts/` source path.

Exact raw artifact JSON equality is not expected because Hardhat and Foundry wrap compiler output differently. Contract equivalence is defined as:

1. identical canonical Solidity content hashes and source names;
2. identical normalized ABI entries and derived function/event/error selectors;
3. identical storage-layout structures;
4. identical creation and deployed bytecode after removal of the Solidity CBOR metadata trailer and normalization to the same complete standard-JSON source graph; and
5. identical linked-library references (currently none).

Constructor arguments and deployment state are verified separately by normalized differential scenarios that use the real factory-driven Core launch path.

### via-IR source-graph normalization

Hardhat supplies all transitive dependencies as explicit standard-JSON sources. Forge supplies dependency files through solc's import callback. With via-IR, those two equivalent input-packaging strategies assign different internal AST/Yul IDs and may order semantically equivalent basic blocks differently. CBOR removal alone therefore does not normalize the native wrapper artifacts.

`verify:contract-equivalence` first proves the native artifacts have identical canonical source hashes, compiler settings, ABI, selectors, storage layout, and linked libraries. It then recompiles the complete canonical Hardhat standard-JSON source graph with the pinned native solc binary and requires exact creation and runtime bytecode equality after CBOR removal. This is the accepted source-graph normalization; a semantic mismatch in either native artifact data or canonical bytecode fails the command.
