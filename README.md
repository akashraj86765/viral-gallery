# Viral Gallery 🎬

A romantic, glowing video/image archive that automatically displays all photos and links sent to your Telegram bot.

## Setup Guide

### 1️⃣ Deploy to Netlify
- Compress the folder into `viral-gallery.zip`
- Go to [Netlify](https://app.netlify.com/) → Sites → New site → Upload ZIP

### 2️⃣ Add Environment Variables
- In **Netlify Site Settings → Build & deploy → Environment Variables** add:


> Do **NOT** hardcode your token in code for security.

### 3️⃣ Set Telegram Webhook
Replace `YOUR_TOKEN` and `YOUR_NETLIFY_SITE`:


### 4️⃣ Test
- Send a **photo** to your Telegram bot  
- Use the **caption as the link** (e.g., `https://youtube.com/...`)  
- Bot replies ✅ and your site auto-updates  

### 5️⃣ Notes
- Newest entries show **first**  
- The site uses a romantic purple-pink gradient with glowing buttons  
- You can add/delete entries directly in Firebase if needed
