import { proto } from '@hiero-ledger/proto';
import {
  AccountId,
  BatchTransaction,
  Client,
  NftId,
  PrivateKey,
  TokenBurnTransaction,
  TokenId,
  TokenUnfreezeTransaction,
  TopicMessageSubmitTransaction,
  TransactionId,
  TransferTransaction,
  type Transaction,
} from '@hiero-ledger/sdk';
import { describe, expect, it } from 'vitest';

import {
  createDualTokenSettlementIntent,
  DUAL_TOKEN_SETTLEMENT_OPERATIONS,
  type DualTokenSettlementIntentV2,
} from '../scripts/lib/hedera-dual-token-guard.js';
import {
  dualTokenCommitmentMessage,
  verifyDualTokenWireBatch,
  type DualTokenWireTrustedSigners,
} from '../scripts/lib/hedera-dual-token-wire-verifier.js';

interface FixtureKeys {
  readonly batch: PrivateKey;
  readonly controlFreeze: PrivateKey;
  readonly controlHolder: PrivateKey;
  readonly controlSupply: PrivateKey;
  readonly extra: PrivateKey;
  readonly operator: PrivateKey;
  readonly payableHolder: PrivateKey;
  readonly payableSupply: PrivateKey;
  readonly topic: PrivateKey;
}

interface Fixture {
  readonly bytes: Uint8Array;
  readonly intent: DualTokenSettlementIntentV2;
  readonly keys: FixtureKeys;
  readonly trustedSigners: DualTokenWireTrustedSigners;
}

interface FixtureOptions {
  readonly allowance?: boolean;
  readonly extraInner?: boolean;
  readonly extraTransferSigner?: boolean;
  readonly omitUnfreezeRoleSigner?: boolean;
  readonly swapFirstTwo?: boolean;
  readonly transferAmountDelta?: number;
  readonly wrongMessage?: boolean;
  readonly wrongTopic?: boolean;
}

const AMOUNT = 48_000;
const IDS = {
  controlHolder: '0.0.7002',
  controlToken: '0.0.6002',
  operator: '0.0.5001',
  payableHolder: '0.0.7001',
  payableToken: '0.0.6001',
  settlementToken: '0.0.6003',
  topic: '0.0.8001',
  treasury: '0.0.5001',
} as const;

function keys(): FixtureKeys {
  return {
    batch: PrivateKey.generateECDSA(),
    controlFreeze: PrivateKey.generateECDSA(),
    controlHolder: PrivateKey.generateECDSA(),
    controlSupply: PrivateKey.generateECDSA(),
    extra: PrivateKey.generateECDSA(),
    operator: PrivateKey.generateECDSA(),
    payableHolder: PrivateKey.generateECDSA(),
    payableSupply: PrivateKey.generateECDSA(),
    topic: PrivateKey.generateECDSA(),
  };
}

function raw(key: PrivateKey): string {
  return key.publicKey.toStringRaw();
}

function requiredBytes(
  value: Uint8Array | null | undefined,
  label: string,
): Uint8Array {
  if (value === null || value === undefined) {
    throw new Error(`fixture ${label} is missing`);
  }
  return value;
}

function trusted(value: FixtureKeys): DualTokenWireTrustedSigners {
  return {
    controlFreezeKey: raw(value.controlFreeze),
    controlHolderKey: raw(value.controlHolder),
    controlSupplyKey: raw(value.controlSupply),
    operatorKey: raw(value.operator),
    payableHolderKey: raw(value.payableHolder),
    payableSupplyKey: raw(value.payableSupply),
    topicSubmitKey: raw(value.topic),
  };
}

function candidateSize(bytes: Uint8Array): number {
  const transaction = proto.TransactionList.decode(bytes).transactionList[0];
  if (transaction === undefined) throw new Error('fixture has no candidate');
  return proto.Transaction.encode(transaction).finish().byteLength;
}

