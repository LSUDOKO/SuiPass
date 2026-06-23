Available Networks

Walrus Mainnet operates a production-quality storage network using corresponding resources on the Sui Mainnet. The Walrus Testnet operates in conjunction with the Sui Testnet and is used to test new features before they graduate to Mainnet. Alternatively, developers can operate a local instance of both Walrus and Sui for personalized testing.
info

The Network Reference is the canonical source for Walrus endpoints, package IDs, system and staking object IDs, token units, and configuration snippets. This page summarizes the same values with setup context. If a value here differs, the Network Reference is authoritative.
Network parameters

Important fixed system parameters for Mainnet and Testnet are summarized in the following table:
Parameter	Mainnet	Testnet
Sui network	Mainnet	Testnet
Number of shards	1000	1000
Epoch duration	2 weeks	1 day
Maximum number of epochs for which storage can be bought	53	53

Many other parameters, including the system capacity and prices, are dynamic. These parameters are stored in the system object and you can view them with tools like the Walruscan explorer.
Mainnet configuration

The client
parameters for the Walrus Mainnet are:
setup/client_config_mainnet.yaml

# NOTE: walrus-service uses these IDs to detect network defaults. Changing them changes node
# behavior and must be coordinated.
system_object: 0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2
staking_object: 0x10b9d30c28448939ce6c4d6c6e0ffce4a7f8a4ada8248bdad09ef8b70e4a3904
n_shards: 1000
max_epochs_ahead: 53
rpc_urls:
  - https://fullnode.mainnet.sui.io:443

To explore the Walrus contracts, their package IDs are:

    WAL
    package: 0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59

    Walrus package: 0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77

    Subsidies package: 0xd843c37d213ea683ec3519abe4646fd618f52d7fce1c4e9875a4144d53e21ebc

The Walrus client infers these package IDs automatically from the object IDs above, so you do not need to enter them manually in the configuration file. You can also find the latest published package IDs in the Move.lock files in the subdirectories of the contracts directory on GitHub.

The configuration file described on the setup page includes both Mainnet and Testnet configuration.
Testnet configuration

All transactions run on the Sui Testnet and use Testnet WAL and SUI, which have no value.
danger

The state of the network can be wiped at any point and possibly without warning. Do not use this Testnet for any production purposes, as it comes with no availability or persistence guarantees. New features on Testnet might break deployed Testnet apps.

See the Testnet terms of service under which this Testnet is made available.

The configuration parameters for the Walrus Testnet are included in the configuration file described on the getting started guide. If you want only the Testnet configuration, you can get the Testnet-only configuration file. The parameters are:
setup/client_config_testnet.yaml

# NOTE: walrus-service uses these IDs to detect network defaults. Changing them changes node
# behavior and must be coordinated.
system_object: 0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af
staking_object: 0xbe46180321c30aab2f8b3501e24048377287fa708018a5b7c2792b35fe339ee3
exchange_objects:
  - 0xf4d164ea2def5fe07dc573992a029e010dba09b1a8dcbc44c5c2e79567f39073
  - 0x19825121c52080bb1073662231cfea5c0e4d905fd13e95f21e9a018f2ef41862
  - 0x83b454e524c71f30803f4d6c302a86fb6a39e96cdfb873c2d1e93bc1c26a3bc5
  - 0x8d63209cf8589ce7aef8f262437163c67577ed09f3e636a9d8e0813843fb8bf1
n_shards: 1000
max_epochs_ahead: 53
rpc_urls:
  - https://fullnode.testnet.sui.io:443
communication_config:
  tail_handling: detached
  upload_mode: aggressive
  data_in_flight_auto_tune:
    enabled: true

You can find the current Testnet package IDs in the Move.lock files in the subdirectories of the testnet-contracts directory on GitHub.
Exchange Testnet SUI for WAL

The Walrus Testnet uses Testnet WAL tokens for buying storage and staking. Testnet WAL tokens have no value and can be exchanged at a 1:1 rate for Testnet SUI tokens, which also have no value.

