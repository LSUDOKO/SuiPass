# Move Package Management

URL: https://docs.sui.io/develop/manage-packages/move-package-management

Using an agent? Try this prompt
```
Inspect this Move package's Move.toml, Move.lock, and dependencies. Fix dependency declarations, prefer MVR where appropriate, and verify sui move build works.
```

AMove package **Package** Smart contracts on Sui. is a collection ofMove **Move** An open source programming language used for all activity on Sui.modules **Module** A component of a Move package that defines interaction with on-chain objects. that you publish together as a singleobject **Object** The basic unit of storage on Sui. on the Sui blockchain.Packagescan depend on otherpackagesand can be upgraded over time while maintaining their onchain identity. TheMove packagemanager helps you manage dependencies and publishpackagesto the network.

info
Version 1.63 introduced major changes to theMove packagesystem. This document describes the new system. See [automated address management](/develop/manage-packages/automated-address-management) for the documentation on the old system, and [the migration guide](/references/package-managers/package-manager-migration) for a description of the differences and how to migrate to the new system.

Active environment not found
If the CLI displays `Your active environment is not present in Move.toml` , the most likely cause is that you are on a local or ephemeral network(Localnet **Localnet** Local network you can run on your own machine for optimized development. ,Devnet **Devnet** For developing and testing new features. ). These networks should not be added to the `[environments]` section. Instead, use `sui client test-publish` to publish on ephemeral networks.

If you do need to add a persistent environment (for example, a customDevnetdeployment), add an `[environments]` section with the chain ID:

```toml
[environments]
devnet = "aba3e445"
```

Use `sui client chain-identifier` to find the chain ID for your network. Note that `mainnet` and `testnet` are implicitly available and do not need to be listed.

## Package-related files

Configure yourpackageby providing a manifest file ( `Move.toml` ) in the root of thepackagedirectory. This file contains metadata about thepackageand its list of dependencies.

When you build aMove packagefor the first time, thepackagemanagement system uses the information in the manifest file to find the source code for thepackage's dependencies. The system stores the exact versions of the dependencies in a lockfile ( `Move.lock` ). The system calls this process pinning.

For example, the manifest might specify a dependency on a branch of a git repository. Thepackagesystem pins that dependency to a specific commit so that subsequent builds use exactly the same source.

You should commit the `Move.lock` file to source control so that your collaborators, CI jobs, and users who want to verify the source code are all using the same dependency versions. Thepackagesystem only repins the dependencies if your manifest file changes or if you run the `sui move update-deps` command. You should never edit `Move.lock` manually.

The third file that thepackagemanagement system uses is the publication file ( `Published.toml` ). Each time you publish yourpackage, thepackagesystem updates this file with metadata about the publication, such as its onchainaddress **Address** A unique, anonymous identity on a blockchain network. , upgrade capabilityaddress, and information about the compiler version used to build thepackage. The `Published.toml` file should be committed to source control.

Finally, the `test-publish` command makes use of ephemeral publication files, typically named `Pub.<env-name>.toml` . These files contain information about temporary publications that are not intended to be shared, such as publications to local networks. These files should not be committed to source control.

## Dependencies

Dependencies allow yourpackageto use code from otherpackages.

Dependency security
For audited or production builds, pin dependencies to exact revisions (a full 40-character commit hash or an `mvr` version that resolves to a fixedpackageID) rather than relying on mutable branches that can change underneath you. Do not commit ephemeral publication files ( `Pub.*.toml` ) or local-devaddressesto source control. See [Security Best Practices](/develop/security/best-practices) for more.

### Adding dependencies

To add a dependency, add a line to the `[dependencies]` section of your manifest. For example, to depend on the `mvr`package`@potatoes/ascii` , write:

```toml
[package]
name = "example"

[dependencies]
ascii = { r.mvr = "@potatoes/ascii" }
```

Then refer tomodulesin the `ascii`packagein yourMovesource code:

```move
module example::example_module;

use ascii::ascii;
use ascii::char;
```

