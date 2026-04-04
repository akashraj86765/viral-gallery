const axios = require("axios");
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const ADMIN_ID = 6354768795; // Your Telegram user ID
const MAX_POSTS = 100; // Maximum number of posts to keep

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

    // Upload post with COMPRESSION and AUTO-DELETE old posts
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

      // Compress image
      console.log(`Compressing image: original size = ${(imageBuffer.length / 1024).toFixed(2)} KB`);
      
      const compressedBuffer = await sharp(imageBuffer)
        .resize(800, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .webp({ quality: 70 })
        .toBuffer();
      
      console.log(`Compressed size = ${(compressedBuffer.length / 1024).toFixed(2)} KB`);

      const fileName = `gallery/${Date.now()}_${fileId}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('gallery-images')
        .upload(fileName, compressedBuffer, {
          contentType: 'image/webp',
          cacheControl: '31536000'
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('gallery-images')
        .getPublicUrl(fileName);

      const permanentImageUrl = urlData.publicUrl;

      // Insert new item
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

      // ------------------- DELETE OLD POSTS (keep only last MAX_POSTS) -------------------
      // Get current count of items
      const { data: countData } = await axios.get(`${supabaseUrl}/rest/v1/items?select=id&order=created_at.desc`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (countData && countData.length > MAX_POSTS) {
        // Get IDs of items to delete (exceeding MAX_POSTS)
        const idsToDelete = countData.slice(MAX_POSTS).map(item => item.id);
        
        if (idsToDelete.length > 0) {
          // Delete old items one by one (cascade will delete from message_map too)
          for (const id of idsToDelete) {
            await axios.delete(`${supabaseUrl}/rest/v1/items?id=eq.${id}`, {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              }
            });
          }
          console.log(`Deleted ${idsToDelete.length} old posts. Keeping last ${MAX_POSTS} posts.`);
        }
      }

      // Send confirmation
      const sentMsg = await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ New post added!\n\nNow showing latest ${MAX_POSTS} posts. Older posts auto-deleted.\n\nReply to this message with:\n/delete → delete post\n/update_thumbnail → update image\n/update_link → update link\n\nID: ${dbId}`
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

    // Reply-based actions (delete, update thumbnail, update link) - same as before
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
        
        const compressedBuffer = await sharp(imageBuffer)
          .resize(800, null, { withoutEnlargement: true, fit: 'inside' })
          .webp({ quality: 70 })
          .toBuffer();

        const fileName = `gallery/${Date.now()}_${fileId}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('gallery-images')
          .upload(fileName, compressedBuffer, {
            contentType: 'image/webp',
            cacheControl: '31536000'
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
        text: "🤖 Send me a photo with caption to add to your Viral Gallery!\n\nLatest 100 posts are kept automatically."
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