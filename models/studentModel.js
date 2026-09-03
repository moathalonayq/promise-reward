/* =========================================================
   models/studentModel.js
   كل دوال الوصول لجدول الطلاب والجداول المرتبطة به
   (إنجاز ذاتي أسبوعي، مبادرات، حضور) - نسخة MySQL
   ========================================================= */

const pool = require("../config/db");
const { normalizeArabic } = require("../utils/arabicNormalize");
const INITIATIVE_CATEGORIES = ["التقنية", "الأدبية", "الأصولية", "المهارية"];

/* -------- جلب كل الطلاب مع اسم مجموعتهم وإجمالي نقاطهم -------- */
async function getAllStudents() {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.barcode, s.name, s.guardian_phone,
      s.knowledge_points, s.attendance_points, s.cultural_points, s.sports_points,
      g.id AS group_id, g.name AS group_name, g.category AS group_category,
      COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0) AS initiatives_points,
      (s.knowledge_points + s.attendance_points + COALESCE(s.cultural_points, 0) + COALESCE(s.sports_points, 0) + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)) AS total_points,
      COALESCE((SELECT COUNT(*) FROM attendance a WHERE a.student_id = s.id AND a.status IN ('حاضر','متأخر')), 0) AS attendance_count
    FROM students s
    JOIN \`groups\` g ON s.group_id = g.id
    ORDER BY total_points DESC, s.name ASC
  `);
  return rows;
}

/* -------- جلب طالب واحد مع كل تفاصيله الكاملة -------- */
async function getStudentById(id) {
  const [studentRows] = await pool.query(`
    SELECT
      s.id, s.barcode, s.name, s.guardian_phone,
      s.knowledge_points, s.attendance_points,
      g.id AS group_id, g.name AS group_name, g.category AS group_category
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    WHERE s.id = ?
  `, [id]);

  if (!studentRows.length) return null;
  const student = studentRows[0];

  // إنجاز الذاتي: كل متطلبات الأسابيع الـ16 المعرَّفة (متطلبان أو ثلاثة لكل أسبوع)،
  // مع حالة إنجاز الطالب لكل متطلب (LEFT JOIN حتى تظهر غير المُنجزة أيضاً)
  const [selfRows] = await pool.query(
    `SELECT wst.id AS task_id, wst.week_number, wst.title, wst.points AS task_points,
       sa.id AS achievement_id, sa.points AS earned_points, sa.confirmed_at
     FROM weekly_self_tasks wst
     LEFT JOIN self_achievements sa ON sa.task_id = wst.id AND sa.student_id = ?
     ORDER BY wst.week_number ASC, wst.id ASC`,
    [id]
  );

  const [initiativesRows] = await pool.query(
    "SELECT id, category, points, created_at FROM initiatives WHERE student_id = ? ORDER BY created_at DESC",
    [id]
  );
  // الحضور مرتبط بجلسات محددة (32 جلسة ثابتة)، نجلب تفاصيل الجلسة مع كل سجل
  // ونستخدم LEFT JOIN من sessions بدل INNER JOIN من attendance حتى تظهر
  // كل الجلسات للطالب، حتى التي لم تُسجَّل بعد (status تكون null)
  const [attendanceRows] = await pool.query(
    `SELECT
       sess.id AS session_id, sess.session_date, sess.day_name, sess.week_number,
       att.id AS attendance_id, att.status
     FROM sessions sess
     LEFT JOIN attendance att ON att.session_id = sess.id AND att.student_id = ?
     ORDER BY sess.session_date ASC`,
    [id]
  );

  student.self_achievements = selfRows.map((r) => ({
    task_id: r.task_id,
    week_number: r.week_number,
    title: r.title,
    task_points: r.task_points,
    done: r.achievement_id !== null,
    points: r.earned_points || 0,
    confirmed_at: r.confirmed_at,
  }));
  student.initiatives = initiativesRows;
  student.attendance = attendanceRows;
  student.initiatives_points = initiativesRows.reduce((sum, i) => sum + i.points, 0);
  // إجمالي الملف الشخصي فقط يضم نقاط المبادرات (بخلاف إجمالي جدول المجموعة الذي يستثنيها)
  student.total_points = student.knowledge_points + student.attendance_points
    + student.initiatives_points;

  return student;
}