Use the official WAL exchange flow on this page for Testnet WAL. Third-party faucets can distribute WAL from a package the Walrus client does not accept.
Prerequisites: Sui wallet and Testnet SUI

    Prerequisites

    Download and install the Sui CLI.

    Create a Sui account.

    Obtain Testnet SUI.

    Download and install Walrus.

After completing the prerequisites, run the following command to exchange SUI for WAL:

walrus get-wal

You can verify that you received Testnet WAL by checking the Sui balances:

sui client balance

If successful, the console responds:

╭─────────────────────────────────────────╮
│ Balance of coins owned by this address  │
├─────────────────────────────────────────┤
│ ╭─────────────────────────────────────╮ │
│ │ coin  balance (raw)     balance     │ │
│ ├─────────────────────────────────────┤ │
│ │ Sui   8869252670        8.86 SUI    │ │
│ │ WAL   500000000         0.50 WAL    │ │
│ ╰─────────────────────────────────────╯ │
╰─────────────────────────────────────────╯

By default, 0.5 SUI are exchanged for 0.5 WAL. To exchange a different amount of SUI, use the --amount option. The value is in MIST/FROST
. To use a specific SUI/WAL exchange object, use the --exchange-id option. Run walrus get-wal --help for more information about these options.
Run a local Walrus network

You can deploy an instance of the Walrus network on your local machine for local testing. Run the script scripts/local-testbed.sh found in the Walrus GitHub repository. Run scripts/local-testbed.sh -h for further usage information. The script generates a configuration file that you can use when running the Walrus client.

You can also spin up a local Grafana instance to visualize the metrics collected by the storage nodes
through cd docker/grafana-local; docker compose up. This works with the default storage node configuration.

The Walrus storage nodes of this local network run on your local machine. By default, the Sui Devnet deploys and interacts with the contracts. To run the local network fully locally, start a local network with sui start --with-faucet --force-regenesis (requires sui version v1.28.0 or higher) and specify localnet when starting the Walrus testbed.
Edit this page
Previous
System Constraints & Considerations
Next
Storage Costs

    Network parameters
    Mainnet configuration
    Testnet configuration
    Exchange Testnet SUI for WAL
    Run a local Walrus network
    Was this page helpful?

Copyright © 2026 Walrus Foundation. All rights reserved.
Privacy • TOS • Tesnet TOS

# Storing Blobs

URL: https://docs.wal.app/docs/http-api/storing-blobs

No public Mainnet publisher
Walrus has no public unauthenticatedpublisher **Publisher** Service interacting with Sui and the storage nodes to store blobs on Walrus; offers a basic `HTTP POST` endpoint to end users. on Mainnet. There are no plans to create one. On Mainnet, run your own authenticatedpublisher (or use the [Upload Relay](/docs/operator-guide/upload-relay) or [TypeScript SDK](/docs/typescript-sdk/sdks) directly). The publicpublisher endpoints below are for Testnet, whereWAL **WAL** The native token of Walrus. has no monetary value.