async function buildFixture(
  options: FixtureOptions = {},
  fixtureKeys = keys(),
): Promise<Fixture> {
  const client = Client.forTestnet()
    .setOperator(IDS.operator, fixtureKeys.operator)
    .setMaxNodesPerTransaction(1);
  try {
    const innerIds = Array.from({ length: 5 }, () =>
      TransactionId.generate(AccountId.fromString(IDS.operator)),
    );
    const outerId = TransactionId.generate(AccountId.fromString(IDS.operator));
    const validStart = innerIds[0]?.validStart?.seconds.toNumber();
    if (validStart === undefined) throw new Error('fixture has no valid start');

    const assemble = async (
      declaredBytes: number,
    ): Promise<{
      readonly bytes: Uint8Array;
      readonly intent: DualTokenSettlementIntentV2;
    }> => {
      const intent = createDualTokenSettlementIntent({
        actionBeneficiaryAccountId: IDS.payableHolder,
        actionDigest: 'a'.repeat(64),
        amountAtoms: String(AMOUNT),
        auditTopicId: IDS.topic,
        authorizationEvidenceHash: 'b'.repeat(64),
        authorizationPrecommitHash: 'c'.repeat(64),
        batchBytes: declaredBytes,
        batchKey: raw(fixtureKeys.batch),
        controlHolderAccountId: IDS.controlHolder,
        controlSerial: 2,
        controlTokenId: IDS.controlToken,
        innerTransactionIds: innerIds.map((id) => id.toString()),
        invoiceDigest: 'd'.repeat(64),
        network: 'hedera:296',
        operations: DUAL_TOKEN_SETTLEMENT_OPERATIONS,
        outerTransactionId: outerId.toString(),
        payableHolderAccountId: IDS.payableHolder,
        payableSerial: 1,
        payableTokenId: IDS.payableToken,
        payerAccountId: IDS.operator,
        schemaVersion: 'hedera-dual-token-settlement-intent.v2',
        settlementAssetTokenId: IDS.settlementToken,
        treasuryAccountId: IDS.treasury,
        validDurationSeconds: 120,
        validStartEpochSeconds: validStart,
      });

      let unfreeze = await new TokenUnfreezeTransaction()
        .setTokenId(IDS.controlToken)
        .setAccountId(IDS.controlHolder)
        .setTransactionValidDuration(120)
        .setTransactionId(innerIds[0] as TransactionId)
        .batchify(client, fixtureKeys.batch.publicKey);
      if (!options.omitUnfreezeRoleSigner) {
        unfreeze = await unfreeze.sign(fixtureKeys.controlFreeze);
      }

      const debit = -(AMOUNT + (options.transferAmountDelta ?? 0));
      let transfer = new TransferTransaction();
      transfer = options.allowance
        ? transfer
            .addApprovedTokenTransfer(IDS.settlementToken, IDS.operator, debit)
            .addTokenTransfer(IDS.settlementToken, IDS.payableHolder, -debit)
        : transfer
            .addTokenTransfer(IDS.settlementToken, IDS.operator, debit)
            .addTokenTransfer(IDS.settlementToken, IDS.payableHolder, -debit);
      transfer = transfer
        .addNftTransfer(
          new NftId(TokenId.fromString(IDS.payableToken), 1),
          IDS.payableHolder,
          IDS.treasury,
        )
        .addNftTransfer(
          new NftId(TokenId.fromString(IDS.controlToken), 2),
          IDS.controlHolder,
          IDS.treasury,
        )
        .setTransactionValidDuration(120)
        .setTransactionId(innerIds[1] as TransactionId);
      transfer = await transfer.batchify(client, fixtureKeys.batch.publicKey);
      transfer = await transfer.sign(fixtureKeys.payableHolder);
      transfer = await transfer.sign(fixtureKeys.controlHolder);
      if (options.extraTransferSigner) {
        transfer = await transfer.sign(fixtureKeys.extra);
      }

      let payableBurn = await new TokenBurnTransaction()
        .setTokenId(IDS.payableToken)
        .setSerials([1])
        .setTransactionValidDuration(120)
        .setTransactionId(innerIds[2] as TransactionId)
        .batchify(client, fixtureKeys.batch.publicKey);
      payableBurn = await payableBurn.sign(fixtureKeys.payableSupply);

      let controlBurn = await new TokenBurnTransaction()
        .setTokenId(IDS.controlToken)
        .setSerials([2])
        .setTransactionValidDuration(120)
        .setTransactionId(innerIds[3] as TransactionId)
        .batchify(client, fixtureKeys.batch.publicKey);
      controlBurn = await controlBurn.sign(fixtureKeys.controlSupply);

      const expectedMessage = dualTokenCommitmentMessage(intent, 'SETTLEMENT');
      let hcs = await new TopicMessageSubmitTransaction()
        .setTopicId(options.wrongTopic ? '0.0.8999' : IDS.topic)
        .setMessage(
          options.wrongMessage ? `${expectedMessage} ` : expectedMessage,
        )
        .setMaxChunks(1)
        .setTransactionValidDuration(120)
        .setTransactionId(innerIds[4] as TransactionId)
        .batchify(client, fixtureKeys.batch.publicKey);
      hcs = await hcs.sign(fixtureKeys.topic);

      const inner: Transaction[] = [
        unfreeze,
        transfer,
        payableBurn,
        controlBurn,
        hcs,
      ];
      if (options.swapFirstTwo) {
        [inner[0], inner[1]] = [
          inner[1] as Transaction,
          inner[0] as Transaction,
        ];
      }
      if (options.extraInner) inner.push(payableBurn);

      let batch = new BatchTransaction()
        .setInnerTransactions(inner)
        .setTransactionId(outerId)
        .setTransactionValidDuration(120)
        .freezeWith(client);
      batch = await batch.sign(fixtureKeys.batch);
      batch = await batch.sign(fixtureKeys.operator);
      return { bytes: batch.toBytes(), intent };
    };

    let declaredBytes = 1;
    let assembled = await assemble(declaredBytes);
    for (let index = 0; index < 4; index += 1) {
      const actual = candidateSize(assembled.bytes);
      if (actual === declaredBytes) break;
      declaredBytes = actual;
      assembled = await assemble(declaredBytes);
    }
    if (candidateSize(assembled.bytes) !== assembled.intent.batchBytes) {
      throw new Error('fixture size did not converge');
    }
    return {
      ...assembled,
      keys: fixtureKeys,
      trustedSigners: trusted(fixtureKeys),
    };
  } finally {
    client.close();
  }
}