/* -------- جلب طالب عبر الباركود (يستخدمها نظام مسح الباركود) -------- */
async function getStudentByBarcode(barcode) {
  const [rows] = await pool.query(
    "SELECT id FROM students WHERE barcode = ?",
    [barcode.trim()]
  );
  if (!rows.length) return null;
  return getStudentById(rows[0].id);
}

/* -------- البحث عن طلاب بالاسم --------
   يطابق أي كلمة من كلمات الاسم (الاسم الأول/الأب/العائلة...) تبدأ بنص البحث،
   وليس فقط بداية الاسم الكامل. النتائج تُرتَّب بحيث يُقدَّم تطابق الاسم الأول
   على تطابق اسم الأب ثم العائلة (حسب موضع الكلمة المطابقة داخل الاسم) */
async function searchStudentsByName(query) {
  const normalized = normalizeArabic(query);
  if (!normalized) return [];

  const [rows] = await pool.query(`
    SELECT
      s.id, s.barcode, s.name, s.name_normalized,
      g.name AS group_name,
      (s.knowledge_points + s.attendance_points) AS total_points
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    WHERE s.name_normalized LIKE ?
  `, [`%${normalized}%`]);

  const matched = rows
    .map((s) => {
      const words = s.name_normalized.split(/\s+/);
      const wordIndex = words.findIndex((w) => w.startsWith(normalized));
      return { ...s, wordIndex };
    })
    .filter((s) => s.wordIndex !== -1)
    .sort((a, b) => a.wordIndex - b.wordIndex || a.name.localeCompare(b.name, "ar"))
    .slice(0, 30)
    .map(({ name_normalized, wordIndex, ...rest }) => rest);

  return matched;
}

