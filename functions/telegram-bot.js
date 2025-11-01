const axios = require("axios");

const ADMIN_ID = 6354768795; // your Telegram ID

exports.handler = async (event) => {
  console.log('Function called with method:', event.httpMethod);
  console.log('Raw body:', event.body);

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: 'Method Not Allowed',
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    };
  }

  try {
    // Parse JSON body safely
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return { 
        statusCode: 400, 
        body: 'Invalid JSON',
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    if (!body.message) {
      return { 
        statusCode: 200, 
        body: 'No message',
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    const msg = body.message;
    const chatId = msg.chat.id;

    // ------------------- ADMIN ONLY -------------------
    if (msg.from.id !== ADMIN_ID) {
      return { 
        statusCode: 200, 
        body: 'Not admin',
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

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

      // For now, just acknowledge receipt - we'll implement Supabase later
      await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ Photo received! (Supabase setup in progress)\n\nImage URL: ${fileUrl}\nLink: ${redirectLink || 'No link found'}`
      });

      return { 
        statusCode: 200, 
        body: 'Photo received',
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    // Handle text commands
    if (msg.text) {
      await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ Bot is working! Received: ${msg.text}`
      });
    }

    return { 
      statusCode: 200, 
      body: 'ok',
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (err) {
    console.error('Error:', err);
    return { 
      statusCode: 500, 
      body: 'Internal Server Error: ' + err.message,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
};