const axios = require("axios");

const ADMIN_ID = 6354768795;

exports.handler = async (event) => {
  console.log('Function called with method:', event.httpMethod);

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

      // Insert into Supabase
      const { data } = await axios.post(`${SUPABASE_URL}/rest/v1/items`, {
        image: fileUrl,
        link: redirectLink,
        created_at: new Date().toISOString()
      }, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });

      const dbId = data[0].id;

      // Send confirmation with instructions to delete/update
      const sentMsg = await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ New post added!\n\nReply to this message with:\n/delete → delete post\n/update_thumbnail → update image\n/update_link → update link\n\nID: ${dbId}`
      });

      const messageId = sentMsg.data.result.message_id;
      
      // Save mapping: message_id → dbId in Supabase
      await axios.post(`${SUPABASE_URL}/rest/v1/message_map`, {
        message_id: messageId,
        item_id: dbId
      }, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return { 
        statusCode: 200, 
        body: 'Photo saved to Supabase',
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    // 2️⃣ Reply-based Delete/Update
    if (msg.reply_to_message && msg.text) {
      const replyId = msg.reply_to_message.message_id;
      
      // Get mapping from Supabase
      const { data: mappingData } = await axios.get(
        `${SUPABASE_URL}/rest/v1/message_map?message_id=eq.${replyId}&select=item_id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
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
        await axios.delete(`${SUPABASE_URL}/rest/v1/items?id=eq.${dbId}`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        });
        
        // Also delete from message_map
        await axios.delete(`${SUPABASE_URL}/rest/v1/message_map?message_id=eq.${replyId}`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        });
        
        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, { 
          chat_id: chatId, 
          text: "✅ Post deleted!" 
        });
      }

      // Update thumbnail
      else if (msg.text.toLowerCase() === "/update_thumbnail" && msg.photo) {
        const photo = msg.photo[msg.photo.length-1];
        const fileId = photo.file_id;
        const fileInfo = await axios.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.data.result.file_path}`;

        await axios.patch(`${SUPABASE_URL}/rest/v1/items?id=eq.${dbId}`, {
          image: fileUrl
        }, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
          await axios.patch(`${SUPABASE_URL}/rest/v1/items?id=eq.${dbId}`, {
            link: redirectLink
          }, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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

    // Handle simple text messages
    if (msg.text && !msg.reply_to_message) {
      await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "🤖 Send me a photo with caption to add to your Viral Gallery!"
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