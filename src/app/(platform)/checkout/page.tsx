import { Suspense } from "react";
import CheckoutScreen from "@/features/platform/screens/checkout-screen";

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutScreen />
    </Suspense>
  );
}
