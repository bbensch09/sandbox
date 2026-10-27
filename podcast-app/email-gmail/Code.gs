/**
 * ArticleCast — Gmail inbox for email-to-podcast.
 *
 * Runs inside the Gmail account you forward articles to. Every few minutes it
 * picks up unread mail sent to <you>+cast@gmail.com, posts each message to
 * ArticleCast's /api/email/inbound endpoint, and labels it with the outcome.
 * Mail to the plain address is never touched.
 *
 * Setup: see README.md next to this file.
 */

const LABELS = {
  sent: 'ArticleCast/Sent',
  ignored: 'ArticleCast/Ignored', // sender not on the app's allow-list
  failed: 'ArticleCast/Failed',
};

/** Server errors are retried on each run; after this long the message is given up on. */
const GIVE_UP_AFTER_MS = 60 * 60 * 1000;

function config_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('WEBHOOK_URL');
  const secret = props.getProperty('SECRET');
  if (!url || !secret) {
    throw new Error('Set WEBHOOK_URL and SECRET under Project Settings → Script properties.');
  }
  const castAddress = (
    props.getProperty('CAST_ADDRESS') ||
    Session.getEffectiveUser().getEmail().replace('@', '+cast@')
  ).toLowerCase();
  return { url, secret, castAddress };
}

function post_(cfg, payload) {
  return UrlFetchApp.fetch(cfg.url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-articlecast-secret': cfg.secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

/** "Brian <brian@example.com>" → "brian@example.com" */
function address_(from) {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

function finish_(thread, message, labelName) {
  thread.addLabel(GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName));
  message.markRead();
}

function notifyFailure_(message, detail) {
  GmailApp.sendEmail(
    address_(message.getFrom()),
    'ArticleCast could not add: ' + message.getSubject(),
    'ArticleCast could not turn this forwarded email into an episode.\n\n' + detail,
  );
}

/** Main job — run on a timer by install(). */
function processInbox() {
  const cfg = config_();
  const threads = GmailApp.search('to:' + cfg.castAddress + ' is:unread', 0, 20);

  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      if (!message.isUnread()) continue;
      const recipients = (message.getTo() + ',' + message.getCc()).toLowerCase();
      if (recipients.indexOf(cfg.castAddress) === -1) continue; // e.g. a reply in the same thread

      let code;
      let body = '';
      try {
        const res = post_(cfg, {
          from: message.getFrom(),
          subject: message.getSubject(),
          text: message.getPlainBody(),
          html: message.getBody(),
        });
        code = res.getResponseCode();
        body = res.getContentText().slice(0, 300);
      } catch (err) {
        code = 0; // network error — treat like a server error
        body = String(err);
      }

      if (code === 201) {
        finish_(thread, message, LABELS.sent);
      } else if (code === 202) {
        // Sender isn't on Settings → Access Control in the app.
        finish_(thread, message, LABELS.ignored);
      } else if (code >= 400 && code < 500) {
        // Bad secret (401), nothing usable in the email (422)… retrying won't help.
        finish_(thread, message, LABELS.failed);
        notifyFailure_(message, 'HTTP ' + code + ': ' + body);
      } else {
        // 5xx / network: leave unread so the next run retries — for a while.
        const age = Date.now() - message.getDate().getTime();
        if (age > GIVE_UP_AFTER_MS) {
          finish_(thread, message, LABELS.failed);
          notifyFailure_(message, 'The app kept failing for over an hour. Last response: HTTP ' + code + ': ' + body);
        } else {
          console.warn('Will retry "' + message.getSubject() + '": HTTP ' + code + ' ' + body);
        }
      }
    }
  }
}

/** Run once: schedules processInbox every 5 minutes (replacing any old schedule). */
function install() {
  config_(); // fail fast if properties are missing
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'processInbox') ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(5).create();
  console.log('Installed. Forward articles to ' + config_().castAddress);
}

/**
 * Run to check the URL and secret without creating an episode. The fake
 * sender is never on the allow-list, so a healthy app answers 202.
 */
function testConnection() {
  const cfg = config_();
  const res = post_(cfg, { from: 'connection-test@invalid.example', subject: 'test', text: 'test' });
  const code = res.getResponseCode();
  const verdict = {
    202: 'OK — URL and secret both work.',
    401: 'Secret mismatch — SECRET here must equal EMAIL_WEBHOOK_SECRET in Vercel.',
    404: 'Wrong WEBHOOK_URL — it should end in /api/email/inbound.',
    503: 'The app is missing EMAIL_WEBHOOK_SECRET (set it in Vercel and redeploy) or cannot read its settings.',
  }[code];
  console.log('HTTP ' + code + ' — ' + (verdict || res.getContentText().slice(0, 300)));
}