function verify(fixture: Fixture): ReturnType<typeof verifyDualTokenWireBatch> {
  return verifyDualTokenWireBatch({
    bytes: fixture.bytes,
    commitmentOutcome: 'SETTLEMENT',
    intent: fixture.intent,
    trustedSigners: fixture.trustedSigners,
  });
}

function signOuter(
  body: proto.ITransactionBody,
  keysToSign: readonly PrivateKey[],
): proto.ITransaction {
  const bodyBytes = proto.TransactionBody.encode(body).finish();
  const sigPair = keysToSign.map((key) =>
    key.publicKey._toProtobufSignature(key.sign(bodyBytes)),
  );
  const signed = proto.SignedTransaction.encode({
    bodyBytes,
    sigMap: { sigPair },
  }).finish();
  return { signedTransactionBytes: signed };
}

function withSecondCandidate(
  fixture: Fixture,
  mutateInner: boolean,
): Uint8Array {
  const list = proto.TransactionList.decode(fixture.bytes);
  const first = list.transactionList[0];
  const signed = proto.SignedTransaction.decode(
    requiredBytes(first?.signedTransactionBytes, 'candidate'),
  );
  const body = proto.TransactionBody.decode(
    requiredBytes(signed.bodyBytes, 'candidate body'),
  );
  const transactions = [...(body.atomicBatch?.transactions ?? [])];
  if (mutateInner) {
    const firstInner = transactions[0];
    if (firstInner === undefined) throw new Error('fixture inner is missing');
    transactions[0] = Uint8Array.from(firstInner, (byte, index) =>
      index === firstInner.length - 1 ? byte ^ 1 : byte,
    );
  }
  const secondBody = proto.TransactionBody.create({
    ...body,
    atomicBatch: { transactions },
    nodeAccountID: {
      accountNum: Number(body.nodeAccountID?.accountNum?.toString() ?? '0') + 1,
      realmNum: 0,
      shardNum: 0,
    } as unknown as proto.IAccountID,
  });
  list.transactionList.push(
    signOuter(secondBody, [fixture.keys.batch, fixture.keys.operator]),
  );
  return proto.TransactionList.encode(list).finish();
}

