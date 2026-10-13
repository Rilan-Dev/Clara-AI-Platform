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
