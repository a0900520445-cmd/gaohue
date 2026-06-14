// src/controllers/groupController.js

const { supabaseAdmin } = require('../lib/supabase');

// GET /api/groups
async function listGroups(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('groups')
      .select(`
        id, name, description, price, cover_url, created_at,
        users:star_id ( id, display_name, avatar ),
        group_members ( count )
      `);

    if (error) throw error;

    // Attach member count + whether current user is member
    const userId = req.user ? req.user.id : null;
    let memberIds = new Set();
    if (userId) {
      const { data: memberships } = await supabaseAdmin
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);
      (memberships || []).forEach(m => memberIds.add(m.group_id));
    }

    const groups = (data || []).map(g => ({
      ...g,
      member_count: g.group_members?.[0]?.count ?? 0,
      is_member: memberIds.has(g.id),
      group_members: undefined,
    }));

    res.json({ groups });
  } catch (err) {
    console.error('[listGroups]', err);
    res.status(500).json({ error: '取得團體列表失敗' });
  }
}

// GET /api/groups/:id
async function getGroup(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('groups')
      .select(`
        id, name, description, price, cover_url, created_at,
        users:star_id ( id, display_name, avatar, bio, followers )
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: '團體不存在' });

    const isMember = req.user ? await checkMembership(data.id, req.user.id) : false;
    res.json({ group: { ...data, is_member: isMember } });
  } catch (err) {
    console.error('[getGroup]', err);
    res.status(500).json({ error: '取得團體資訊失敗' });
  }
}

// POST /api/groups/:id/unlock
// Body: { payment_method, payment_token }  (real impl: use Stripe/ECPay here)
async function unlockGroup(req, res) {
  try {
    const { id: group_id } = req.params;
    const user_id = req.user.id;

    // Check group exists
    const { data: group } = await supabaseAdmin
      .from('groups')
      .select('id, name, price')
      .eq('id', group_id)
      .single();

    if (!group) return res.status(404).json({ error: '團體不存在' });

    // Check already unlocked
    const already = await checkMembership(group_id, user_id);
    if (already) return res.status(409).json({ error: '你已是高會會員' });

    // ── PAYMENT SIMULATION ───────────────────────────────────────
    // In production: call Stripe or ECPay here to charge NT$500
    // For demo we just record the unlock directly
    // ────────────────────────────────────────────────────────────

    // Record payment
    await supabaseAdmin.from('payments').insert([{
      user_id,
      group_id,
      amount: group.price || 500,
      currency: 'TWD',
      status: 'paid',
      method: req.body.payment_method || 'demo',
    }]);

    // Add membership
    await supabaseAdmin.from('group_members').insert([{ user_id, group_id }]);

    // Mark user as premium
    await supabaseAdmin.from('users').update({ is_premium: true }).eq('id', user_id);

    res.status(201).json({ success: true, message: '成功解鎖 ' + group.name + ' 高會！' });
  } catch (err) {
    console.error('[unlockGroup]', err);
    res.status(500).json({ error: '解鎖失敗，請稍後再試' });
  }
}

// Helper
async function checkMembership(group_id, user_id) {
  const { data } = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', group_id)
    .eq('user_id', user_id)
    .single();
  return !!data;
}

module.exports = { listGroups, getGroup, unlockGroup };
