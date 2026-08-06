# Telegram Chat System

Reusable live chat widget powered by a Telegram bot and the DBMS Gateway.

## Setup

1. Register this app in the DBMS Gateway and keep the real MySQL host, user, password, database, and pool settings there.
2. Copy `backend/.env.example` to `backend/.env`.
3. Fill in:
   - `SITE_ID`
   - full `API_KEY`
   - `DBMS_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `PUBLIC_BASE_URL`
4. Start the DBMS Gateway.
5. Start this backend:

```bash
cd backend
npm start
```

The backend creates these tables through the gateway on startup:

- `chat_owners`
- `chat_conversations`
- `chat_messages`

## Owner Flow

Open your Telegram bot and send:

```text
/register username password
```

The bot replies with:

- a widget script URL
- a demo chat URL
- an embeddable `<script>` tag

When a visitor sends a message, the owner receives it in Telegram and can reply:

```text
/reply conversationId message
```

The owner can close the chat:

```text
/close conversationId
```

## Visitor Flow

Use the demo frontend:

```text
http://localhost:3000/?owner=OWNER_PUBLIC_KEY
```

Or add the generated widget script to any HTML site:

```html
<script src="http://localhost:3000/widget/OWNER_PUBLIC_KEY.js" defer></script>
```

Visitors enter their name and email before the chat opens. Visitors can end the chat from the widget.

## Health Check

```text
GET /health
```

This calls `db.status()` through the DBMS Gateway.
# tel--chat