When you build thispackage, thepackagesystem downloads and uses the source code for the asciipackage. When published, thepackagelinks to the onchainpackageobjectreferenced from the ascii `Published.toml` file.

### Dependency types

TheMove packagesystem supports 4 types of dependencies, each suited for different use cases:

- Moveregistry ( `mvr` ) dependencies are the recommended way to depend on publishedpackagesfrom the ecosystem.
- Local dependencies are used when a single repository contains multiplepackages.
- Git dependencies can be used to depend onpackagesthat have not yet been published toMoveregistry.
- System dependencies are used for built-inpackagesthat are part of Sui.
The remainder of this section describes these dependency types in detail.

#### Moveregistry ( `mvr` ) dependencies (recommended)

The preferred way to depend on anotherpackageis using theMoveregistry, called `mvr` . The [Move registry](https://moveregistry.com/) is an onchain database linking publishedpackageswith their source code.

To depend on apackagewith `mvr` name `@example/package` , add `example = { r.mvr = "@example/package" }` to your `[dependencies]` section.

**Advantages:**

- Automatically resolves correct version for your environment(Mainnet **Mainnet** Production network for live transactions and real-value assets. andTestnet **Testnet** Staging network for testing changes before production deployment. ).
- Ensurespackagesource code is verified and available.
- Simplest way to depend on publishedpackages.

#### Local dependencies

Local dependencies are useful when you want to depend on anotherpackagein the same repository. For example, if your repository containsMove packagesin directories `packages/a` and `packages/b` and you wantpackage`a` to depend onpackage`b` , then you would add `b = { local = "../b" }` to `packages/a/Move.toml` .

**Advantages:**

- Fast iteration during development.
- No need to publishpackagesto test changes.
- Keep relatedpackagesin sync.

#### Git dependencies

Git dependencies can be used to depend onpackagesstored in git repositories. A git dependency must include the repository URL, the subdirectory inside the repository that contains thepackage, and a revision (branch, tag, or 40 character commit hash). For example, to add a dependency to the `usdc`package, you could add the following to your manifest:

```toml
[dependencies]
usdc = { git = "https://github.com/circlefin/stablecoin-sui.git", subdir = "packages/usdc", rev = "master" }
```

Manifest files are written in TOML, which also allows you to expand inline tables. The preceding example is equivalent to:

```toml
[dependencies.usdc]
git = "https://github.com/circlefin/stablecoin-sui.git"
subdir = "packages/usdc"
rev = "master"
```

caution
Although you can use a shortened commit hash, doing so requires downloading the entire git history, which is less efficient than including the full 40 character hash.

#### System dependencies

info
System dependencies do not exist in the old system, and implicit dependencies work differently.

Severalpackagesare built into Sui. The `system` dependency type can be used to depend on thesepackages. The available systempackagesare `std` , `sui` , `sui_system` , `bridge` , and `deepbook` .

However:

- The `std` and `sui`packagesare implicitly included unless you write `implicit-dependencies = false` in your `[package]` section. You do not need to explicitly include them.
- The `deepbook` systempackageis for the deprecatedDeepBook **DeepBook** A decentralized central limit order book (CLOB) built on Sui. version 2. New applications should useDeepBookversion 3 by adding `deepbook = { mvr = "@deepbook/core" }` .
To include a system dependency, write `{ system = "<name>" }` . For example, to use `sui_system` , add `sui_system = { system = "sui_system" }` to your `[dependencies]` section.

### Advanced dependency configuration

There are additional fields that can be used with any of the 4 dependency types: `rename-from` , `override` , and `modes` .

#### Renaming dependencies

info
`rename-from` does not exist in the old system.

The `rename-from` field is used for depending on multiplepackagesthat have the same name. By default, thepackagesystem checks that the name you give to a dependency is the same as the name that the dependency gives itself. However, the `rename-from` field lets you change the name you use. For example, if `@a/math` and `@b/math` both refer topackagesnamed `math` , you could depend on both of them by writing:

```toml
[dependencies]
math_a = { r.mvr = "@a/math", rename-from = "math" }
math_b = { r.mvr = "@b/math", rename-from = "math" }
```

Then yourMovecode could refer to both of them:

```move
use math_a::signed;
use math_b::muldiv;
```

#### Overriding dependency versions

The `override` flag is used for combiningpackagesthat depend on different versions of the samepackage. TheMove packagesystem requires that there is only 1 version of eachpackagein use within apackage. For example, suppose that yourpackage`a` wants to depend onpackages`b` and `c` , but that `b` depends on version 1 of `d` , and `c` depends on version 2 of `d` :

Thepackagesystem does not allow this by default, because running code inpackage`a` would require both versions 1 and 2 of `d` .

By adding `override = true` to a dependency, you force all of your dependencies to use the specified version of the dependency. In the preceding example, you could add an override dependency on `d` version 2, which would cause `b` to use version 2 of `d` instead of version 1.

You are only allowed to overridepackagesto newer versions. In the example you could not add an override dependency on version 1 of `d` because it would force `c` to downgrade.

#### Test-only and moded dependencies

The `modes` field lets you add dependencies that are only used in specific modes, such as test mode. If no `modes` field is provided, the dependency is included in all modes. For example, to include the `ascii` dependency for testing only, you would write:

```toml
ascii = { r.mvr = "@potatoes/ascii", modes = ["test"] }
```

This dependency is included whenever you run `sui move test` or pass `-m test` to any `sui move` command.

info
There is not currently a way to have different dependencies in different modes, only to include or omit a dependency based on the mode.

## Environments

info
The oldpackagesystem only maintains different publicationaddressesfor different chain IDs. Most of the features in this section are new.

Move packagesare commonly published on bothMainnetandTestnet, and often there are different versions published to each of the networks. TheMove packagesystem allows you to manage multiple deployments using environments.

Buildingpackagesis always done relative to a build environment. The environment determines which dependencypackagesto use, whichaddressesto use, and other information that changes from network to network. By default, the command line uses your active CLI environment to choose the build environment, but you can override this with the `-e <env>` option.

By default, the available environments are `mainnet` and `testnet` , but you can add additional environments by including an `[environments]` section in your manifest. For example, if you wanted to maintain a public deployment of yourpackageonDevnet, you could add a `devnet` entry to your manifest:

```toml
[environments]
devnet = "aba3e445"
```

The right-hand side of the entry is the chain identifier for the network. You can find the chain ID using `sui client chain-identifier` . The chain identifier is used to ensure dependencies agree on the meaning of the environment name, and to resetpackageaddressesif the network is wiped and restarted.

caution
Only include an environment in your manifest if you expect otherpackagesto link against yourpackageon that network. You usually do not want to include local networks in your manifest, because they are typically short-lived and private. Instead, you should consider using the `test-publish` command to publish yourpackageand its dependencies on a local network. The `test-publish` command gives you much more flexibility to manage your deployment.

Environments can have the same chain ID, and this can be useful if you wish to maintain multiple deployments of yourpackageon the same network. For example, if you want to maintain an alpha and a beta deployment of yourpackageonTestnet, you could add separate environments:

```toml
[environments]
testnet_alpha = "4c78adac"
testnet_beta = "4c78adac"
```

This causes thepackagesystem to maintain separate publishedaddressesfor each environment in `Published.toml` , and allows you to specify different dependencies for the differentpackageversions.

### Environment-specific dependencies

You can replace dependencies in different environments using the `[dep-replacements.<env>]` section of the manifest. For example, if you want to use different branches of the `codec` library forMainnetandTestnet, you could write:

```toml
[dependencies]
codec = { git = "https://github.com/sui-potatoes/app.git", subdir = "packages/codec", rev = "codec@testnet-v2" }

[dep-replacements.mainnet]
codec = { git = "https://github.com/sui-potatoes/app.git", subdir = "packages/codec", rev = "codec@mainnet-v2" }
```

This is easier to achieve if you are using `mvr` , which automatically resolves theMainnetorTestnetversion depending on the build environment:

```toml
[dependencies]
codec = { r.mvr = "@potatoes/codec" }
```

info
The `git` fields are currently not merged between `[dependencies]` and `[dep-replacements]` . For example, you cannot give a different `rev` field in the `[dep-replacements]` ; you must also include the `git` field. Moreover, if you do provide a `git` field, the `subdir` and `rev` fields are not copied over.

#### Environment-specific dependency configuration

There are additional fields that you can provide for dependencies in the `dep-replacements` section that only make sense for a specific environment: `use-environment` , `published-at` , and `original-id` .

The `use-environment` field indicates which of the dependency's environments should be used. For example, if you want to depend on apackagein the `testnet_beta` environment, you could add `use-environment = "testnet_beta"` to the dependency in the `[dep-replacements.testnet]` section.

The `published-at` and `original-id` can be used to override the publishedaddressfor a dependency. If you include either of these fields, you must include both of them.

The `published-at` and `original-id` fields are only useful in the case where a dependency has not properly published their `Published.toml` file (for example, many legacypackagesonly include theaddressfor a single environment). In this case, you can override theaddressesthat yourpackageuses for the dependency.

The `published-at` field should contain theaddressof thepackageversion that you want to use.

The `original-id` field should contain theaddressof the first version of thepackage, which is used by thepackagesystem to determine whether 2packagesare different versions of the samepackageor are differentpackagesaltogether.

## Working withMove packages

### Building and testingpackages

When you run `sui move build` or `sui move test` , the system ensures you have all dependencies cached in your `~/.move` directory. It first checks whether the lockfile is current, and if the lockfile is not current, it repins all of the dependencies for your build environment. It then checks whether thepackagesare cached, and if not it downloads them.

The system always fetches after pinning, so you do not need to connect to a network unless a dependency needs repinning because the manifest changed or you ran `update-deps` .

### Updating dependencies

Run `sui move update-deps` to repin all of your dependencies. This redownloads the latest compatible versions without changing your manifest file.

### Publishing and upgrading

During normalpackagepublication and upgrades ( `sui client publish` or `sui client upgrade` ), the system rechecks that the dependencies are published on the given network and that the relevant chain IDs are consistent. The system also ensures that the additional onchain linkage requirements are satisfied. For example, onchainpackagescan have extra dependencies in their linkage that they do not actually use, so the system needs to include the onchain linkages.

The system updates the publication file ( `Published.toml` ) to include the updated publication information. The publication file contains an entry for each environment that has a published version of thepackage. The entry contains the publishedaddress, original ID (theaddressof the first version of thepackage), the version number, the upgrade capability, and information about the build configuration that can be used for source validation. Here is an example publication file:

```toml
[published.mainnet]
chain-id = "35834a8a"
original-id = "0x9c11913b6be956a7020cb9e120f03f396e52c3b766164c6163569ac9d7fabe06"
published-at = "0x9c11913b6be956a7020cb9e120f03f396e52c3b766164c6163569ac9d7fabe06"
version = 2
toolchain-version = "<toolchain-version>"
build-config = { flavor = "sui", edition = "2024" }
upgrade-capability = "0x34f7cf31a0a12f81252ab947cb51146bc8138fa5adb3f1fe38e244734319d73c"

[published.testnet]
chain-id = "4c78adac"
published-at = "0x9813c40d93200714a1f7c9b9733ebb537e7dc60fd4b29148f7bcc0e857793813"
original-id = "0x9813c40d93200714a1f7c9b9733ebb537e7dc60fd4b29148f7bcc0e857793813"
version = 1
toolchain-version = "<toolchain-version>"
build-config = { flavor = "sui", edition = "2024" }
upgrade-capability = "0x34f7cf31a0a12f81252ab947cb51146bc8138fa5adb3f1fe38e244734319d73c"
```

You should commit the publication file to source control so that otherpackagescan depend on yourpackage.

You can also publish or upgrade using the `sui client ptb` command. See [Building Programmable Transaction Blocks](/develop/transactions/ptbs/building-ptb) for details.

info
In the old system, the `Published.toml` information was stored in `Move.lock` .

## Ephemeral publication

info
The oldpackagemanagement system does not support ephemeral publication.

By design, the `Published.toml` file should only record publications to persistent environments likeMainnetandTestnet. Do not commitaddressesfor ephemeral publications on local networks orDevnetto source control.

Instead, thepackagemanager supports ephemeral publication of apackageand its dependencies for testing. The `sui client test-publish` command works like a normal publish, except that the system reads the publicationaddressesforpackagesand writes them to a separate file.

The command `sui client test-publish --pubfile-path <pubfile> --build-env <env>` builds the rootpackagefor the `<env>` environment (see the build environment ) and then publishes it to a chain using theaddressesfrom the ephemeral publication file `<pubfile>` .

If `<pubfile>` is omitted, it defaults to `Pub.<env-name>.toml` where `<env-name>` is the name of the active CLI environment, irrespective of the environments defined in the manifest. This file contains theaddressesto use for publication.

You can also prepare bytecode for publication without actually publishing it by passing `--pubfile-path <pubfile>` to `sui move build --dump-bytecode-as-base64` :

```sh
sui move build --dump-bytecode-as-base64 --pubfile-path Pub.localnet.toml --build-env testnet
```

The format of an ephemeral publication file is as follows:

```toml
# generated by move
# this file contains metadata from ephemeral publications
# this file should not be committed to source control

build-env = "mainnet"
chain-id = "localnet chain ID"

[[published]]
source = "/home/User/move/packages/package1"
published-at = "..."
original-id = "..."
upgrade-cap = "..."

[[published]]
source = { git = "...", rev = "...", path = "..." }
published-at = "0x000000000000000000000000000000000000000000000000000000000000cccc"
original-id = "0x000000000000000000000000000000000000000000000000000000000000cc00"
upgrade-cap = "0x000000000000000000000000000000000000000000000000000000000011cc00"

[[published]]
source = { local = "/home/User/move/packages/package2" }
published-at = "0x0000000000000000000000000000000000000000000000000000000000001234"
original-id = "0x0000000000000000000000000000000000000000000000000000000000005678"
upgrade-cap = "0x000000000000000000000000000000000000000000000000000000000022cc00"
```

caution
You should not commit ephemeral publication files to source control because they contain information that is only relevant in a local development environment, such asLocalnetaddressesand absolute paths. It is encouraged to add `Pub.*.toml` to your `.gitignore` file.

Although publication files and ephemeral publication files are similar, they hold different information:

| Feature | Persistent networks ( `Published.toml` ) | Ephemeral networks ( `Pub.<env>.toml` ) 
| **Networks** | Mainnet,Testnet | Localnet,Devnet 
| **Contents** | Yourpackageaddressesonly | Packageand dependencyaddresses 
| **Scope** | Multiple networks in 1 file | Single network per file 
| **Commit to source control** | Yes, because others can depend on yourpackage | No, because it contains local development data 
| **Created by** | `sui client publish` | `sui client test-publish` 

### The build environment

Packagescan have different dependencies in different environments. Specify a real environment when building apackagefor ephemeral publication using the `--build-env <env>` flag. This real environment is the build environment.

If `--build-env <env>` is omitted, it defaults to the `build-env` name of the file at `<file>` . If that is missing, the system errors. The build environment determines how the system resolves dependencies for thepackage.

For example, if you want to build and publish theTestnetversion of yourpackageonLocalnet, you would switch your CLI's active environment toLocalnet, and run with `--build-env testnet` :

```sh
sui client env switch localnet
sui client test-publish --build-env testnet
```

### Ephemerally publishing dependencies

The ephemeral publication file format is designed to make it straightforward to publish your dependencies along with your mainpackage. There are two ways to do this: manually or automatically.

To manually publish your dependencies, use the same ephemeral publication file when publishing all of your dependencies. For example, suppose you have directories `packages/a` and `packages/b` , and that `b` depends on `a` . You could run the following:

```sh
cd packages/a
sui client test-publish --build-env testnet --pubfile-path ../Pub.localnet.toml

cd ../b
sui client test-publish --build-env testnet --pubfile-path ../Pub.localnet.toml
```

When you publish `a` , the `packages/Pub.localnet.toml` file is updated with an entry with `a` 'sLocalnetaddress. Then when you publish `b` , it takes `a` 'saddressfrom `packages/Pub.localnet.toml` , and also writes `b` 'sLocalnetaddress.

You can also automate this process using the `--publish-unpublished-deps` command-line argument. In the same example, you could run:

```sh
cd packages/b
sui client test-publish --build-env testnet --publish-unpublished-deps`
```

This creates a fresh publication of each of `a` 's dependencies, then publishes `a` , and records all of theaddressesto `Pub.localnet.toml` .

The system identifies entries of an ephemeral publication file by the `source` field. These fields are pinned dependencies, so they might be different from the dependencies written in your manifest file, however they should match the `source` fields in the lockfile.

## Local development workflow

For iterative development onLocalnet:

1. Start the local network: `sui start --with-faucet --force-regenesis`
2. Publish with test-publish (no permanent record): `sui client test-publish`
3. After each code change, re-run `sui client test-publish` for a fresh deployment.
Use `test-publish` forLocalnetbecause it avoids polluting `Published.toml` with ephemeraladdressesthat change on every genesis reset.

## Publishing from TypeScript

To publish apackagefrom TypeScript, first build it with the CLI, then submit the compiledmodulesin atransaction **Transaction** A number of commands that execute on inputs to define the result of the transaction. :

```typescript
import { execSync } from 'child_process';
import { Transaction } from '@mysten/sui/transactions';

// Build and get compiled modules + dependencies
const { modules, dependencies } = JSON.parse(
  execSync('sui move build --dump-bytecode-as-base64 --path ./your_package', {
    encoding: 'utf-8',
  }),
);

const tx = new Transaction();
const [upgradeCap] = tx.publish({ modules, dependencies });
tx.transferObjects([upgradeCap], tx.pure.address(senderAddress));
```

## Reading publish output

After running `sui client publish --json` , the response includes:

| Field | Description 
| `digest` | Transactionhash. 
| `effects.created` | Array of objects created, including thepackageobject. 
| `objectChanges` | Detailed list of created objects with types. 
| `events` | Publication events (BCS-encoded in CLI output). 

To get human-readable event data, query thetransactionthrough the RPC with `showEvents: true` , which returns `parsedJson` instead of raw BCS.

To capture only the JSON output (without build logs), redirect stderr:

```sh
$ sui client publish --json 2>/dev/null | jq '.objectChanges[] | select(.type == "published")'
```

Automatic framework dependencies
The `Sui` and `MoveStdlib`packagesare automatically included as dependencies. You do not need to list them in `[dependencies]` .

## Register yourpackageon `mvr`

Once you have published yourpackage, you should consider adding it to theMoveregistry so that others can easily depend on it. See [the Move registry documentation](https://docs.suins.io/move-registry/managing-package-info) for more information.

### Related topics

[Automated Address Management
Legacy documentation for the pre-v1.63 Move.lock-based address tracking system. For the current package system, see Move Package Management.](/develop/manage-packages/automated-address-management) [Package Management Migration
Learn how to migrate from the previous package management system to the new, optimized system.](/references/package-managers/package-manager-migration) [Security Best Practices
Overview of security best practices on Sui.](/develop/security/best-practices) [Building Transactions
Using the Sui TypeScript SDK, you can create programmable transaction blocks to perform multiple commands in a single transaction.](/develop/transactions/ptbs/building-ptb)