/* -------- أفضل الطلاب على مستوى النادي بالكامل للصفحة الرئيسية -------- */
async function getTopStudents(limit = 10) {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.name, g.name AS group_name,
      s.knowledge_points, s.attendance_points, s.cultural_points, s.sports_points,
      COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0) AS initiatives_points,
      (s.knowledge_points + s.attendance_points + COALESCE(s.cultural_points, 0) + COALESCE(s.sports_points, 0) + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)) AS total_points
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    ORDER BY total_points DESC, s.name ASC
    LIMIT ?
  `, [limit]);
  return rows;
}

/* -------- الترتيب العام للطالب بين كل طلاب النادي -------- */
async function getStudentRankOverall(studentId) {
  // الترتيب (بخلاف الإجمالي المعروض) يحتسب نقاط المبادرات أيضاً
  const [rows] = await pool.query(`
    SELECT s.id,
      (s.knowledge_points + s.attendance_points + COALESCE(s.cultural_points, 0) + COALESCE(s.sports_points, 0) + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)) AS total_points
    FROM students s
    ORDER BY total_points DESC
  `);
  const rank = rows.findIndex((s) => s.id === studentId) + 1;
  return { rank, total: rows.length };
}

/* -------- ترتيب طالب داخل مجموعته فقط (تُستخدم في بوابة ولي الأمر) -------- */
async function getStudentRankInGroup(studentId, groupId) {
  // الترتيب (بخلاف الإجمالي المعروض) يحتسب نقاط المبادرات أيضاً
  const [rows] = await pool.query(`
    SELECT id, name,
      (knowledge_points + attendance_points + COALESCE(cultural_points, 0) + COALESCE(sports_points, 0) + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = students.id), 0)) AS total_points
    FROM students
    WHERE group_id = ?
    ORDER BY total_points DESC
  `, [groupId]);

  const rank = rows.findIndex((s) => s.id === studentId) + 1;
  return { rank, groupSize: rows.length };
}

/* -------- إضافة (أو خصم) نقاط لطالب في برنامج معين -------- */
async function addPointsToStudent(studentId, program, amount, category) {
  if (program === "initiative") {
    if (!INITIATIVE_CATEGORIES.includes(category)) {
      return { error: "اختر أحد محاور المبادرات الأربعة" };
    }
    // المبادرات تُسجَّل كسطر منفصل وتقبل قيمة سالبة (خصم) أيضاً
    await pool.query(
      "INSERT INTO initiatives (student_id, category, points) VALUES (?, ?, ?)",
      [studentId, category, amount]
    );
    return {};
  }

  const column = { knowledge: "knowledge_points" }[program];
  if (!column) return { error: "برنامج غير معروف" };

  // نمنع وصول النقاط لأقل من صفر عند الخصم
  // GREATEST() متوفرة بنفس الاسم في MySQL أيضاً
  await pool.query(
    `UPDATE students SET ${column} = GREATEST(${column} + ?, 0) WHERE id = ?`,
    [amount, studentId]
  );
  return {};
}

/* -------- تسجيل حضور لجلسة محددة (يدوي من المشرف، تلقائي عبر الباركود، أو ذاتي من الطالب) --------
   المنطق هنا يقارن الحالة السابقة بالجديدة حتى لا تُضاف/تُخصم النقاط أكثر من مرة
   عند إعادة تسجيل نفس الحالة أو التبديل بين "حاضر" و"متأخر". */
async function markAttendance(studentId, status, sessionId) {
  const PRESENT_STATUSES = ["حاضر", "متأخر"];

  const [sessionRows] = await pool.query("SELECT points FROM sessions WHERE id = ?", [sessionId]);
  const ATTENDANCE_POINTS = (sessionRows[0] && sessionRows[0].points != null) ? sessionRows[0].points : 15;

  const [rows] = await pool.query(
    "SELECT status FROM attendance WHERE student_id = ? AND session_id = ?",
    [studentId, sessionId]
  );
  const wasPresent = rows.length > 0 && PRESENT_STATUSES.includes(rows[0].status);
  
  if (rows.length === 0) {
    await pool.query(
      "INSERT INTO attendance (student_id, session_id, status) VALUES (?, ?, ?)",
      [studentId, sessionId, status]
    );
  } else {
    await pool.query(
      "UPDATE attendance SET status = ? WHERE student_id = ? AND session_id = ?",
      [status, studentId, sessionId]
    );
  }

  const isPresent = PRESENT_STATUSES.includes(status);
  if (wasPresent !== isPresent) {
    const delta = isPresent ? ATTENDANCE_POINTS : -ATTENDANCE_POINTS;
    await pool.query(
      "UPDATE students SET attendance_points = GREATEST(attendance_points + ?, 0) WHERE id = ?",
      [delta, studentId]
    );
  }
  
  const [resRows] = await pool.query(
    `SELECT att.id, att.status, sess.id AS session_id, sess.session_date, sess.day_name, sess.week_number
     FROM attendance att
     JOIN sessions sess ON sess.id = att.session_id
     WHERE att.student_id = ? AND att.session_id = ?`,
    [studentId, sessionId]
  );
  return resRows[0];
}

/* -------- هل تم تسجيل حضور الطالب لجلسة معينة بالفعل؟ -------- */
async function getAttendanceForSession(studentId, sessionId) {
  const [rows] = await pool.query(
    "SELECT status FROM attendance WHERE student_id = ? AND session_id = ?",
    [studentId, sessionId]
  );
  return rows[0] || null;
}

/* -------- تأكيد/إلغاء إنجاز متطلب "ذاتي" معين لطالب --------
   النقاط تُقرأ من weekly_self_tasks عند التأكيد وتبقى محفوظة في self_achievements
   حتى لو تغيّرت قيمة المتطلب لاحقاً في الإعدادات العامة */
async function setSelfAchievementDone(studentId, taskId, done) {
  const [taskRows] = await pool.query(
    "SELECT id, week_number, title, points FROM weekly_self_tasks WHERE id = ?",
    [taskId]
  );
  if (!taskRows.length) return null;
  const task = taskRows[0];

  const [existing] = await pool.query(
    "SELECT id, points FROM self_achievements WHERE student_id = ? AND task_id = ?",
    [studentId, taskId]
  );

  if (done && !existing.length) {
    if (!task.points || task.points <= 0) {
      return { error: "لا يمكن إنجاز هذا المتطلب لأن نقاطه صفرية من إعدادات الذاتي" };
    }
    const programStartDate = new Date("2026-09-10T00:00:00");
    const now = new Date();
    // Calculate the current week number (Week 1 starts on Sep 10, Week 2 on Sep 17, etc.)
    const diffTime = Math.max(0, now.getTime() - programStartDate.getTime());
    const currentWeekNumber = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000)) + 1;
    
    let awardedPoints = task.points;
    if (task.week_number < currentWeekNumber) {
      awardedPoints = Math.round(task.points / 2);
    }
    
    await pool.query(
      "INSERT INTO self_achievements (student_id, task_id, points) VALUES (?, ?, ?)",
      [studentId, taskId, awardedPoints]
    );
    await pool.query(
      "UPDATE students SET knowledge_points = GREATEST(knowledge_points + ?, 0) WHERE id = ?",
      [awardedPoints, studentId]
    );
  } else if (!done && existing.length) {
    const prevPoints = Number(existing[0].points) || 0;
    await pool.query("DELETE FROM self_achievements WHERE id = ?", [existing[0].id]);
    await pool.query(
      "UPDATE students SET knowledge_points = GREATEST(knowledge_points - ?, 0) WHERE id = ?",
      [prevPoints, studentId]
    );
  }

  return task;
}

  /* -------- إضافة متطلب ذاتي جديد لأسبوع معين -------- */
async function addSelfTask(weekNumber, title, points) {
  const [result] = await pool.query(
    "INSERT INTO weekly_self_tasks (week_number, title, points) VALUES (?, ?, ?)",
    [weekNumber, title, points]
  );
  return { id: result.insertId, week_number: weekNumber, title, points };
}

/* -------- حذف متطلب ذاتي، مع خصم النقاط ممن أنجزه من الطلاب أولاً -------- */
async function deleteSelfTask(taskId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [earners] = await conn.query(
      "SELECT student_id, points FROM self_achievements WHERE task_id = ?",
      [taskId]
    );
    for (const e of earners) {
      await conn.query(
        "UPDATE students SET knowledge_points = GREATEST(knowledge_points - ?, 0) WHERE id = ?",
        [e.points, e.student_id]
      );
    }
    // self_achievements تُحذف تلقائياً عبر ON DELETE CASCADE
    await conn.query("DELETE FROM weekly_self_tasks WHERE id = ?", [taskId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* -------- إنشاء طالب جديد (من لوحة الإدارة) مع باركود فريد -------- */
async function createStudent(name, groupId) {
  const [groupRows] = await pool.query("SELECT id FROM `groups` WHERE id = ?", [groupId]);
  if (!groupRows.length) return { error: "المجموعة غير موجودة" };

  const [maxRows] = await pool.query(
    "SELECT MAX(CAST(SUBSTRING(barcode, 7) AS UNSIGNED)) AS maxIdx FROM students WHERE barcode LIKE 'QC%'"
  );
  const year = new Date().getFullYear();
  const nextIndex = (maxRows[0].maxIdx || 0) + 1;
  const barcode = `QC${year}${String(nextIndex).padStart(4, "0")}`;

  const [result] = await pool.query(
    `INSERT INTO students (barcode, name, name_normalized, group_id, knowledge_points, attendance_points)
     VALUES (?, ?, ?, ?, 0, 0)`,
    [barcode, name, normalizeArabic(name), groupId]
  );
  const studentId = result.insertId;

  return getStudentById(studentId);
}

/* -------- نقل طالب موجود إلى أسرة أخرى (تصحيح توزيع)، مع إمكانية تصحيح الاسم -------- */
async function moveStudentGroup(studentId, groupId, name) {
  const [groupRows] = await pool.query("SELECT id FROM `groups` WHERE id = ?", [groupId]);
  if (!groupRows.length) return { error: "المجموعة غير موجودة" };

  const [studentRows] = await pool.query("SELECT id FROM students WHERE id = ?", [studentId]);
  if (!studentRows.length) return { error: "الطالب غير موجود" };

  if (name && name.trim()) {
    await pool.query(
      "UPDATE students SET group_id = ?, name = ?, name_normalized = ? WHERE id = ?",
      [groupId, name.trim(), normalizeArabic(name.trim()), studentId]
    );
  } else {
    await pool.query("UPDATE students SET group_id = ? WHERE id = ?", [groupId, studentId]);
  }

  return getStudentById(studentId);
}

/* -------- حذف طالب نهائياً مع كل بياناته المرتبطة (يُحدَّد بالاسم + الأسرة) -------- */
async function deleteStudent(name, groupId) {
  const normalized = normalizeArabic((name || "").trim());
  const [matches] = await pool.query(
    "SELECT id FROM students WHERE group_id = ? AND name_normalized = ?",
    [groupId, normalized]
  );
  if (!matches.length) return { error: "لم يتم العثور على طالب بهذا الاسم في هذه الأسرة" };
  if (matches.length > 1) return { error: "يوجد أكثر من طالب بنفس الاسم في هذه الأسرة، تواصل مع الدعم" };

  const studentId = matches[0].id;
  const student = await getStudentById(studentId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM attendance WHERE student_id = ?", [studentId]);
    await conn.query("DELETE FROM self_achievements WHERE student_id = ?", [studentId]);
    await conn.query("DELETE FROM initiatives WHERE student_id = ?", [studentId]);
    await conn.query("DELETE FROM weekly_points_archive WHERE student_id = ?", [studentId]);
    await conn.query("DELETE FROM students WHERE id = ?", [studentId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return student;
}

/* -------- تحديث رقم جوال الطالب (لأغراض التواصل عبر واتساب) -------- */
async function updateStudentPhone(studentId, phone) {
  await pool.query("UPDATE students SET guardian_phone = ? WHERE id = ?", [phone, studentId]);
}

/* -------- قائمة الطلاب الذين لم يُنجزوا أحد متطلبات الذاتي أو لم يحضروا أحد أيام أسبوع معين --------
   تُستخدم لتذكيرهم نهاية الأسبوع عبر واتساب */
async function getWeeklyReminderList(weekNumber) {
  const [sessions] = await pool.query("SELECT id FROM sessions WHERE week_number = ?", [weekNumber]);
  const sessionIds = sessions.map((s) => s.id);

  const [tasks] = await pool.query("SELECT id FROM weekly_self_tasks WHERE week_number = ?", [weekNumber]);
  const taskIds = tasks.map((t) => t.id);

  if (!sessionIds.length && !taskIds.length) return [];

  const [students] = await pool.query(`
    SELECT s.id, s.name, s.guardian_phone AS phone, g.name AS group_name
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    ORDER BY g.name ASC, s.name ASC
  `);

  const attendedSet = new Set();
  if (sessionIds.length) {
    const [attRows] = await pool.query(
      "SELECT student_id, session_id FROM attendance WHERE session_id IN (?) AND status IN ('حاضر','متأخر')",
      [sessionIds]
    );
    attRows.forEach((r) => attendedSet.add(`${r.student_id}-${r.session_id}`));
  }

  const achievedSet = new Set();
  if (taskIds.length) {
    const [achRows] = await pool.query(
      "SELECT student_id, task_id FROM self_achievements WHERE task_id IN (?)",
      [taskIds]
    );
    achRows.forEach((r) => achievedSet.add(`${r.student_id}-${r.task_id}`));
  }

  const result = [];
  for (const s of students) {
    const missedDays = sessionIds.filter((sid) => !attendedSet.has(`${s.id}-${sid}`)).length;
    const missedTasks = taskIds.filter((tid) => !achievedSet.has(`${s.id}-${tid}`)).length;
    if (missedDays > 0 || missedTasks > 0) {
      result.push({
        id: s.id, name: s.name, phone: s.phone, group_name: s.group_name,
        missedDays, missedTasks,
      });
    }
  }
  return result;
}

module.exports = {
  INITIATIVE_CATEGORIES,
  getAllStudents,
  getStudentById,
  getStudentByBarcode,
  searchStudentsByName,
  getTopStudents,
  getStudentRankInGroup,
  addPointsToStudent,
  markAttendance,
  getAttendanceForSession,
  setSelfAchievementDone,
  updateStudentPhone,
  getWeeklyReminderList,
  addSelfTask,
  deleteSelfTask,
  createStudent,
  moveStudentGroup,
  deleteStudent,
  getStudentRankOverall,
};


async function updateCategoryPoints(studentId, category, points) {
  if (category === "cultural") {
    await pool.query("UPDATE students SET cultural_points = ? WHERE id = ?", [points, studentId]);
  } else if (category === "sports") {
    await pool.query("UPDATE students SET sports_points = ? WHERE id = ?", [points, studentId]);
  }
}
module.exports.updateCategoryPoints = updateCategoryPoints;

