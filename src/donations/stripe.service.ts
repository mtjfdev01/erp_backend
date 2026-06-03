import { Injectable, HttpException } from "@nestjs/common";
import Stripe from "stripe";

export type StripeRecurringInterval = "day" | "week" | "month" | "year";

export interface StripeRecurringParams {
  interval: StripeRecurringInterval;
  interval_count?: number;
}

export interface CreateStripeCheckoutParams {
  donationId: number;
  amount: number;
  currency?: string;
  successUrl: string;
  cancelUrl: string;
  donorEmail?: string;
  donorName?: string;
  /** When set, creates a subscription with this billing interval. */
  recurring?: StripeRecurringParams;
}

export interface StripeCheckoutResult {
  paymentUrl: string;
  sessionId: string;
}

export interface CreateStripeEmbedParams {
  donationId: number;
  amount: number;
  currency?: string;
  donorEmail?: string;
  donorName?: string;
  /** When set, creates a subscription with this billing interval. */
  recurring?: StripeRecurringParams;
}

export interface StripeEmbedResult {
  clientSecret: string;
  paymentIntentId: string;
  /** Set for recurring: Stripe subscription id */
  subscriptionId?: string;
}

@Injectable()
export class StripeService {
  private stripe: Stripe | null = null;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
    }
  }

  private ensureStripe(): Stripe {
    if (!this.stripe) {
      throw new HttpException(
        "Stripe is not configured. Set STRIPE_SECRET_KEY in environment.",
        500,
      );
    }
    return this.stripe;
  }

  /** For internal services (e.g. named recurring webhook handler). */
  getStripeClient(): Stripe | null {
    return this.stripe;
  }

  private normalizeRecurring(
    recurring?: StripeRecurringParams,
  ): { interval: StripeRecurringInterval; interval_count: number } | null {
    if (!recurring?.interval) return null;
    const interval = String(recurring.interval).toLowerCase() as StripeRecurringInterval;
    const allowed: StripeRecurringInterval[] = ["day", "week", "month", "year"];
    if (!allowed.includes(interval)) {
      throw new HttpException(
        "recurring.interval must be one of: day, week, month, year",
        400,
      );
    }
    const interval_count = Math.max(1, Math.floor(Number(recurring.interval_count ?? 1)));
    if (!Number.isFinite(interval_count)) {
      throw new HttpException("recurring.interval_count must be a positive integer", 400);
    }
    return { interval, interval_count };
  }

  private recurringProductLabel(
    interval: StripeRecurringInterval,
    interval_count: number,
  ): string {
    if (interval_count === 1) {
      const labels: Record<StripeRecurringInterval, string> = {
        day: "Daily donation",
        week: "Weekly donation",
        month: "Monthly donation",
        year: "Yearly donation",
      };
      return labels[interval];
    }
    return `Recurring donation (every ${interval_count} ${interval}s)`;
  }

  /**
   * Create a Stripe Checkout Session for a donation.
   * Amount is in major currency units (e.g. PKR or USD); converted to smallest unit for Stripe.
   */
  async createCheckoutSession(
    params: CreateStripeCheckoutParams,
  ): Promise<StripeCheckoutResult> {
    const stripe = this.ensureStripe();
    const currency = (params.currency || "pkr")
      .toLowerCase()
      .replace(/\s/g, "");
    const isZeroDecimal = ["jpy", "krw", "vnd", "clp"].indexOf(currency) !== -1;
    const unitAmount = isZeroDecimal
      ? Math.round(Number(params.amount))
      : Math.round(Number(params.amount) * 100);

    if (unitAmount < 50) {
      throw new HttpException(
        "Amount is too small for Stripe (minimum 50 smallest units).",
        400,
      );
    }

    const billing = this.normalizeRecurring(params.recurring);
    const isSubscription = billing !== null;
    const stripeCurrency = currency === "pkr" ? "pkr" : currency || "usd";

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? "subscription" : "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            unit_amount: unitAmount,
            ...(billing && {
              recurring: {
                interval: billing.interval,
                interval_count: billing.interval_count,
              },
            }),
            product_data: {
              name: isSubscription
                ? this.recurringProductLabel(billing.interval, billing.interval_count)
                : "Donation",
              description: params.donorName
                ? `Donation from ${params.donorName}`
                : isSubscription
                  ? "Recurring donation"
                  : "Donation",
              metadata: {
                donation_id: String(params.donationId),
              },
            },
          },
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: String(params.donationId),
      metadata: {
        donation_id: String(params.donationId),
      },
      customer_email: params.donorEmail || undefined,
      subscription_data: isSubscription
        ? {
            metadata: { donation_id: String(params.donationId) },
          }
        : undefined,
    });

    if (!session.url) {
      throw new HttpException("Stripe did not return a checkout URL", 502);
    }

    return {
      paymentUrl: session.url,
      sessionId: session.id,
    };
  }

  /**
   * Create a PaymentIntent for embedded payment (Stripe Elements / Payment Element on your page).
   * Returns clientSecret for the frontend to mount the Payment Element and confirm payment.
   */
  async createPaymentIntentForEmbed(
    params: CreateStripeEmbedParams,
  ): Promise<StripeEmbedResult> {
    const stripe = this.ensureStripe();
    const currency = (params.currency || "pkr")
      .toLowerCase()
      .replace(/\s/g, "");
    const isZeroDecimal = ["jpy", "krw", "vnd", "clp"].indexOf(currency) !== -1;
    const amountInSmallestUnit = isZeroDecimal
      ? Math.round(Number(params.amount))
      : Math.round(Number(params.amount) * 100);

    if (amountInSmallestUnit < 50) {
      throw new HttpException(
        "Amount is too small for Stripe (minimum 50 smallest units).",
        400,
      );
    }

    const billing = this.normalizeRecurring(params.recurring);
    const stripeCurrency = currency === "pkr" ? "pkr" : currency || "usd";

    if (billing) {
      const customer = await stripe.customers.create({
        email: params.donorEmail || undefined,
        name: params.donorName || undefined,
        metadata: { donation_id: String(params.donationId) },
      });
      const product = await stripe.products.create({
        name: this.recurringProductLabel(billing.interval, billing.interval_count),
        description: params.donorName
          ? `Recurring donation from ${params.donorName}`
          : "Recurring donation",
        metadata: { donation_id: String(params.donationId) },
      });
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [
          {
            price_data: {
              product: product.id,
              currency: stripeCurrency,
              unit_amount: amountInSmallestUnit,
              recurring: {
                interval: billing.interval,
                interval_count: billing.interval_count,
              },
            },
          },
        ],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
        metadata: { donation_id: String(params.donationId) },
      });

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent =
        invoice?.payment_intent as Stripe.PaymentIntent | null;
      const clientSecret = paymentIntent?.client_secret;

      if (!clientSecret) {
        throw new HttpException(
          "Stripe did not return a client secret for subscription first payment",
          502,
        );
      }

      return {
        clientSecret,
        paymentIntentId: paymentIntent.id,
        subscriptionId: subscription.id,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency: stripeCurrency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        donation_id: String(params.donationId),
      },
      receipt_email: params.donorEmail || undefined,
      description: params.donorName
        ? `Donation from ${params.donorName}`
        : "Donation",
    });

    if (!paymentIntent.client_secret) {
      throw new HttpException(
        "Stripe did not return a client secret for PaymentIntent",
        502,
      );
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  /**
   * Construct webhook event from raw body and signature (for Stripe webhook verification).
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const stripe = this.ensureStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new HttpException(
        "STRIPE_WEBHOOK_SECRET is not set. Cannot verify webhook.",
        500,
      );
    }
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    ) as Stripe.Event;
  }
}
