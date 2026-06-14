// supabase/seed.js
// Run: node supabase/seed.js
// Seeds the database with star account + initial group + sample posts

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function seed() {
  console.log('🌱 開始 Seed...\n');

  // ── 1. Star user: xiaohua ─────────────────────────────────────
  const passwordHash = await bcrypt.hash('0801', 10);

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('username', 'xiaohua')
    .single();

  let starId;

  if (existing) {
    starId = existing.id;
    console.log('✓ xiaohua 已存在，跳過建立');
  } else {
    const { data: star, error } = await supabase
      .from('users')
      .insert([{
        username: 'xiaohua',
        password_hash: passwordHash,
        display_name: '小花 🌸',
        bio: 'IAM 主理人 ✨ 每天都在這裡陪著你們\n喜歡音樂、旅行、還有每一個你 💜',
        avatar: 'https://api.dicebear.com/8.x/notionists/svg?seed=xiaohuastar&backgroundColor=7c3aed',
        cover: 'https://picsum.photos/seed/iam-cover/900/300',
        role: 'star',
        followers: 248600,
        following: 12,
        is_premium: true,
      }])
      .select('id')
      .single();

    if (error) { console.error('❌ 建立 xiaohua 失敗:', error.message); process.exit(1); }
    starId = star.id;
    console.log('✓ 建立 xiaohua (star)  id:', starId);
  }

  // ── 2. Group: IAM ─────────────────────────────────────────────
  const { data: existingGroup } = await supabase
    .from('groups')
    .select('id')
    .eq('id', 'iam')
    .single();

  if (!existingGroup) {
    const { error } = await supabase.from('groups').insert([{
      id: 'iam',
      name: 'IAM',
      description: '與小花最親密的高會空間',
      star_id: starId,
      price: 500,
      cover_url: 'https://picsum.photos/seed/iam-cover/900/300',
    }]);
    if (error) console.error('❌ 建立 group 失敗:', error.message);
    else console.log('✓ 建立 group: IAM');
  } else {
    console.log('✓ group IAM 已存在，跳過');
  }

  // ── 3. Sample posts ───────────────────────────────────────────
  const { data: existingPosts } = await supabase
    .from('posts')
    .select('id')
    .eq('author_id', starId)
    .limit(1);

  if (!existingPosts || existingPosts.length === 0) {
    const posts = [
      {
        author_id: starId,
        group_id: 'iam',
        content: '大家好！歡迎來到 IAM 高會 💜\n\n這裡是我們最親密的空間，我會在這裡分享最私密的日常、幕後花絮。謝謝你們的支持，我愛你們 🌸',
        media_url: '',
        media_type: 'text',
      },
      {
        author_id: starId,
        group_id: 'iam',
        content: '今天的拍攝現場花絮 📸\n\n這次服裝超美！大家猜猜是什麼主題？',
        media_url: 'https://picsum.photos/seed/iam-post2/600/800',
        media_type: 'image',
      },
      {
        author_id: starId,
        group_id: 'iam',
        content: '✨ 高會限定 ✨\n\n新歌的故事是這樣開始的…那天我坐在窗邊，靈感就來了。你們最近還好嗎？',
        media_url: '',
        media_type: 'text',
      },
    ];

    const { error } = await supabase.from('posts').insert(posts);
    if (error) console.error('❌ 建立貼文失敗:', error.message);
    else console.log('✓ 建立', posts.length, '篇初始貼文');
  } else {
    console.log('✓ 貼文已存在，跳過');
  }

  console.log('\n✅ Seed 完成！');
  console.log('   登入帳號: xiaohua / 0801');
  console.log('   群組: IAM (price: NT$500)');
}

seed().catch(err => { console.error('Seed 失敗:', err); process.exit(1); });
