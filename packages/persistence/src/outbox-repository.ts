export type ClaimedOutboxEvent = Readonly<{
  actionDigest: string;
  deliveryAttempt: number;
  effectType: string;
  eventId: string;
  leaseExpiresAt: string;
  leaseToken: string;
  organizationId: string;
  payload: unknown;
}>;

export interface OutboxRepository {
  acknowledge(
    organizationId: string,
    eventId: string,
    leaseToken: string,
  ): Promise<void>;
  claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedOutboxEvent | null>;
  release(
    organizationId: string,
    eventId: string,
    leaseToken: string,
    retryDelaySeconds: number,
  ): Promise<void>;
}
