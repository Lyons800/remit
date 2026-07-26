import { createRequire } from 'node:module';

import {
  buildExtractionPrompt,
  buildExtractionRecord,
  hashInvoice,
  type ExtractionRecord,
} from './extraction.js';

/**
 * The only file in the 0G lane that touches the network.
 *
 * Loaded through createRequire because the SDK's ESM build is broken on
 * Node 24 — its index.mjs re-exports names its own chunk does not provide.
 * The CJS build loads cleanly.
 *
 * The round trip, per the SDK's own surface:
 *
 *   createZGComputeNetworkBroker(wallet)
 *   ledger.addLedger(amount)                  one-time account funding
 *   inference.listServiceWithDetail()         pick a healthy TeeML chatbot
 *   inference.acknowledgeProviderSigner(p)    one-time signer acknowledgement
 *   inference.getServiceMetadata(p)           { endpoint, model }
 *   inference.getRequestHeaders(p, content)   per-request auth
 *   POST endpoint/chat/completions            OpenAI-shaped body
 *   inference.processResponse(p, id, output)  signature check
 *
 * Every path funnels through buildExtractionRecord, which fails closed: no
 * verified signature can ever produce VERIFIED, and no failure can produce
 * fields.
 */

const RPC_BY_NETWORK = {
  mainnet: 'https://evmrpc.0g.ai',
  testnet: 'https://evmrpc-testnet.0g.ai',
} as const;

export type ZeroGNetwork = keyof typeof RPC_BY_NETWORK;

export interface ServiceEntry {
  readonly provider: string;
  readonly model: string;
  readonly serviceType?: string;
  readonly verifiability?: string;
  readonly healthMetrics?: { readonly status?: string };
}

export interface PickedProvider {
  readonly provider: string;
  readonly model: string;
}

export interface ZeroGExtractionClientOptions {
  readonly privateKey: string;
  readonly network?: ZeroGNetwork;
  /** Pin the model shown to judges rather than taking the first healthy one. */
  readonly preferredModel?: string;
  readonly fetchImpl?: typeof fetch;
}

/** Healthy, TeeML, text-capable — the only class of provider accepted. */
export function pickTeeTextProvider(
  services: readonly ServiceEntry[],
  preferredModel?: string,
): PickedProvider | null {
  const eligible = services.filter(
    (service) =>
      (service.verifiability ?? '').toLowerCase() === 'teeml' &&
      service.serviceType === 'chatbot' &&
      (service.healthMetrics?.status ?? 'unknown') === 'healthy',
  );
  if (eligible.length === 0) return null;

  const preferred =
    preferredModel === undefined
      ? undefined
      : eligible.find((service) => service.model === preferredModel);
  const chosen = preferred ?? eligible[0];
  return chosen === undefined
    ? null
    : { provider: chosen.provider, model: chosen.model };
}

/* The SDK is untyped through the CJS boundary, so its surface is declared
   structurally here rather than pretending to import its types. */
interface InferenceApi {
  listServiceWithDetail(): Promise<readonly ServiceEntry[]>;
  acknowledged(provider: string): Promise<boolean>;
  acknowledgeProviderSigner(provider: string): Promise<void>;
  getServiceMetadata(
    provider: string,
  ): Promise<{ endpoint: string; model: string }>;
  getRequestHeaders(
    provider: string,
    content: string,
  ): Promise<Record<string, string>>;
  processResponse(
    provider: string,
    chatId: string,
    output: string,
  ): Promise<boolean>;
}

interface LedgerApi {
  getLedger(): Promise<{ totalBalance?: bigint; balance?: bigint } | null>;
  depositFund(amount: number): Promise<void>;
  addLedger(amount: number): Promise<void>;
}

interface Broker {
  readonly inference: InferenceApi;
  readonly ledger: LedgerApi;
}

interface ChatCompletion {
  readonly id?: string;
  readonly choices?: readonly { readonly message?: { content?: string } }[];
}

