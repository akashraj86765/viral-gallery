const axios = require("axios");

const ADMIN_ID = 6354768795; // replace with your Telegram ID

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    if (!body.message) return { statusCode: 200, body: "No message" };

    const msg = body.message;
    const chatId = msg.chat.id;

    // ------------------- ADMIN ONLY -------------------
    if (msg.from.id !== ADMIN_ID) {
      return { statusCode: 200, body: "Not admin" };
    }

    const firebaseUrl = process.env.FIREBASE_DB_URL;

    // 1️⃣ Upload post (photo + caption)
    if (msg.photo && msg.caption) {
      const photo = msg.photo[msg.photo.length-1];
      const fileId = photo.file_id;

      const fileInfo = await axios.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.data.result.file_path}`;

      // Extract only first link from caption
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const links = msg.caption.match(urlRegex);
      const redirectLink = links ? links[0] : "";

      const res = await axios.post(`${firebaseUrl}/items.json`, {
        image: fileUrl,
        link: redirectLink,
        timestamp: Date.now()
      });

      const dbKey = res.data.name;

      // Send confirmation with instructions to delete/update
      const sentMsg = await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `New post added!\nReply to this message with:\n/delete → delete post\n/update_thumbnail → update image\n/update_link → update link\nKey: ${dbKey}`
      });

      const messageId = sentMsg.data.result.message_id;
      // Save mapping: message_id → dbKey
      await axios.patch(`${firebaseUrl}/messageMap/${messageId}.json`, { key: dbKey });
    }

    // 2️⃣ Reply-based Delete/Update
    if (msg.reply_to_message && msg.text) {
      const replyId = msg.reply_to_message.message_id;
      const mapRes = await axios.get(`${firebaseUrl}/messageMap/${replyId}.json`);
      const dbKey = mapRes.data.key;

      if (!dbKey) return { statusCode: 200, body: "No mapping found" };

      // Delete
      if (msg.text.toLowerCase() === "/delete") {
        await axios.delete(`${firebaseUrl}/items/${dbKey}.json`);
        await axios.delete(`${firebaseUrl}/messageMap/${replyId}.json`);
        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, { chat_id: chatId, text: "✅ Post deleted!" });
      }

      // Update thumbnail
      else if (msg.text.toLowerCase() === "/update_thumbnail" && msg.photo) {
        const photo = msg.photo[msg.photo.length-1];
        const fileId = photo.file_id;
        const fileInfo = await axios.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.data.result.file_path}`;

        await axios.patch(`${firebaseUrl}/items/${dbKey}.json`, { image: fileUrl });
        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, { chat_id: chatId, text: "✅ Thumbnail updated!" });
      }

      // Update link
      else if (msg.text.toLowerCase() === "/update_link") {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const links = msg.caption ? msg.caption.match(urlRegex) : [];
        const redirectLink = links ? links[0] : "";
        if (redirectLink) {
          await axios.patch(`${firebaseUrl}/items/${dbKey}.json`, { link: redirectLink });
          await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, { chat_id: chatId, text: "✅ Link updated!" });
        } else {
          await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, { chat_id: chatId, text: "❌ No valid link found in caption!" });
        }
      }
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.toString() };
  }
};
