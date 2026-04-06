import { Suspense } from "react";
import SignupVerifyScreen from "@/features/platform/screens/signup-verify-screen";

export default function SignupVerifyPage() {
  return (
    <Suspense>
      <SignupVerifyScreen />
    </Suspense>
  );
}
