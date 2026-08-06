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

The app starts from `backend/server.js`. Routes live in `backend/src/routes/`:

- `health.js` handles `GET /health`
- `config.js` handles `GET /api/config`
- `conversations.js` handles visitor chat APIs
- `widget.js` handles `GET /widget/:ownerKey.js`

The backend creates these tables through the gateway on startup:

- `chat_owners`
- `chat_conversations`
- `chat_messages`
- `chat_logs`

It also seeds two owner accounts:

- admin: `habibi` / `123456`, widget key `habibi`
- user: `sam` / `123456`, widget key `sam`

You can run the seed without starting the server:

```bash
cd backend
npm run seed
```

`PUBLIC_BASE_URL` is the public URL of this backend. The bot uses it only when it prints widget/demo links. For local testing it can be `http://localhost:3000`. In production it should be your real domain, for example `https://chat.yourdomain.com`.

There is no default owner env value. The frontend must receive the owner from the URL or widget script:

```text
http://localhost:3000/?owner=habibi
```

## Owner Flow

Open your Telegram bot and click the buttons.

To use a seeded account, click `Login`, then send:

```text
habibi 123456
```

or:

```text
sam 123456
```

The bot replies with:

- a widget script URL
- a demo chat URL
- an embeddable `<script>` tag

When a visitor sends a message, the owner receives it in Telegram. Click `Reply`, send the conversation number, then send the reply message.

To close a chat, click `Close chat`, then send the conversation number.

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
