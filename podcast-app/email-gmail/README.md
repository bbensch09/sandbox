# Email → Podcast via a Gmail account

Forward an article to `yourname+cast@gmail.com` and it shows up in your
ArticleCast library within about 5 minutes. No custom domain or Cloudflare
needed. This is the free alternative to the Cloudflare Worker in
[`../email-worker`](../email-worker); both post to the same
`/api/email/inbound` endpoint, so parsing, the sender allow-list, the
auto-convert ceiling and the transcript review hold all behave the same.

```
you forward mail → yourname+cast@gmail.com
      ↓  (Apps Script in that account, every 5 min)
POST /api/email/inbound   (shared secret + sender allow-list)
      ↓
episode → extract → transcript check → auto-convert if under the ceiling
```

Only mail sent to the `+cast` address is touched. Everything else in the
account is left alone.

## Setup (about 10 minutes)

### 1. Shared secret in Vercel

Generate a secret (any long random string works):

```bash
openssl rand -hex 32
```

Vercel → the `sandbox` project → **Settings → Environment Variables** → add
`EMAIL_WEBHOOK_SECRET` for **Production** with that value, then
**Deployments → ⋯ → Redeploy** the latest production deployment. Until this is
set, the endpoint answers 503.

### 2. Create the script

Signed in to the Gmail account you'll forward to:

1. Open <https://script.google.com> → **New project**. Rename it `ArticleCast`.
2. Replace the contents of `Code.gs` with [`Code.gs`](./Code.gs) from this
   folder. Save.
3. **Project Settings** (gear icon) → **Script properties** → add:

   | Property | Value |
   | --- | --- |
   | `WEBHOOK_URL` | `https://<your-app>.vercel.app/api/email/inbound` |
   | `SECRET` | the same value as `EMAIL_WEBHOOK_SECRET` |

   Optional: `CAST_ADDRESS` to use a different address than `<account>+cast@gmail.com`.

### 3. Check the connection

Back in the editor, pick **`testConnection`** in the function dropdown → **Run**.
Google will ask you to authorize the script (Gmail, external requests). Because
it's your own unverified script you'll see *"Google hasn't verified this app"* —
choose **Advanced → Go to ArticleCast (unsafe)** → **Allow**.

The execution log should say **`HTTP 202 — OK`**. Any other result tells you
what to fix (wrong secret, wrong URL, or the Vercel variable not deployed yet).

### 4. Turn it on

Pick **`install`** → **Run**. The log prints the address to forward to, e.g.
`snowschoolers+cast@gmail.com`. It now runs every 5 minutes.

### 5. Allow the addresses you forward *from*

In ArticleCast, **Settings → Access Control**: add every address you'll forward
from (e.g. your work and personal addresses). Mail from anyone else is labelled
`ArticleCast/Ignored` and never becomes an episode.

Provider and the auto-convert ceiling live under **Settings → Email to Podcast**.

## Using it

Forward any newsletter or article (or send just a link) to the `+cast`
address. In the Gmail account, each processed message is marked read and
labelled:

| Label | Meaning |
| --- | --- |
| `ArticleCast/Sent` | Episode created |
| `ArticleCast/Ignored` | Sender not in Access Control |
| `ArticleCast/Failed` | Rejected (e.g. no usable text or link). You get an email saying why. |

If the app is down, the message stays unread and is retried every 5 minutes
for an hour before being marked failed.

**Gmail auto-forwarding filters:** a filter that forwards a newsletter keeps
the newsletter's own `From`, so add that sending address to Access Control too.

To stop: script editor → **Triggers** (clock icon) → delete the
`processInbox` trigger.
