import type { Mailer } from '@consulpro/application';
import { createTransport } from 'nodemailer';

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
  readonly from: string;
}

export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
  });
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from: config.from, to, subject, text });
    },
  };
}

/** Boîte de réception en mémoire (tests). */
export class MemoryMailer implements Mailer {
  readonly sent: { to: string; subject: string; text: string }[] = [];

  send(message: { to: string; subject: string; text: string }): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** Dernier lien envoyé à une adresse (vérification d'e-mail, invitation…). */
  lastLinkTo(email: string): string | undefined {
    const message = this.sent.filter((m) => m.to === email).at(-1);
    return /https?:\/\/\S+/.exec(message?.text ?? '')?.[0];
  }
}
