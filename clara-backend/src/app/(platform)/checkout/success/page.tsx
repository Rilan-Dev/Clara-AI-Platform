import { Suspense } from "react";
import CheckoutSuccessScreen from "@/features/platform/screens/checkout-success-screen";

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <CheckoutSuccessScreen />
    </Suspense>
  );
}
