import { redirect } from "next/navigation";

// OTP flow handles verification inline on the sign-in page
export default function VerifyRequestPage() {
  redirect("/auth/signin");
}
