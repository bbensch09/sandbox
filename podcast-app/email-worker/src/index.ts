import PostalMime from 'postal-mime';

export interface Env {
  /** e.g. https://your-app.vercel.app/api/email/inbound */
  ARTICLECAST_WEBHOOK_URL: string;
  /** Must equal EMAIL_WEBHOOK_SECRET in the Vercel project. */
  ARTICLECAST_SECRET: string;
}

const handler = {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (!env.ARTICLECAST_WEBHOOK_URL || !env.ARTICLECAST_SECRET) {
      message.setReject('ArticleCast email worker is missing its configuration');
      return;
    }

    let parsed;
    try {
      parsed = await PostalMime.parse(message.raw);
    } catch (err) {
      message.setReject(
        `ArticleCast could not parse this message: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    // `from` on a parsed group address has no .address, so fall back to the
    // envelope sender the runtime gives us.
    const from = parsed.from?.address ?? message.from;

    let res: Response;
    try {
      res = await fetch(env.ARTICLECAST_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-articlecast-secret': env.ARTICLECAST_SECRET,
        },
        body: JSON.stringify({
          from,
          subject: parsed.subject ?? '',
          text: parsed.text ?? '',
          html: parsed.html ?? '',
        }),
      });
    } catch (err) {
      message.setReject(
        `ArticleCast is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    // 2xx covers the 202 the app returns for a sender that isn't allow-listed;
    // those are dropped quietly rather than bounced back at the stranger.
    if (res.ok) return;

    const detail = await res.text().catch(() => '');
    // Rejecting produces a bounce, so a misconfiguration shows up in your inbox
    // instead of the message silently disappearing.
    message.setReject(
      `ArticleCast could not accept this message (HTTP ${res.status}) ${detail.slice(0, 150)}`.trim(),
    );
  },
};

export default handler;
