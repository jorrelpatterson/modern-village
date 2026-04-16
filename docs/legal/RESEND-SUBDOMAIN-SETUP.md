# Resend Subdomain Setup — Outreach (Cold B2B)

Manual steps for Jorrel to isolate cold-outbound reputation from transactional
email reputation. Do this BEFORE flipping any cold sequence to `status='active'`.

## 1. Add subdomains in Resend dashboard

In https://resend.com/domains add three subdomains:

- `bcba.outreach.modernvillage.app`
- `district.outreach.modernvillage.app`
- `rc.outreach.modernvillage.app`

Resend will show DNS records (SPF/DKIM/DMARC) per subdomain.

## 2. Add DNS records in your DNS provider

For each subdomain, add the records Resend provides. Three TXT records per subdomain:

- SPF (`v=spf1 include:_spf.resend.com ~all`)
- DKIM (`resend._domainkey.<sub>` → long key Resend provides)
- DMARC (`_dmarc.<sub>` → `v=DMARC1; p=none; rua=mailto:dmarc@modernvillage.app`)

Wait ~10 minutes for propagation, then click "Verify" in Resend.

## 3. Set Cloudflare Worker secrets (per-subdomain sender addresses)

```bash
wrangler secret put SENDER_BCBA       # value: "Modern Village BCBA Network <team@bcba.outreach.modernvillage.app>"
wrangler secret put SENDER_DISTRICT   # value: "Modern Village for Districts <team@district.outreach.modernvillage.app>"
wrangler secret put SENDER_RC         # value: "Modern Village for Regional Centers <team@rc.outreach.modernvillage.app>"
wrangler secret put SENDER_TRANSACTIONAL  # value: "Modern Village <hello@modernvillage.app>"
```

## 4. Update each cold campaign row to use its subdomain

After creating the BCBA/District/RC campaign rows (Task 15), set
`campaigns.subdomain` to match. The cron reads this when picking the sender.

## 5. Warmup pacing

DO NOT activate cold campaigns until you've confirmed:
- All three subdomains show "Verified" in Resend
- DMARC reports start flowing (24-48hr)
- `daily_cap` is set to 50 for week 1 (default in schema)

## 6. Inbound webhook (replies)

In Resend dashboard → Inbound:
- Domain: `outreach.modernvillage.app`
- Webhook: `https://village-api.jorrelpatterson.workers.dev/webhook/resend-inbound`
- Action: POST parsed
