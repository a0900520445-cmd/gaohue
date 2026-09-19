import express from 'express'
import bcrypt from 'bcryptjs'
const router = express.Router()

// ── 教師登入驗證中介層 ─────────────────────────────────────
function requireTeacher(req, res, next) {
  if (req.session && req.session.teacherId) return next()
  res.status(401).json({ success: false, message: '請先登入教師帳號' })
}

function requireVicePrincipal(req, res, next) {
  if (req.session && req.session.teacherRole === 'vice_principal') return next()
  if (req.session && req.session.userId) return next() // 後台管理員也可以
  res.status(403).json({ success: false, message: '需要副校長或管理員權限' })
}

function canManageSalary(req, res, next) {
  if ((req.session && req.session.teacherRole === 'vice_principal') || req.session.userId) return next()
  res.status(403).json({ success: false, message: '無權限管理薪資' })
}

// ── 教師登入 ──────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.json({ success: false, message: '請輸入帳號密碼' })
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM teachers WHERE username=$1', [username])
    if (r.rows.length === 0) return res.json({ success: false, message: '帳號或密碼錯誤' })
    const teacher = r.rows[0]
    const ok = await bcrypt.compare(password, teacher.password_hash)
    if (!ok) return res.json({ success: false, message: '帳號或密碼錯誤' })
    req.session.teacherId = teacher.id
    req.session.teacherName = teacher.name
    req.session.teacherRole = teacher.role
    req.session.teacherClass = teacher.class_name
    req.session.teacherUsername = teacher.username
    res.json({ success: true, teacher: { id: teacher.id, name: teacher.name, role: teacher.role, class_name: teacher.class_name } })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/logout', (req, res) => {
  req.session.destroy()
  res.json({ success: true })
})

router.get('/me', requireTeacher, (req, res) => {
  res.json({
    success: true,
    teacher: {
      id: req.session.teacherId,
      name: req.session.teacherName,
      role: req.session.teacherRole,
      class_name: req.session.teacherClass,
      username: req.session.teacherUsername
    }
  })
})

