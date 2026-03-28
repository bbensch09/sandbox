# Bachelor HQ — Setup Guide

~20 minutes from zero to live. You need a free Firebase account.

---

## Step 1 — Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `bachelor-hq` → disable Google Analytics → **Create project**

---

## Step 2 — Enable Google Auth

1. In your project, go to **Authentication** → **Get started**
2. Click **Google** under Sign-in providers → Enable it → Save
3. Add your deployed URL to **Authorized domains** (do this after Step 5)

---

## Step 3 — Create Firestore Database

1. Go to **Firestore Database** → **Create database**
2. Pick **Start in test mode** (fine for a weekend — it auto-locks after 30 days)
3. Choose any region → **Enable**

---

## Step 4 — Get Your Config Keys

1. Go to **Project settings** (gear icon) → **General** tab
2. Scroll to **Your apps** → click **</>** (Web) → register the app (name it anything)
3. Copy the `firebaseConfig` values

---

## Step 5 — Configure the App

```bash
cd bachelor-party-app
cp .env.example .env
```

Fill in `.env` with your Firebase values:
```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=bachelor-hq.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=bachelor-hq
VITE_FIREBASE_STORAGE_BUCKET=bachelor-hq.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123...
```

---

## Step 6 — Install & Build

```bash
npm install
npm run build
```

---

## Step 7 — Deploy to Firebase Hosting (free, instant)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# When asked: use existing project, public dir = dist, single-page app = yes, don't overwrite index.html
firebase deploy
```

You'll get a URL like `https://bachelor-hq.web.app` — **share this in the group chat!**

---

## How It Works

- Everyone opens the link, signs in with their Google account (takes 5 seconds)
- Anyone can create a game — Price Is Right bet or Quick Poll
- **Price Is Right**: everyone guesses a number, creator enters the real answer when ready, app automatically crowns the winner and shames the loser
- **Poll**: everyone votes, live results update in real-time
- Games can have deadlines (auto-lock) or stay open until creator closes them

---

## Optional: Local Dev

```bash
npm run dev
```

Opens at http://localhost:5173 — Google sign-in works locally too.
