// src/controllers/bubbleController.js
// 泡泡功能：
//   粉絲視角 → 看起來像一對一聊天（只看到自己與明星的訊息）
//   明星視角 → 群聊（可看所有粉絲訊息，也可選定一位回覆）

const { supabaseAdmin } = require('../lib/supabase');

// GET /api/bubble/messages?fan_id=xxx
// fan_id 只有明星可傳，用來查看特定粉絲的訊息
async function getMessages(req, res) {
  try {
    const isStar = req.user.role === 'star';
    const { fan_id, limit = 50 } = req.query;

    let query = supabaseAdmin
      .from('bubble_messages')
      .select(`
        id, sender_id, receiver_id, content, is_broadcast, created_at,
        sender:sender_id ( id, display_name, avatar, role )
      `)
      .order('created_at', { ascending: true })
      .limit(Number(limit));

    if (isStar) {
      if (fan_id) {
        // 明星查看特定粉絲的對話
        query = query.or(`sender_id.eq.${fan_id},receiver_id.eq.${fan_id}`);
      }
      // 若沒有 fan_id，明星看全部訊息（群聊模式）
    } else {
      // 粉絲只能看自己的對話：自己發的 + 星星發給自己的 + 廣播
      query = query.or(
        `sender_id.eq.${req.user.id},receiver_id.eq.${req.user.id},is_broadcast.eq.true`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ messages: data || [] });
  } catch (err) {
    console.error('[getMessages]', err);
    res.status(500).json({ error: '取得訊息失敗' });
  }
}

// POST /api/bubble/send
// body: { content, receiver_id?, is_broadcast? }
//   - 粉絲：receiver_id = star id
//   - 明星群發：is_broadcast = true
//   - 明星私訊特定粉絲：receiver_id = fan id
async function sendMessage(req, res) {
  try {
    const { content, receiver_id = null, is_broadcast = false } = req.body;
    const isStar = req.user.role === 'star';

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '訊息不能為空' });
    }

    // If star broadcasts, insert one message per fan
    if (isStar && is_broadcast) {
      const { data: fans } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'fan')
        .eq('is_premium', true); // only premium fans get broadcasts

      if (!fans || fans.length === 0) {
        return res.status(200).json({ message: '目前沒有高會粉絲', sent: 0 });
      }

      const rows = fans.map(f => ({
        sender_id: req.user.id,
        receiver_id: f.id,
        content: content.trim(),
        is_broadcast: true,
      }));

      const { error } = await supabaseAdmin.from('bubble_messages').insert(rows);
      if (error) throw error;

      return res.status(201).json({ success: true, sent: fans.length });
    }

    // Single message
    if (!receiver_id) {
      return res.status(400).json({ error: '請指定接收者' });
    }

    const { data: msg, error } = await supabaseAdmin
      .from('bubble_messages')
      .insert([{
        sender_id: req.user.id,
        receiver_id,
        content: content.trim(),
        is_broadcast: false,
      }])
      .select(`
        id, sender_id, receiver_id, content, is_broadcast, created_at,
        sender:sender_id ( id, display_name, avatar, role )
      `)
      .single();

    if (error) throw error;
    res.status(201).json({ message: msg });
  } catch (err) {
    console.error('[sendMessage]', err);
    res.status(500).json({ error: '發送訊息失敗' });
  }
}

// GET /api/bubble/fans  (star only) — list fans who have sent messages
async function getFanList(req, res) {
  try {
    if (req.user.role !== 'star') {
      return res.status(403).json({ error: '僅限明星帳號' });
    }

    const { data, error } = await supabaseAdmin
      .from('bubble_messages')
      .select('sender_id, users:sender_id( id, display_name, avatar )')
      .neq('sender_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Deduplicate by sender_id
    const seen = new Set();
    const fans = [];
    (data || []).forEach(row => {
      if (!seen.has(row.sender_id)) {
        seen.add(row.sender_id);
        fans.push(row.users);
      }
    });

    res.json({ fans });
  } catch (err) {
    console.error('[getFanList]', err);
    res.status(500).json({ error: '取得粉絲列表失敗' });
  }
}

module.exports = { getMessages, sendMessage, getFanList };