const require = createRequire(import.meta.url);

export class ZeroGExtractionClient {
  private broker: Broker | null = null;
  private readonly options: ZeroGExtractionClientOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ZeroGExtractionClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async ensureBroker(): Promise<Broker> {
    if (this.broker !== null) return this.broker;

    const sdk = require('@0gfoundation/0g-compute-ts-sdk') as {
      createZGComputeNetworkBroker(wallet: unknown): Promise<Broker>;
    };
    const { ethers } = require('ethers') as {
      ethers: {
        Wallet: new (key: string, provider: unknown) => unknown;
        JsonRpcProvider: new (url: string) => unknown;
      };
    };

    const rpc = RPC_BY_NETWORK[this.options.network ?? 'testnet'];
    const wallet = new ethers.Wallet(
      this.options.privateKey,
      new ethers.JsonRpcProvider(rpc),
    );
    this.broker = await sdk.createZGComputeNetworkBroker(wallet);
    return this.broker;
  }

  /** One-time setup: create or top up the ledger. Amounts are in 0G tokens. */
  async ensureFunded(minBalance = 0.005, topUp = 0.01): Promise<void> {
    const broker = await this.ensureBroker();
    try {
      const ledger = await broker.ledger.getLedger();
      const raw = ledger?.totalBalance ?? ledger?.balance ?? 0n;
      if (Number(raw) / 1e18 >= minBalance) return;
      await broker.ledger.depositFund(topUp);
    } catch {
      // No ledger yet. Creating one is a payable transaction, so the wallet
      // needs gas as well as balance.
      await broker.ledger.addLedger(topUp);
    }
  }

  async pickProvider(): Promise<PickedProvider | null> {
    const broker = await this.ensureBroker();
    return pickTeeTextProvider(
      await broker.inference.listServiceWithDetail(),
      this.options.preferredModel,
    );
  }

  /**
   * The whole attested round trip.
   *
   * Never throws for quality reasons: every failure returns a record with
   * status UNKNOWN, so callers fail closed without a try/catch at each site.
   * A 0G outage therefore escalates a payment to human approval instead of
   * stopping the system.
   */
  async extractInvoice(invoiceText: string): Promise<ExtractionRecord> {
    const invoiceHash = hashInvoice(invoiceText);
    const unknown = (provider = '', model = ''): ExtractionRecord =>
      buildExtractionRecord({
        invoiceHash,
        provider,
        model,
        rawOutput: '',
        chatId: '',
        teeVerified: null,
      });

    let picked: PickedProvider | null;
    try {
      picked = await this.pickProvider();
    } catch {
      return unknown();
    }
    if (picked === null) return unknown();

    try {
      const broker = await this.ensureBroker();

      if (!(await broker.inference.acknowledged(picked.provider))) {
        await broker.inference.acknowledgeProviderSigner(picked.provider);
      }

      const { endpoint, model } = await broker.inference.getServiceMetadata(
        picked.provider,
      );
      const prompt = buildExtractionPrompt(invoiceText);
      const headers = await broker.inference.getRequestHeaders(
        picked.provider,
        prompt,
      );

      const response = await this.fetchImpl(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
        }),
      });
      if (!response.ok) return unknown(picked.provider, picked.model);

      const body = (await response.json()) as ChatCompletion;
      const chatId = body.id ?? '';
      const rawOutput = body.choices?.[0]?.message?.content ?? '';
      if (rawOutput === '') return unknown(picked.provider, picked.model);

      // The line between VERIFIED and UNVERIFIED.
      let teeVerified: boolean | null;
      try {
        teeVerified = await broker.inference.processResponse(
          picked.provider,
          chatId,
          rawOutput,
        );
      } catch {
        teeVerified = null;
      }

      return buildExtractionRecord({
        invoiceHash,
        provider: picked.provider,
        model: picked.model,
        rawOutput,
        chatId,
        teeVerified,
      });
    } catch {
      return unknown(picked.provider, picked.model);
    }
  }
}
