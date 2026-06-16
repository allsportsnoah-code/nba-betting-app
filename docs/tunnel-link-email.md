# Tunnel Link Email

`scripts/start-cloudflare-tunnel.ps1` can email the fresh Cloudflare quick-tunnel link after the tunnel starts.

Owner-facing timing and wording live at `/owner` in the app. That page saves non-secret email preferences to:

```text
config/tunnel-link-email-settings.json
```

The SMTP password still stays in `.env.local`.

Add these values to `.env.local`:

```env
TUNNEL_LINK_EMAIL_TO=your-phone-email@example.com
TUNNEL_LINK_EMAIL_FROM=your-sender-email@example.com
TUNNEL_LINK_SMTP_SERVER=smtp.gmail.com
TUNNEL_LINK_SMTP_PORT=587
TUNNEL_LINK_SMTP_USERNAME=your-sender-email@example.com
TUNNEL_LINK_SMTP_PASSWORD=your-app-password
TUNNEL_LINK_SMTP_USE_SSL=true
TUNNEL_LINK_EMAIL_SUBJECT=Betting Lab link is ready
TUNNEL_LINK_EMAIL_TIMES=09:00,12:00
TUNNEL_LINK_EMAIL_DELIVERY_MODE=together
```

Gmail example:

- `TUNNEL_LINK_SMTP_SERVER=smtp.gmail.com`
- `TUNNEL_LINK_SMTP_PORT=587`
- Use a Gmail app password, not the normal account password.

Outlook example:

- `TUNNEL_LINK_SMTP_SERVER=smtp.office365.com`
- `TUNNEL_LINK_SMTP_PORT=587`
- Use the account password or app password required by the account security settings.

After those are set, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-cloudflare-tunnel.ps1
```

The email includes both the base tunnel URL and the `/mlb` board link.

The email body can use these tokens from the Owner tab:

- `{{baseLink}}`
- `{{mlbLink}}`
- `{{ownerLink}}`
- `{{sentAt}}`

When the tunnel is ready, the starter launches a small background email scheduler. The scheduler keeps reading the Owner tab settings while the site is already online, so changing a send time after the tunnel is up still works.

If a saved time has already passed and it has not been sent yet for the current tunnel link, the scheduler sends it right away. Future saved times are sent when they become due.

The Owner tab can store more than one send time. The scheduler sends each configured time once per day for the current tunnel link.

The Owner tab stores recipients as separate rows. The script still supports comma-separated `TUNNEL_LINK_EMAIL_TO` from `.env.local` as a fallback.

Delivery modes:

- `together`: one email with every recipient on the message.
- `individual`: separate emails, one recipient per message.
