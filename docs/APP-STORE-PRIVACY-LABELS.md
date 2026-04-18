# App Store Privacy Labels — Modern Village

Use these answers when filling out App Store Connect → App Privacy → Privacy Nutrition Labels.

## Data Types Collected

### Contact Info
- **Name** — Used for: Functionality (displaying in app, care team)
  - Linked to user? **Yes**
  - Used for tracking? **No**
- **Email Address** — Used for: Functionality, Communications (drips, reminders)
  - Linked? **Yes** · Tracking? **No**
- **Phone Number** (optional, parent only) — Used for: Functionality (care team contact)
  - Linked? **Yes** · Tracking? **No**
- **Physical Address** (ZIP code only) — Used for: App Functionality (My Village nearby parents, local resources)
  - Linked? **Yes** · Tracking? **No**

### Health & Fitness
- **Health** (child's diagnosis, behavior logs, session notes) — Used for: App Functionality (AI coaching, provider sharing)
  - Linked? **Yes** · Tracking? **No**
  - Protected by HIPAA-adjacent privacy; never used for ads.

### Sensitive Info
- **Sensitive Info** (child's age, diagnosis, behavior patterns) — Used for: App Functionality
  - Linked? **Yes** · Tracking? **No**

### User Content
- **Photos or Videos** (optional profile + post uploads) — App Functionality
  - Linked? **Yes** · Tracking? **No**
- **Audio Data** (voice-mode chat transcripts sent to AI) — App Functionality
  - Linked? **Yes** · Tracking? **No**
- **Other User Content** (AI chat history, journal entries, community posts, care notes) — App Functionality
  - Linked? **Yes** · Tracking? **No**

### Identifiers
- **User ID** (Supabase UUID) — App Functionality
  - Linked? **Yes** · Tracking? **No**

### Usage Data
- **Product Interaction** (feature usage for optimization) — Analytics
  - Linked? **Yes** · Tracking? **No**

### Diagnostics
- **Crash Data** — App Functionality
  - Linked? **No** · Tracking? **No**

### Location
- **Coarse Location** (city-level for My Village nearby parents) — App Functionality
  - Linked? **Yes** · Tracking? **No**

## Data NOT Collected
- Financial info (Stripe handles all payment data; we never see card numbers)
- Search history outside the app
- Contacts
- Browsing history
- Precise location (we approximate to city-level)

## Data Used for Tracking (across apps/websites)
**NONE.** Modern Village does not track users across other apps or websites, does not sell data, does not use third-party ad networks.

## Data Sharing with Third Parties
- **Supabase** (database hosting) — Under BAA once Pro plan active
- **Anthropic / Claude API** (AI coaching) — Under BAA (pending)
- **Resend** (email delivery) — Under BAA (pending)
- **Stripe** (payments) — Subject to Stripe's privacy policy
- **APNs / Apple Push** (push notifications) — Generic push tokens only, no PHI in payload

## Key HIPAA-Safe Notes for Review
- All push notification text is **generic** — never contains child name, specific behavior, or session content
- AI chat transcripts include session PHI but are encrypted in transit (HTTPS) and at rest (Supabase)
- Community posts are auto-filtered for profanity + PHI before publishing

## Data Retention
- Active account: all data retained while account is active
- Deleted account: permanently deleted within 30 days of deletion request
- Logs: 90 days rolling

## User Rights
- Users can request data export (GDPR-style) via support email
- Users can delete account at any time from Profile → Account
- Users can opt out of all marketing emails independently of the app