describe('signed HIP-551 dual-token wire verifier', () => {
  it('verifies the exact five-operation body and signer policy', async () => {
    const fixture = await buildFixture();

    expect(verify(fixture)).toEqual({
      batchBytes: fixture.intent.batchBytes,
      commitmentMessage: dualTokenCommitmentMessage(
        fixture.intent,
        'SETTLEMENT',
      ),
      innerTransactionIds: fixture.intent.innerTransactionIds,
      manifestHash: fixture.intent.manifestHash,
      outerCandidates: 1,
      outerTransactionId: fixture.intent.outerTransactionId,
    });
  });

  it('verifies every node candidate when signed inner bytes are identical', async () => {
    const fixture = await buildFixture();

    expect(
      verify({
        ...fixture,
        bytes: withSecondCandidate(fixture, false),
      }).outerCandidates,
    ).toBe(2);
  });

  it('rejects differing inner bytes across node candidates', async () => {
    const fixture = await buildFixture();

    expect(() =>
      verify({ ...fixture, bytes: withSecondCandidate(fixture, true) }),
    ).toThrow('identical signed inner bytes');
  });

  it.each([
    ['changed settlement amount', { transferAmountDelta: 1 }],
    ['approved allowance', { allowance: true }],
    ['wrong HCS topic', { wrongTopic: true }],
    ['wrong HCS message', { wrongMessage: true }],
    ['reordered operations', { swapFirstTwo: true }],
    ['extra operation', { extraInner: true }],
    ['missing role signer', { omitUnfreezeRoleSigner: true }],
    ['extra signer', { extraTransferSigner: true }],
  ] as const)(
    'rejects a validly signed malicious batch with %s',
    async (_label, options) => {
      const fixture = await buildFixture(options);

      expect(() => verify(fixture)).toThrow('unsafe dual-token wire batch');
    },
  );

  it('rejects a cryptographically invalid inner signature', async () => {
    const fixture = await buildFixture();
    const list = proto.TransactionList.decode(fixture.bytes);
    const outer = list.transactionList[0];
    const signedOuter = proto.SignedTransaction.decode(
      requiredBytes(outer?.signedTransactionBytes, 'outer'),
    );
    const outerBody = proto.TransactionBody.decode(
      requiredBytes(signedOuter.bodyBytes, 'outer body'),
    );
    const outerTransactions = outerBody.atomicBatch?.transactions ?? [];
    const innerBytes = outerTransactions[0];
    if (innerBytes === undefined) throw new Error('fixture inner is missing');
    const inner = proto.SignedTransaction.decode(innerBytes);
    const signature = inner.sigMap?.sigPair?.[0]?.ECDSASecp256k1;
    if (signature === null || signature === undefined)
      throw new Error('fixture signature is missing');
    signature[0] = (signature[0] ?? 0) ^ 1;
    const changedInner = proto.SignedTransaction.encode(inner).finish();
    const changedBody = proto.TransactionBody.create({
      ...outerBody,
      atomicBatch: {
        transactions: [changedInner, ...outerTransactions.slice(1)],
      },
    });
    list.transactionList[0] = signOuter(changedBody, [
      fixture.keys.batch,
      fixture.keys.operator,
    ]);

    expect(() =>
      verify({
        ...fixture,
        bytes: proto.TransactionList.encode(list).finish(),
      }),
    ).toThrow('signature 0 is invalid');
  });

  it('rejects an untrusted outer signer even with a valid signature', async () => {
    const fixture = await buildFixture();
    const list = proto.TransactionList.decode(fixture.bytes);
    const outer = list.transactionList[0];
    const signed = proto.SignedTransaction.decode(
      requiredBytes(outer?.signedTransactionBytes, 'outer'),
    );
    const body = proto.TransactionBody.decode(
      requiredBytes(signed.bodyBytes, 'outer body'),
    );
    list.transactionList[0] = signOuter(body, [
      fixture.keys.batch,
      fixture.keys.extra,
    ]);

    expect(() =>
      verify({
        ...fixture,
        bytes: proto.TransactionList.encode(list).finish(),
      }),
    ).toThrow('trusted signer set');
  });
});
