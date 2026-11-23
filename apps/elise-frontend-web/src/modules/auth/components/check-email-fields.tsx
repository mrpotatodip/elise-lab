import { AUTH_COPY } from "../constants";
import { ResendVerificationButton } from "./resend-verification-button";

export function CheckEmailFields({ email }: { email: string | undefined }) {
  if (!email) return <p className="text-sm leading-relaxed">{AUTH_COPY.checkEmail.noAddress}</p>;
  return (
    <div className="grid gap-5">
      <p className="text-sm leading-relaxed">
        {AUTH_COPY.checkEmail.sentTo} <strong className="font-medium">{email}</strong>. {AUTH_COPY.checkEmail.delay}
      </p>
      <ResendVerificationButton email={email} />
    </div>
  );
}
