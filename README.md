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
SUPABASE_URL = https://your-project-id.supabase.co
SUPABASE_ANON_KEY = your-supabase-anon-key
ADMIN_ID = your-telegram-user-id

3️⃣ Set Telegram Webhook:

https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://YOUR_NETLIFY_SITE.netlify.app/.netlify/functions/telegram-bot

4️⃣ Setup Supabase Database:
Run this SQL in Supabase SQL Editor:

```sql
-- Create items table
CREATE TABLE items (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  image TEXT NOT NULL,
  link TEXT NOT NULL
);

-- Create message mapping table
CREATE TABLE message_map (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL UNIQUE,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security but allow all operations (since it's public gallery)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_map ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust based on your needs)
CREATE POLICY "Allow all operations on items" ON items FOR ALL USING (true);
CREATE POLICY "Allow all operations on message_map" ON message_map FOR ALL USING (true);
5️⃣ Commands (Admin only):

Upload: send photo + caption with link

Reply to bot message:

/delete → delete this post

/update_thumbnail → reply with new photo

/update_link → reply with new caption containing URL

6️⃣ Frontend updates automatically when new post is added

## Setup Instructions:

1. **Create Supabase project** at supabase.com
2. **Run the SQL** from the README in Supabase SQL Editor
3. **Update Netlify environment variables** with your Supabase credentials
4. **Replace all files** with the updated versions above
5. **Redeploy** to Netlify

Your Telegram bot and website will work exactly the same, but now using **free Supabase** instead of Firebase! 🚀