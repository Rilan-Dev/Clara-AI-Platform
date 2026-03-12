import { Suspense } from "react";
import SignupScreen from "@/features/platform/screens/signup-screen";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupScreen />
    </Suspense>
  );
}
