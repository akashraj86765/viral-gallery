const axios = require("axios");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    if (!body.message) return { statusCode: 200, body: "No message" };

    const msg = body.message;
    const chatId = msg.chat.id;

    if (msg.photo && msg.caption) {
      const photo = msg.photo[msg.photo.length - 1]; 
      const fileId = photo.file_id;

      const fileInfo = await axios.get(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );

      const filePath = fileInfo.data.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
      const redirectLink = msg.caption.trim();

      const firebaseUrl = `${process.env.FIREBASE_DB_URL}/items.json`;
      await axios.post(firebaseUrl, {
        image: fileUrl,
        link: redirectLink,
        timestamp: Date.now(),
      });

      await axios.post(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
        { chat_id: chatId, text: "✅ Uploaded to website archive!" }
      );
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.toString() };
  }
};
