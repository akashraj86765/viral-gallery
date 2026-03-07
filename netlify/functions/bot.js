const axios = require("axios");
const { createClient } = require('@supabase/supabase-js');

const ADMIN_ID = 6354768795; // Your Telegram user ID

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
  console.log('Function called with method:', event.httpMethod);

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
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }

  try {
    const body = JSON.parse(event.body);

    // ------------------- HANDLE CALLBACK QUERIES -------------------
    if (body.callback_query) {
      const query = body.callback_query;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;
      const data = query.data;

      if (query.from.id !== ADMIN_ID) {
        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: query.id,
          text: "⛔ Unauthorized"
        });
        return { statusCode: 200, body: 'Unauthorized' };
      }

      if (data === 'reset_confirm') {
        try {
          await axios.delete(`${supabaseUrl}/rest/v1/items?id=gte.0`, {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            }
          });

          await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: "✅ **Reset complete!** All gallery data has been deleted.",
            parse_mode: "Markdown"
          });
        } catch (error) {
          console.error("Reset delete error:", error);
          await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: "❌ Failed to reset data. Check logs."
          });
        }
      } else if (data === 'reset_cancel') {
        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: "❌ Reset cancelled."
        });
      }

      await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: query.id
      });

      return { statusCode: 200, body: 'Callback handled' };
    }

    // ------------------- REGULAR MESSAGES -------------------
    if (!body.message) {
      return { statusCode: 200, body: 'No message' };
    }

    const msg = body.message;
    const chatId = msg.chat.id;

    if (msg.from.id !== ADMIN_ID) {
      return { statusCode: 200, body: 'Not admin' };
    }

    // /reset command
    if (msg.text && msg.text === '/reset') {
      await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "⚠️ **Delete ALL gallery items?** This will permanently remove all posts and cannot be undone.",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes, delete everything", callback_data: "reset_confirm" },
              { text: "❌ Cancel", callback_data: "reset_cancel" }
            ]
          ]
        }
      });
      return { statusCode: 200, body: 'Reset confirmation sent' };
    }

    // Upload post
    if (msg.photo && msg.caption) {
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;

      const fileInfo = await axios.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.data.result.file_path}`;

      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const links = msg.caption.match(urlRegex);
      const redirectLink = links ? links[0] : "";

      // Download image
      const imageResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data, 'binary');

      const fileName = `gallery/${Date.now()}_${fileId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('gallery-images')
        .upload(fileName, imageBuffer, {
          contentType: 'image/jpeg',
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('gallery-images')
        .getPublicUrl(fileName);

      const permanentImageUrl = urlData.publicUrl;

      const { data: insertData } = await axios.post(`${supabaseUrl}/rest/v1/items`, {
        image: permanentImageUrl,
        link: redirectLink,
        created_at: new Date().toISOString()
      }, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });

      const dbId = insertData[0].id;

      const sentMsg = await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ New post added!\n\nReply to this message with:\n/delete → delete post\n/update_thumbnail → update image\n/update_link → update link\n\nID: ${dbId}`
      });

      const messageId = sentMsg.data.result.message_id;

      await axios.post(`${supabaseUrl}/rest/v1/message_map`, {
        message_id: messageId,
        item_id: dbId
      }, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });

      return { statusCode: 200, body: 'Photo saved' };
    }

    // Reply-based actions
    if (msg.reply_to_message && msg.text) {
      const replyId = msg.reply_to_message.message_id;

      const { data: mappingData } = await axios.get(
        `${supabaseUrl}/rest/v1/message_map?message_id=eq.${replyId}&select=item_id`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );

      if (!mappingData || mappingData.length === 0) {
        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "❌ No post found for this message!"
        });
        return { statusCode: 200, body: 'No mapping found' };
      }

      const dbId = mappingData[0].item_id;

      // Delete
      if (msg.text.toLowerCase() === "/delete") {
        await axios.delete(`${supabaseUrl}/rest/v1/items?id=eq.${dbId}`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });

        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "✅ Post deleted!"
        });
      }

      // Update thumbnail
      else if (msg.text.toLowerCase() === "/update_thumbnail" && msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;

        const fileInfo = await axios.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.data.result.file_path}`;

        const imageResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        const fileName = `gallery/${Date.now()}_${fileId}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('gallery-images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '3600'
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('gallery-images')
          .getPublicUrl(fileName);
        const permanentImageUrl = urlData.publicUrl;

        await axios.patch(`${supabaseUrl}/rest/v1/items?id=eq.${dbId}`, {
          image: permanentImageUrl
        }, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        });

        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "✅ Thumbnail updated!"
        });
      }

      // Update link
      else if (msg.text.toLowerCase() === "/update_link") {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const links = msg.caption ? msg.caption.match(urlRegex) : [];
        const redirectLink = links ? links[0] : "";

        if (redirectLink) {
          await axios.patch(`${supabaseUrl}/rest/v1/items?id=eq.${dbId}`, {
            link: redirectLink
          }, {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          });

          await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: "✅ Link updated!"
          });
        } else {
          await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: "❌ No valid link found in caption!"
          });
        }
      }
    }

    // Fallback
    if (msg.text && !msg.reply_to_message && msg.text !== '/reset') {
      await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "🤖 Send me a photo with caption to add to your Viral Gallery!"
      });
    }

    return { statusCode: 200, body: 'ok' };

  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      body: 'Internal Server Error: ' + err.message
    };
  }
};