// ── 修改自身密碼 ────────────────────────────────────────────
router.put('/change-password', requireTeacher, async (req, res) => {
  const { old_password, new_password } = req.body
  if (!old_password || !new_password) return res.json({ success: false, message: '請填寫所有欄位' })
  if (new_password.length < 4) return res.json({ success: false, message: '新密碼至少 4 個字元' })
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM teachers WHERE id=$1', [req.session.teacherId])
    const ok = await bcrypt.compare(old_password, r.rows[0].password_hash)
    if (!ok) return res.json({ success: false, message: '舊密碼不正確' })
    const hash = await bcrypt.hash(new_password, 10)
    await pool.query('UPDATE teachers SET password_hash=$1 WHERE id=$2', [hash, req.session.teacherId])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 薪資查詢（教師自己查） ────────────────────────────────
router.post('/salary/query', async (req, res) => {
  const { username, password } = req.body
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM teachers WHERE username=$1', [username])
    if (r.rows.length === 0) return res.json({ success: false, message: '帳號或密碼錯誤' })
    const teacher = r.rows[0]
    const ok = await bcrypt.compare(password, teacher.password_hash)
    if (!ok) return res.json({ success: false, message: '帳號或密碼錯誤' })
    const month = new Date().toISOString().slice(0, 7)
    const salaryR = await pool.query('SELECT * FROM teacher_salary WHERE teacher_id=$1 AND month=$2', [teacher.id, month])
    const bonusR = await pool.query('SELECT * FROM teacher_bonus WHERE teacher_id=$1 AND month=$2 ORDER BY created_at DESC', [teacher.id, month])
    const base = salaryR.rows[0]?.base_salary || 0
    const bonuses = bonusR.rows
    const totalBonus = bonuses.reduce((s, b) => s + b.amount, 0)
    res.json({
      success: true,
      teacher: { name: teacher.name, class_name: teacher.class_name },
      month,
      base_salary: base,
      bonuses,
      total: base + totalBonus
    })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 薪資管理（副校長或後台管理員） ────────────────────────
router.get('/salary/all', canManageSalary, async (req, res) => {
  const pool = req.app.locals.pool
  const month = req.query.month || new Date().toISOString().slice(0, 7)
  try {
    const teachers = await pool.query('SELECT id,name,class_name,role FROM teachers ORDER BY id')
    const result = []
    for (const t of teachers.rows) {
      const salaryR = await pool.query('SELECT base_salary FROM teacher_salary WHERE teacher_id=$1 AND month=$2', [t.id, month])
      const bonusR = await pool.query('SELECT * FROM teacher_bonus WHERE teacher_id=$1 AND month=$2 ORDER BY created_at DESC', [t.id, month])
      const base = salaryR.rows[0]?.base_salary || 0
      const bonuses = bonusR.rows
      result.push({ ...t, base_salary: base, bonuses, total: base + bonuses.reduce((s, b) => s + b.amount, 0) })
    }
    res.json({ success: true, data: result, month })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.put('/salary/base', canManageSalary, async (req, res) => {
  const { teacher_id, month, base_salary } = req.body
  const pool = req.app.locals.pool
  try {
    await pool.query(
      `INSERT INTO teacher_salary (teacher_id,month,base_salary) VALUES ($1,$2,$3)
       ON CONFLICT (teacher_id,month) DO UPDATE SET base_salary=$3`,
      [teacher_id, month, base_salary]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/salary/bonus', canManageSalary, async (req, res) => {
  const { teacher_id, month, amount, reason } = req.body
  if (!teacher_id || !month || !amount || !reason) return res.json({ success: false, message: '請填寫所有欄位' })
  const pool = req.app.locals.pool
  try {
    await pool.query(
      'INSERT INTO teacher_bonus (teacher_id,month,amount,reason) VALUES ($1,$2,$3,$4)',
      [teacher_id, month, amount, reason]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.delete('/salary/bonus/:id', canManageSalary, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query('DELETE FROM teacher_bonus WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 教師管理（副校長可管理其他教師帳號）──────────────────
router.get('/list', canManageSalary, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT id,username,name,class_name,role FROM teachers ORDER BY id')
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.put('/reset-password/:id', requireVicePrincipal, async (req, res) => {
  const { new_password } = req.body
  if (!new_password || new_password.length < 4) return res.json({ success: false, message: '密碼至少 4 個字元' })
  const pool = req.app.locals.pool
  try {
    const hash = await bcrypt.hash(new_password, 10)
    await pool.query('UPDATE teachers SET password_hash=$1 WHERE id=$2', [hash, req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 課堂系統 ──────────────────────────────────────────────
function genCode(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase()
}

router.get('/classrooms', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM classrooms WHERE teacher_id=$1 ORDER BY created_at DESC', [req.session.teacherId])
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/classrooms', requireTeacher, async (req, res) => {
  const { name } = req.body
  if (!name) return res.json({ success: false, message: '請輸入課堂名稱' })
  const pool = req.app.locals.pool
  try {
    let code = genCode()
    let exists = true
    while (exists) {
      const check = await pool.query('SELECT id FROM classrooms WHERE code=$1', [code])
      if (check.rows.length === 0) exists = false
      else code = genCode()
    }
    const r = await pool.query(
      'INSERT INTO classrooms (teacher_id,name,code) VALUES ($1,$2,$3) RETURNING *',
      [req.session.teacherId, name, code]
    )
    res.json({ success: true, data: r.rows[0] })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.delete('/classrooms/:id', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query('DELETE FROM classrooms WHERE id=$1 AND teacher_id=$2', [req.params.id, req.session.teacherId])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// 課堂成員
router.get('/classrooms/:id/members', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(`
      SELECT cm.*, s.name, s.class_name FROM classroom_members cm
      JOIN students s ON s.student_id = cm.student_id
      WHERE cm.classroom_id=$1`, [req.params.id])
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/classrooms/:id/members', requireTeacher, async (req, res) => {
  const { student_id } = req.body
  const pool = req.app.locals.pool
  try {
    await pool.query(
      'INSERT INTO classroom_members (classroom_id,student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, student_id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.delete('/classrooms/:id/members/:sid', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query('DELETE FROM classroom_members WHERE classroom_id=$1 AND student_id=$2', [req.params.id, req.params.sid])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// 作業
router.get('/classrooms/:id/assignments', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM assignments WHERE classroom_id=$1 ORDER BY created_at DESC', [req.params.id])
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/classrooms/:id/assignments', requireTeacher, async (req, res) => {
  const { title, description, due_date } = req.body
  if (!title) return res.json({ success: false, message: '請填寫作業標題' })
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(
      'INSERT INTO assignments (classroom_id,teacher_id,title,description,due_date) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, req.session.teacherId, title, description || null, due_date || null]
    )
    res.json({ success: true, data: r.rows[0] })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// 作業批改（評分）
router.put('/assignments/:id/grade', requireTeacher, async (req, res) => {
  const { student_id, score, feedback } = req.body
  const pool = req.app.locals.pool
  try {
    await pool.query(
      `UPDATE assignment_submissions SET score=$1, feedback=$2 WHERE assignment_id=$3 AND student_id=$4`,
      [score, feedback || null, req.params.id, student_id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/assignments/:id/submissions', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(`
      SELECT sub.*, s.name, s.class_name FROM assignment_submissions sub
      JOIN students s ON s.student_id = sub.student_id
      WHERE sub.assignment_id=$1 ORDER BY sub.submitted_at DESC`, [req.params.id])
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// 課堂留言
router.get('/classrooms/:id/messages', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM classroom_messages WHERE classroom_id=$1 ORDER BY created_at ASC LIMIT 100', [req.params.id])
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/classrooms/:id/messages', requireTeacher, async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) return res.json({ success: false })
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(
      'INSERT INTO classroom_messages (classroom_id,sender_id,sender_name,sender_role,content) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, req.session.teacherUsername, req.session.teacherName, 'teacher', content.trim()]
    )
    res.json({ success: true, data: r.rows[0] })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 教師加點功能 ──────────────────────────────────────────
// 取得學生列表（班導師看自己班，其他身份可看全部但只能單一加點）
router.get('/students', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(`
      SELECT s.*, COALESCE(SUM(p.points),0) AS total_points
      FROM students s
      LEFT JOIN point_records p ON p.student_id = s.student_id
      GROUP BY s.id ORDER BY s.class_name, s.student_id`)
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// 單一學生加點
router.post('/points', requireTeacher, async (req, res) => {
  const { student_id, points, reason } = req.body
  if (!student_id || points === undefined || points === null || points === '')
    return res.json({ success: false, message: '請填寫學號與點數' })
  const pool = req.app.locals.pool
  try {
    // 查學生資料（確保存在）
    const sr = await pool.query('SELECT * FROM students WHERE student_id=$1', [student_id])
    if (sr.rows.length === 0) return res.json({ success: false, message: '查無此學號' })
    const s = sr.rows[0]
    // 確保學生在 students 表（已存在就 upsert）
    await pool.query(
      `INSERT INTO students (student_id,name,class_name) VALUES ($1,$2,$3)
       ON CONFLICT (student_id) DO NOTHING`,
      [s.student_id, s.name, s.class_name]
    )
    await pool.query(
      'INSERT INTO point_records (student_id,points,reason) VALUES ($1,$2,$3)',
      [student_id, parseInt(points), reason || null]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// 班級整體加點（只有班導師可以對自己班學生使用）
router.post('/points/bulk', requireTeacher, async (req, res) => {
  const pool = req.app.locals.pool
  const { points, reason } = req.body
  const teacherClass = req.session.teacherClass

  if (!teacherClass) return res.json({ success: false, message: '你沒有任課班級' })
  if (points === undefined || points === null || points === '')
    return res.json({ success: false, message: '請填寫點數' })

  try {
    const sr = await pool.query('SELECT * FROM students WHERE class_name=$1', [teacherClass])
    const students = sr.rows
    if (students.length === 0) return res.json({ success: false, message: '此班級尚無學生資料' })

    for (const s of students) {
      await pool.query(
        'INSERT INTO point_records (student_id,points,reason) VALUES ($1,$2,$3)',
        [s.student_id, parseInt(points), reason || null]
      )
    }
    res.json({ success: true, count: students.length })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

export default router
