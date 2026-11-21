import { Effect } from "effect";
import { runEffect } from "#/lib/effect-query";
import { EMAIL_DEAD_LETTER_QUEUE, EMAIL_LONG_WAIT_SECONDS, EMAIL_RETRY_BASE_SECONDS, EMAIL_SENDER_NAME } from "#/modules/email/constants";
import type { QueueBody, QueuedEmail } from "#/modules/email/types";
import { renderEmail, retryRuleOf, sendErrorCode } from "#/modules/email/utils";
import type { Bindings } from "#/types/variables";

export const withKind = (body: QueueBody): QueuedEmail => ("kind" in body ? body : { kind: "team-invite", ...body });

export const consumeEmails = (batch: MessageBatch<QueueBody>, env: Pick<Bindings, "EMAIL" | "EMAIL_FROM">): Promise<void> =>
  runEffect(
    Effect.forEach(
      batch.messages,
      (message) => {
        const mail = withKind(message.body);
        return Effect.tryPromise({
          try: () => env.EMAIL.send({ to: mail.to, from: { email: env.EMAIL_FROM, name: EMAIL_SENDER_NAME }, ...renderEmail(mail) }),
          catch: (cause) => (cause instanceof Error ? cause : new Error("Email send failed")),
        }).pipe(
          Effect.match({
            onSuccess: (sent) => {
              console.log("Email sent", { kind: mail.kind, messageId: sent.messageId });
              message.ack();
            },
            onFailure: (error) => {
              const code = sendErrorCode(error);
              const rule = retryRuleOf(code);
              console.error("Email not sent", { kind: mail.kind, code, rule, attempt: message.attempts });
              if (rule === "drop") message.ack();
              else message.retry({ delaySeconds: rule === "long-wait" ? EMAIL_LONG_WAIT_SECONDS : EMAIL_RETRY_BASE_SECONDS * 2 ** (message.attempts - 1) });
            },
          }),
        );
      },
      { concurrency: 5, discard: true },
    ),
  );

export const consumeDeadLetters = (batch: MessageBatch<QueueBody>): Promise<void> =>
  runEffect(
    Effect.sync(() => {
      for (const message of batch.messages) {
        console.error("Email dead-lettered", { kind: withKind(message.body).kind });
        message.ack();
      }
    }),
  );

export const handleEmailQueue = (batch: MessageBatch<QueueBody>, env: Pick<Bindings, "EMAIL" | "EMAIL_FROM">): Promise<void> =>
  batch.queue === EMAIL_DEAD_LETTER_QUEUE ? consumeDeadLetters(batch) : consumeEmails(batch, env);
