import type { Offer } from "./catalog";
export type PaymentStatus = "CREATED" | "CHECKOUT_READY" | "PENDING" | "PAID" | "CANCELLED" | "EXPIRED" | "REFUNDED" | "CHARGEBACK" | "FAILED" | "REVIEW_REQUIRED";
export type VerifiedOrder = {
  id: string; externalReference: string; merchantId: string; applicationId: string;
  amountMinor: number; currency: string; mode: "sandbox"; status: PaymentStatus;
  updatedAt: Date; checkoutUrl?: string;
};
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: { purchaseId: string; policy: Offer; merchantId: string; applicationId: string; origin: string }): Promise<VerifiedOrder>;
  retrieveOrder(id: string): Promise<VerifiedOrder>;
  verifyNotification(request: Request): Promise<{ eventKey: string; resourceId: string }>;
}
