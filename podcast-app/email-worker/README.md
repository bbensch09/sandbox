# Email → Podcast

Forward an article to a dedicated address and it appears in your ArticleCast
library, converting itself if it's under your cost ceiling.

```
you forward mail
      ↓
cast@yourdomain.com  (Cloudflare Email Routing)
      ↓
this Worker          (parses MIME → JSON)
      ↓
POST /api/email/inbound   (shared secret + sender allowlist)
      ↓
Supabase row → Inngest extract → auto-convert if under the ceiling
```

## Setup

### 1. Database

Run the email columns from `../supabase/schema.sql` in the Supabase SQL editor:

```sql
ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS auto_convert boolean DEFAULT false;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS email_auto_convert_provider text DEFAULT 'inworld',
  ADD COLUMN IF NOT EXISTS email_auto_convert_max_chars integer DEFAULT 40000;
```

### 2. Shared secret

Generate one:

```bash
openssl rand -hex 32
```

Add it to Vercel as `EMAIL_WEBHOOK_SECRET` **for the Production environment**,
then redeploy — the endpoint returns 503 until it is set.

### 3. Deploy the Worker

Your domain must use Cloudflare DNS, with **Email Routing** enabled under the
domain's Email tab (Cloudflare adds the MX records for you).

```bash
cd email-worker
npm install

# Edit wrangler.toml so ARTICLECAST_WEBHOOK_URL points at your deployment.
npx wrangler secret put ARTICLECAST_SECRET   # paste the same value as step 2
npx wrangler deploy
```

### 4. Route an address to it

Cloudflare dashboard → your domain → **Email → Email Routing → Routes** →
*Create address*. Choose something like `cast@yourdomain.com`, set the action to
**Send to a Worker**, and pick `articlecast-email`.

### 5. Allow yourself as a sender

In ArticleCast **Settings → Access Control**, make sure the address you forward
*from* is listed. Mail from anyone else is accepted by Cloudflare and then
discarded by the app.

Set the provider and cost ceiling under **Settings → Email to Podcast**.

## How a message is interpreted

- **Substantial body** (≥1500 characters of prose, ignoring URLs) → the email
  body becomes the article. This is the newsletter case.
- **Thin body** → the first non-boilerplate link is extracted with the normal
  Jina/Readability pipeline. Unsubscribe, tracking, image and social links are
  skipped.
- Gmail and Outlook forward headers (`---------- Forwarded message ----------`,
  `From:`, `Date:`, …) are stripped so they aren't read aloud.
- The subject becomes the title, with `Fwd:`/`Re:` prefixes removed.

## Gotcha: auto-forwarding rules vs. manual forwards

Gmail's **Forward** button rewrites the sender to you, so the allowlist matches
and everything works.

Gmail's **automatic forwarding filters** redirect instead — the original
newsletter sender is preserved in `From`, so the app will reject the message as
an unknown sender. If you want a filter to feed this automatically, add the
newsletter's sending address to Access Control as well.

## Failure behaviour

The Worker bounces the message when the app returns an error, so problems land
in your inbox instead of vanishing:

| App response | Meaning | Worker |
| --- | --- | --- |
| 201 | Episode created | accepts |
| 202 | Sender not allow-listed | accepts, drops quietly |
| 401 | Secret mismatch | bounces |
| 422 | No usable text or link | bounces |
| 503 | Settings unreadable / secret unset | bounces |

## Local development

```bash
npx wrangler dev --remote
```

Email Workers can't be triggered from `wrangler dev` directly. To exercise the
endpoint, POST to it yourself:

```bash
curl -X POST http://localhost:3000/api/email/inbound \
  -H 'content-type: application/json' \
  -H "x-articlecast-secret: $EMAIL_WEBHOOK_SECRET" \
  -d '{"from":"you@example.com","subject":"Fwd: Test","text":"https://example.com/article"}'
```
