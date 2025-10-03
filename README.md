# Viral Gallery 🔥

⚡ 18+ neon-style attention-grabbing gallery
⚡ Admin-only uploads, deletes, and updates
⚡ Mobile reel-style scrolling
⚡ Only the first link in caption is used for "Watch Now"

---

## Setup

1️⃣ Deploy to Netlify  
- Zip the folder (`viral-gallery`)  
- Upload via Netlify → Sites → New site → Upload ZIP

2️⃣ Add Environment Variables  
- In Site Settings → Build & deploy → Environment Variables:

BOT_TOKEN = your regenerated Telegram bot token
FIREBASE_DB_URL = https://telegram-channel-site-default-rtdb.firebaseio.com/


3️⃣ Set Telegram Webhook:

https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://YOUR_NETLIFY_SITE.netlify.app/.netlify/functions/telegram-bot


4️⃣ Commands (Admin only):

- Upload: send **photo + caption with link**  
- Reply to bot message:
  - `/delete` → delete this post
  - `/update_thumbnail` → reply with new photo
  - `/update_link` → reply with new caption containing URL

5️⃣ Frontend updates automatically when new post is added
