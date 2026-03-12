declare module "stripe" {
  type StripeMetadata = Record<string, string | undefined>;

  class Stripe {
    constructor(apiKey: string, config?: Record<string, unknown>);

    customers: {
      create(params: Record<string, unknown>): Promise<Stripe.Customer>;
    };

    checkout: {
      sessions: {
        create(params: Record<string, unknown>): Promise<Stripe.Checkout.Session>;
      };
    };

    billingPortal: {
      sessions: {
        create(params: Record<string, unknown>): Promise<Stripe.BillingPortal.Session>;
      };
    };

    subscriptions: {
      retrieve(id: string): Promise<Stripe.Subscription>;
    };

    webhooks: {
      constructEvent(payload: string, signature: string, secret: string): Stripe.Event;
    };
  }

  namespace Stripe {
    interface Customer {
      id: string;
    }

    namespace Checkout {
      interface Session {
        id: string;
        url: string | null;
        metadata?: StripeMetadata;
        subscription?: string | { id: string } | null;
        amount_total?: number | null;
        customer?: string | { id: string } | null;
      }

      namespace SessionCreateParams {
        interface LineItem {
          price?: string;
          quantity?: number;
          price_data?: {
            currency: string;
            unit_amount: number;
            product_data: { name: string };
            recurring: { interval: string };
          };
        }
      }
    }

    namespace BillingPortal {
      interface Session {
        url: string;
      }
    }

    interface Subscription {
      id: string;
      metadata?: StripeMetadata;
      items: { data: Array<{ price: { id: string } }> };
      status: string;
      current_period_start: number;
      current_period_end: number;
      cancel_at_period_end: boolean;
      customer: string | { id: string };
    }

    namespace Subscription {
      type Status = string;
    }

    interface Invoice {
      id: string;
      subscription?: string | Subscription | null;
      subscription_details?: { metadata?: StripeMetadata | null } | null;
      metadata?: StripeMetadata;
      amount_paid?: number | null;
      amount_due?: number | null;
      invoice_pdf?: string | null;
      customer?: string | { id: string } | null;
    }

    interface Event {
      id: string;
      type: string;
      data: { object: unknown };
    }
  }

  export { Stripe };
  export default Stripe;
}

declare module "razorpay" {
  interface RazorpayOrder {
    id: string;
    amount: number;
  }

  interface RazorpayPayment {
    id: string;
    status?: string;
  }

  class Razorpay {
    constructor(options: { key_id: string; key_secret: string });
    orders: {
      create(params: Record<string, unknown>): Promise<RazorpayOrder>;
    };
    payments: {
      fetch(paymentId: string): Promise<RazorpayPayment>;
    };
  }

  export default Razorpay;
}
