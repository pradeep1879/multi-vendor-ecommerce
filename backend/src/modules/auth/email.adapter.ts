import { AppError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/env.js';

export type OutboundEmail = {
  recipient: string;
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
  token: string;
};

export interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}

export class AuthEmailSender implements EmailSender {
  constructor(private readonly environment: Environment) {}

  async send(message: OutboundEmail): Promise<void> {
    const isReset = message.purpose === 'PASSWORD_RESET';
    const page = new URL(
      isReset ? '/reset-password' : '/verify-email',
      this.environment.frontendUrl,
    );
    page.searchParams.set('token', message.token);
    const action = isReset ? 'reset your password' : 'verify your email address';
    const subject = isReset ? 'Reset your password' : 'Verify your email address';
    const text = `Use this link to ${action}: ${page.toString()}`;
    const html = `<p>Use the link below to ${action}.</p><p><a href="${escapeAttribute(page.toString())}">${escapeHtml(action)}</a></p>`;

    if (
      this.environment.nodeEnv === 'development' &&
      this.environment.authEmailDelivery === 'console'
    ) {
      console.info(
        JSON.stringify({
          level: 'development_email',
          recipient: message.recipient,
          purpose: message.purpose,
          link: page.toString(),
        }),
      );
      return;
    }
    if (!this.environment.resendApiKey || !this.environment.authEmailFrom)
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is not configured.');

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.environment.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.environment.authEmailFrom,
          to: [message.recipient],
          subject,
          html,
          text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is temporarily unavailable.');
    }
    if (!response.ok)
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is temporarily unavailable.');
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