You can store data using HTTP PUT requests. The following examples use `curl` to storeblobs **Blob** Single unstructured data object stored on Walrus. through apublisher . Set `$PUBLISHER` to apublisher endpoint from the [Network Reference](/docs/network-reference#aggregators-and-publishers) :

```sh
# Store the string `some string` for 1 storage epoch
$ curl -X PUT "$PUBLISHER/v1/blobs" -d "some string"
# Store file `some/file` for 1 storage epoch
$ curl -X PUT "$PUBLISHER/v1/blobs" --upload-file "some/file"
```

Reading a blob right after upload?
When you read through a CDN-frontedaggregator **Aggregator** Service that reconstructs blobs by interacting with storage nodes and exposes a basic `HTTP GET` endpoint to end users. immediately after certification, the CDN might brieflycache **Cache** An aggregator with additional caching capabilities. a `404` from before theblob propagated. If your app knows theblob was just certified, retry with backoff. See [Reading Blobs Right After Upload](/docs/troubleshooting/reading-blobs-after-upload) .

## Configuring storage options

Control how the newblob is created through a combination of query parameters as documented in the OpenAPI specification .

### Storage duration

Specify the lifetime of theblob through the `epochs` parameter. If you omit the parameter,blobs are stored for 1 epoch.

```sh
# Store file `some/file` for 5 storage epochs
$ curl -X PUT "$PUBLISHER/v1/blobs?epochs=5" --upload-file "some/file"
```

### Deletable and permanentblobs

Specify whether ablob is stored as permanent or deletable through a query parameter `permanent=true` or `deletable=true` :

```sh
# Store file `some/file` as a deletable blob:
$ curl -X PUT "$PUBLISHER/v1/blobs?deletable=true" --upload-file "some/file"
```

```sh
# Store file `some/file` as a permanent blob:
$ curl -X PUT "$PUBLISHER/v1/blobs?permanent=true" --upload-file "some/file"
```

caution
Newly storedblobs are deletable by default.

### Sending theblob object to another address

Specify an address to which the resulting `Blob` object is sent using the `send_object_to` parameter:

```sh
# Store file `some/file` and send the blob object to `$ADDRESS`:
$ curl -X PUT "$PUBLISHER/v1/blobs?send_object_to=$ADDRESS" --upload-file "some/file"
```

## Understanding the response

The store HTTP API endpoints return information about storedblobs in JSON format.

### Newly createdblobs

When ablob is stored for the first time, the response contains a `newlyCreated` field with information about it:

```sh
$ curl -X PUT "$PUBLISHER/v1/blobs" -d "some other string"
```

If successful, the response includes the content stored in theblob 's corresponding [Sui object](/docs/system-overview/core-concepts) :

```json
{
  "newlyCreated": {
    "blobObject": {
      "id": "0xe91eee8c5b6f35b9a250cfc29e30f0d9e5463a21fd8d1ddb0fc22d44db4eac50",
      "registeredEpoch": 34,
      "blobId": "M4hsZGQ1oCktdzegB6HnI6Mi28S2nqOPHxK-W7_4BUk",
      "size": 17,
      "encodingType": "RS2",
      "certifiedEpoch": 34,
      "storage": {
        "id": "0x4748cd83217b5ce7aa77e7f1ad6fc5f7f694e26a157381b9391ac65c47815faf",
        "startEpoch": 34,
        "endEpoch": 35,
        "storageSize": 66034000
      },
      "deletable": false
    },
    "resourceOperation": {
      "registerFromScratch": {
        "encodedLength": 66034000,
        "epochsAhead": 1
      }
    },
    "cost": 132300
  }
}
```

### Already certifiedblobs

When thepublisher finds a certifiedblob with the sameblob ID **Blob ID** Cryptographic ID computed from a blob's slivers. and a sufficient validity period, it returns an `alreadyCertified` structure:

```json
{
  "alreadyCertified": {
    "blobId": "M4hsZGQ1oCktdzegB6HnI6Mi28S2nqOPHxK-W7_4BUk",
    "event": {
      "txDigest": "4XQHFa9S324wTzYHF3vsBSwpUZuLpmwTHYMFv9nsttSs",
      "eventSeq": "0"
    },
    "endEpoch": 35
  }
}
```

The `event` field returns the [Sui event ID](/docs/system-overview/core-concepts) that you can use to find the object creation transaction through [Suiscan](https://suiscan.xyz/) or a [Sui SDK](https://docs.sui.io/references/sui-sdks) .

# Reading Blobs

URL: https://docs.wal.app/docs/http-api/reading-blobs

You can readblobs **Blob** Single unstructured data object stored on Walrus. using HTTP GET requests with theirblob ID **Blob ID** Cryptographic ID computed from a blob's slivers. or object ID. Set `$AGGREGATOR` to anaggregator **Aggregator** Service that reconstructs blobs by interacting with storage nodes and exposes a basic `HTTP GET` endpoint to end users. endpoint from the [Network Reference](/docs/network-reference#aggregators-and-publishers) .

Reading a blob right after upload?
When you read through a CDN-frontedaggregator immediately after certification, the CDN might brieflycache **Cache** An aggregator with additional caching capabilities. a `404` from before theblob propagated. If your app knows theblob was just certified, retry with backoff. See [Reading Blobs Right After Upload](/docs/troubleshooting/reading-blobs-after-upload) .

## Reading byblob ID

The following `curl` command reads ablob and writes it to an output file:

```sh
$ curl "$AGGREGATOR/v1/blobs/<BLOB_ID>" -o <FILE_NAME>
```

To print the contents of ablob directly in the terminal:

```sh
$ curl "$AGGREGATOR/v1/blobs/<BLOB_ID>"
```

tip
Modern browsers attempt to sniff the content type for these resources and generally do a good job of inferring content types for media. Theaggregator intentionally prevents sniffing from inferring dangerous executable types such as JavaScript or style sheet types.

## Reading by object ID

You can also readblobs by using the object ID of a Suiblob object or a sharedblob . The following `curl` command downloads theblob corresponding to a Sui object ID:

```sh
$ curl "$AGGREGATOR/v1/blobs/by-object-id/<OBJECT_ID>" -o <FILE_NAME>
```

Downloadingblobs by object ID allows setting HTTP headers. Theaggregator recognizes the following attribute keys and returns the values in the corresponding HTTP headers when present: `content-disposition` , `content-encoding` , `content-language` , `content-location` , `content-type` , and `link` .

## Consistency checks

The consistency checks performed by theaggregator are the same as those [performed by the CLI](/docs/walrus-client/storing-blobs#consistency-checks) . For special use cases, you can enable the [strict consistency check](/docs/system-overview/red-stuff) by adding a query parameter `strict_consistency_check=true` (starting with `v1.35` ). If the writer of theblob is known and trusted, you can disable the consistency check by adding a query parameter `skip_consistency_check=true` (starting with `v1.36` ).

# Quilt HTTP APIs

URL: https://docs.wal.app/docs/http-api/quilt-http-apis

Walrus supports storing and retrieving multipleblobs **Blob** Single unstructured data object stored on Walrus. as a single unit called a [quilt](/docs/system-overview/quilt) . Publishers and aggregators both support quilt operations. Set `$PUBLISHER` and `$AGGREGATOR` to endpoints from the [Network Reference](/docs/network-reference#aggregators-and-publishers) .

## Storing quilts

All query parameters available for storing regular blobs can also be used when storing quilts.

The following example stores 2 files as a quilt with custom identifiers:

```sh
# Store 2 files `document.pdf` and `image.png`, with custom identifiers `contract-v2` and `logo-2024`, respectively:
$ curl -X PUT "$PUBLISHER/v1/quilts?epochs=5" \
  -F "contract-v2=@document.pdf" \
  -F "logo-2024=@image.png"
```

Identifiers must be unique within a quilt and cannot start with `_` . The field name `_metadata` is reserved for Walrus native metadata and does not conflict withuser **User** Any entity or person that wants to store or read blobs on or from Walrus; can act as a Walrus client itself or use the simple interface exposed by publishers and caches. -defined identifiers. See the [Quilt documentation](/docs/system-overview/quilt) for complete identifier restrictions.

The following example stores 2 files with Walrus-native metadata tags:

```sh
# Store 2 files with Walrus-native metadata. `_metadata` must be used as the field name for Walrus native metadata
$ curl -X PUT "$PUBLISHER/v1/quilts?epochs=5" \
  -F "quilt-manual=@document.pdf" \
  -F "logo-2025=@image.png" \
  -F '_metadata=[
    {"identifier": "quilt-manual", "tags": {"creator": "walrus", "version": "1.0"}},
    {"identifier": "logo-2025", "tags": {"type": "logo", "format": "png"}}
  ]'
```

### Store response

The quilt store API returns a JSON response with information about the stored quilt, including the quilt ID ( `blobId` ) and individualblob patch IDs that you can use to retrieve specificblobs later. The actual JSON output is returned as a single line and is formatted here for readability.

```sh
$ curl -X PUT "http://127.0.0.1:31415/v1/quilts?epochs=1" \
  -F "walrus.jpg=@./walrus-33.jpg" \
  -F "another_walrus.jpg=@./walrus-46.jpg"
```

If successful, the response contains theblob object details and the stored quiltblobs :

```json
{
  "blobStoreResult": {
    "newlyCreated": {
      "blobObject": {
        "id": "0xe6ac1e1ac08a603aef73a34328b0b623ffba6be6586e159a1d79c5ef0357bc02",
        "registeredEpoch": 103,
        "blobId": "6XUOE-Q5-nAXHRifN6n9nomVDtHZQbGuAkW3PjlBuKo",
        "size": 1782224,
        "encodingType": "RS2",
        "certifiedEpoch": null,
        "storage": {
          "id": "0xbc8ff9b4071927689d59468f887f94a4a503d9c6c5ef4c4d97fcb475a257758f",
          "startEpoch": 103,
          "endEpoch": 104,
          "storageSize": 72040000
        },
        "deletable": false
      },
      "resourceOperation": {
        "registerFromScratch": {
          "encodedLength": 72040000,
          "epochsAhead": 1
        }
      },
      "cost": 12075000
    }
  },
  "storedQuiltBlobs": [
    {
      "identifier": "another_walrus.jpg",
      "quiltPatchId": "6XUOE-Q5-nAXHRifN6n9nomVDtHZQbGuAkW3PjlBuKoBAQDQAA"
    },
    {
      "identifier": "walrus.jpg",
      "quiltPatchId": "6XUOE-Q5-nAXHRifN6n9nomVDtHZQbGuAkW3PjlBuKoB0AB7Ag"
    }
  ]
}
```

## Reading quilts

You can retrieveblobs from a quilt through theaggregator **Aggregator** Service that reconstructs blobs by interacting with storage nodes and exposes a basic `HTTP GET` endpoint to end users. APIs using their quilt patch ID or their quilt ID and unique identifier. Currently, only 1blob can be retrieved per request. Bulk retrieval of multipleblobs from a quilt in a single request is not yet supported.

### Retrieving by quilt patch ID

test

Eachblob in a quilt has a unique patch ID. Retrieve a specificblob using its patch ID:

```sh
# Retrieve a blob using its quilt patch ID:
$ curl "$AGGREGATOR/v1/blobs/by-quilt-patch-id/6XUOE-Q5-nAXHRifN6n9nomVDtHZQbGuAkW3PjlBuKoBAQDQAA" \
```

You can obtain quilt patch IDs from the store quilt output or by using the [`list-patches-in-quilt`](/docs/walrus-client/storing-blobs#batch-store) CLI command.

### Retrieving by quilt ID and identifier

You can also retrieve ablob using the quilt ID and theblob 's identifier:

```sh
# Retrieve a blob with identifier `walrus.jpg` from the quilt:
$ curl "$AGGREGATOR/v1/blobs/by-quilt-id/6XUOE-Q5-nAXHRifN6n9nomVDtHZQbGuAkW3PjlBuKo/walrus.jpg" \
```

### Response headers

Both methods return the rawblob bytes in the response body. Metadata such as theblob ID **Blob ID** Cryptographic ID computed from a blob's slivers. and tags are returned as HTTP headers:

- `X-Quilt-Patch-Identifier` : The identifier of theblob within the quilt
- `ETag` : The patch ID or quilt ID for caching purposes
- Additional custom headers fromblob tags, if configured
