import type { Offer } from "./catalog";
export type PaymentStatus = "CREATED" | "CHECKOUT_READY" | "PENDING" | "PAID" | "CANCELLED" | "EXPIRED" | "REFUNDED" | "CHARGEBACK" | "FAILED" | "REVIEW_REQUIRED";
export type VerifiedOrder = {
  id: string; externalReference: string; merchantId: string; applicationId: string;
  amountMinor: number; currency: string; mode: "sandbox"; status: PaymentStatus;
  country: string; sandboxIdSignal: boolean;
  updatedAt: Date; checkoutUrl?: string;
};
export type VerifiedNotification =
  | { kind: "ORDER"; eventKey: string; resourceId: string; eventType: "order"; action: string | null; liveMode: false }
  | { kind: "TEST"; eventKey: string; eventType: "test"; action: "test.created"; liveMode: false }
  | { kind: "UNSUPPORTED"; eventKey: string; eventType: string; action: string | null; liveMode: boolean | null };
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: { purchaseId: string; policy: Offer; merchantId: string; applicationId: string; origin: string }): Promise<VerifiedOrder>;
  retrieveOrder(id: string): Promise<VerifiedOrder>;
  verifyNotification(request: Request): Promise<VerifiedNotification>;
}
