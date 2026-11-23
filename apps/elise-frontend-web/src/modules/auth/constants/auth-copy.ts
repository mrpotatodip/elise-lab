// -----
// The code the engine's sign-in answers with for a Login that is not verified.
// -----
export const EMAIL_NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";

export const AUTH_COPY = {
  signin: {
    title: "Sign in",
    hint: "Sign in to see your repositories and security audits.",
    submit: "Sign in",
    swap: "New here? Create an account",
    to: "/signup",
    forgot: "Forgot your password?",
    forgotTo: "/forgot-password",
  },
  forgot: {
    title: "Reset your password",
    hint: "Enter your email and we will send you a link to choose a new one.",
    submit: "Send reset link",
    swap: "Back to sign in",
    to: "/signin",
    sent: "If an account uses that email, a reset link is on its way. It works for one hour. Check the spam folder if it does not arrive.",
  },
  reset: {
    title: "Choose a new password",
    hint: "You will be signed out everywhere and asked to sign in with it.",
    submit: "Save password",
    swap: "Back to sign in",
    to: "/signin",
    done: "Password changed. Sign in with the new one.",
    noToken: "This link is incomplete. Open the link from the email again, or ask for a new one.",
    expired: "This link has expired or was already used. Ask for a new one.",
    askAgain: "Ask for a new link",
  },
  signup: {
    title: "Create an account",
    hint: "Start with your name, an account name, your email and a password.",
    submit: "Create account",
    swap: "I already have an account",
    to: "/signin",
    accountNameHelp: "The name of the new Elise account you are creating, for example your company or team.",
    checkUnavailable: "Sign-up is not available right now. Try again later.",
    consequence: "You will own this new account. We will email you a link to confirm your address first.",
  },
  checkEmail: {
    title: "Check your email",
    hint: "We sent a link to confirm your address. Open it to finish creating your account.",
    swap: "Back to sign in",
    to: "/signin",
    noAddress: "Open the link in the email we sent you.",
    sentTo: "We sent it to",
    delay: "It can take a minute; check the spam folder too.",
  },
  verifyFailed: {
    title: "This link did not work",
    hint: "This link was already used or has expired. Sign in, or enter your email and we will send a new one.",
    swap: "Back to sign in",
    to: "/signin",
  },
  verify: {
    resend: "Send the email again",
    sent: "Sent. It can take a minute; check the spam folder too.",
    wait: "Wait a minute before asking again.",
    failed: "Something went wrong",
    unverified: "Verify your email first. We just sent you a new link.",
  },
} as const;

// -----
// The panel beside the form on wide screens: what Elise does, in plain words.
// -----
export const AUTH_BRAND_COPY = {
  headline: "Security audits for your code, in plain words.",
  points: [
    { title: "Audits your repositories", text: "Connect GitHub and an AI model reads your code for security problems, private repositories included." },
    { title: "Explains every finding", text: "Each problem comes with what it means and how to fix it." },
    { title: "Checks a commit before you ship", text: "A pass, a fail, or not enough scans yet, for each commit." },
  ],
} as const;

// -----
// What a field says when it is wrong: what to type, never the rule that failed.
// -----
export const AUTH_ERRORS = {
  emailEmpty: "Enter your email address.",
  email: "Enter a valid email address, like name@company.com.",
  password: "Enter your password.",
  firstName: "Enter your first name.",
  lastName: "Enter your last name.",
  accountName: "Enter a name for your account.",
  turnstile: "Complete the check above, then try again.",
  tooLong: (limit: number) => `Use ${limit} characters or fewer.`,
  newPasswordTooShort: (min: number) => `Use at least ${min} characters.`,
} as const;
