/* =========================================================
   controllers/supervisorController.js
   منطق لوحة المشرفين:
   - تسجيل الدخول برمز 991
   - إضافة/خصم نقاط لأي طالب
   - عرض كل الطلاب مع باركود كل واحد
   - تسجيل حضور تلقائي عند مسح باركود الطالب بالكاميرا
   ========================================================= */

const pool = require("../config/db");
const studentModel = require("../models/studentModel");
const groupModel = require("../models/groupModel");
const megaGroupModel = require("../models/megaGroupModel");
const sessionModel = require("../models/sessionModel");
const archiveModel = require("../models/archiveModel");
const whatsappService = require("../services/whatsappService");

// الإدارة: تحكم كامل (كل ما كان متاحاً سابقاً بدون أي تعديل)
// المشرفون: تحضير (باركود + يدوي) + إضافة نقاط مبادرة فقط مع سبب إلزامي
// الرمزان يُضبَطان فقط عبر متغيرات البيئة (.env محلياً / متغيرات Railway في الإنتاج)
// ولا يوجد لهما أي قيمة افتراضية مكتوبة في الكود لتجنّب نشرها في المستودع العام
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const SUPERVISOR_ACCESS_CODE = process.env.SUPERVISOR_ACCESS_CODE || "";

// يقبل فقط مسارات داخلية تحت /supervisor/panel لمنع open-redirect عبر ?next=
function safeNextPath(next) {
  if (typeof next === "string" && next.startsWith("/supervisor/panel")) return next;
  return "/supervisor/panel";
}

/* -------- صفحة تسجيل الدخول -------- */
function showLoginPage(req, res) {
  const next = safeNextPath(req.query.next);
  if (req.session && req.session.isSupervisor) {
    return res.redirect(next);
  }
  res.render("supervisor-login", {
    pageTitle: "دخول المشرفين",
    activeNav: "supervisor",
    error: null,
    next,
  });
}

/* -------- معالجة تسجيل الدخول (يحدَّد الدور من الرمز نفسه) -------- */
function handleLogin(req, res) {
  const { accessCode } = req.body;
  const next = safeNextPath(req.body.next);

  let role = null;
  if (accessCode && ADMIN_ACCESS_CODE && accessCode === ADMIN_ACCESS_CODE) role = "admin";
  else if (accessCode && SUPERVISOR_ACCESS_CODE && accessCode === SUPERVISOR_ACCESS_CODE) role = "supervisor";

  if (role) {
    req.session.isSupervisor = true;
    req.session.role = role;
    return res.redirect(next);
  }

  res.render("supervisor-login", {
    pageTitle: "دخول المشرفين",
    activeNav: "supervisor",
    error: "رمز الدخول غير صحيح",
    next,
  });
}

/* -------- تسجيل الخروج -------- */
function handleLogout(req, res) {
  req.session.destroy(() => {
    res.redirect("/supervisor/login");
  });
}

/* -------- مساعد: قراءة إعداد scores_visible -------- */
async function getScoresVisible() {
  const [rows] = await pool.query("SELECT value FROM settings WHERE `key` = 'scores_visible'");
  return !rows.length || rows[0].value === 'true';
}

// لون بطاقة التحضير حسب الأسرة
const CARD_COLOR_BY_FAMILY = {
  "ابو عبدالله المانعي": "red",
  "ابو خالد المقرن": "red",
  "ابو خالد المهيزع": "blue",
  "ابو عبدالله المهنا": "blue",
  "ابو نايف الجريس": "purple",
  "ابو حمد المقرن": "purple",
};

/* -------- صفحة بطاقات التحضير القابلة للطباعة (بطاقة لكل طالب) -------- */
async function showAttendanceCards(req, res, next) {
  try {
    const students = await studentModel.getAllStudents();
    const cards = students.map((s) => ({
      name: s.name,
      barcode: s.barcode,
      groupName: s.group_name,
      color: CARD_COLOR_BY_FAMILY[s.group_name] || "red",
    }));

    res.render("attendance-cards", {
      pageTitle: "بطاقات التحضير",
      activeNav: "supervisor",
      cards,
    });
  } catch (err) {
    next(err);
  }
}

/* -------- لوحة التحكم الرئيسية للمشرف -------- */
async function showPanel(req, res, next) {
  try {
    await sessionModel.autoMarkAbsentForPastSessions();

    const students = await studentModel.getAllStudents();
    const groups = await groupModel.getAllGroupsSimple();
    const sessions = await sessionModel.getAllSessions();
    const megaGroups = await megaGroupModel.getAllMegaGroups();
    const scoresVisible = await getScoresVisible();
    const currentSession = await sessionModel.getCurrentOrNextSession();

    // جلب جميع سجلات الحضور ثم بناء map: { studentId: { sessionId: status } }
    const [attRows] = await pool.query("SELECT student_id, session_id, status FROM attendance");
    const attendanceMap = {};
    attRows.forEach(r => {
      if (!attendanceMap[r.student_id]) attendanceMap[r.student_id] = {};
      attendanceMap[r.student_id][r.session_id] = r.status;
    });

    // تجميع الطلاب حسب اسم مجموعتهم (أسرتهم) لقائمة الحضور بالجملة
    const groupsMap = {};
    students.forEach((s) => {
      if (!groupsMap[s.group_name]) {
        groupsMap[s.group_name] = { groupName: s.group_name, members: [] };
      }
      groupsMap[s.group_name].members.push({
        id: s.id,
        name: s.name,
        attendance: attendanceMap[s.id] || {},
      });
    });
    const allGroups = Object.values(groupsMap);

    res.render("supervisor-panel", {
      pageTitle: "لوحة المشرفين",
      activeNav: "supervisor",
      role: req.session.role || "admin",
      students,
      groups,
      sessions,
      megaGroups,
      attendanceMap,
      scoresVisible,
      allGroups,
      currentSessionId: currentSession ? currentSession.id : null,
    });
  } catch (err) {
    next(err);
  }
}

/* -------- API: إضافة طالب جديد (اسم + أسرة فقط) — إدارة فقط -------- */
async function addStudent(req, res, next) {
  try {
    const name = (req.body.name || "").trim();
    const groupId = Number(req.body.groupId);

    if (!name || !groupId) {
      return res.status(400).json({ success: false, message: "أدخل اسم الطالب واختر الأسرة" });
    }

    const student = await studentModel.createStudent(name, groupId);
    if (student && student.error) {
      return res.status(400).json({ success: false, message: student.error });
    }

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`إضافة طالب جديد: ${name} (${student.group_name})`]
    );

    res.json({ success: true, student });
  } catch (err) {
    next(err);
  }
}

/* -------- API: نقل طالب موجود إلى أسرة أخرى — إدارة فقط -------- */
async function moveStudent(req, res, next) {
  try {
    const studentId = Number(req.body.studentId);
    const groupId = Number(req.body.groupId);
    const name = (req.body.name || "").trim();

    if (!studentId || !groupId) {
      return res.status(400).json({ success: false, message: "اختر الطالب والأسرة" });
    }

    const before = await studentModel.getStudentById(studentId);
    if (!before) {
      return res.status(400).json({ success: false, message: "الطالب غير موجود" });
    }

    const student = await studentModel.moveStudentGroup(studentId, groupId, name);
    if (student && student.error) {
      return res.status(400).json({ success: false, message: student.error });
    }

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`نقل الطالب ${student.name} من ${before.group_name} إلى ${student.group_name}`]
    );

    res.json({ success: true, student });
  } catch (err) {
    next(err);
  }
}

/* -------- API: حذف طالب نهائياً (اسم + أسرة للتأكيد) — إدارة فقط -------- */
async function deleteStudent(req, res, next) {
  try {
    const name = (req.body.name || "").trim();
    const groupId = Number(req.body.groupId);

    if (!name || !groupId) {
      return res.status(400).json({ success: false, message: "أدخل اسم الطالب واختر الأسرة" });
    }

    const student = await studentModel.deleteStudent(name, groupId);
    if (student && student.error) {
      return res.status(400).json({ success: false, message: student.error });
    }

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`حذف الطالب: ${student.name} (${student.group_name})`]
    );

    res.json({ success: true, student });
  } catch (err) {
    next(err);
  }
}

/* -------- API: إضافة أو خصم نقاط لطالب -------- */
async function addPoints(req, res, next) {
  try {
    const { studentId, program, amount, reason, mode } = req.body;
    const category = (reason || "").trim();

    const studentIdNum = Number(studentId);
    let amountNum = Number(amount);

    // عدد النقاط محدود بقيم ثابتة (5 إلى 40) لكل من الإدارة والمشرفين
    const ALLOWED_AMOUNTS = [5, 10, 15, 20, 25, 30, 35, 40];
    if (!studentIdNum || !ALLOWED_AMOUNTS.includes(amountNum)) {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }

    // دور "المشرفين" المحدود: مبادرة فقط
    if (req.session.role !== "admin" && program !== "initiative") {
      return res.status(403).json({ success: false, message: "يمكنك فقط إضافة نقاط مبادرة / إنجاز مميز" });
    }

    if (program === "initiative" && !studentModel.INITIATIVE_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: "اختر أحد محاور المبادرات الأربعة" });
    }

    // mode: "add" إضافة أو "subtract" خصم
    if (mode === "subtract") amountNum = -amountNum;

    const result = await studentModel.addPointsToStudent(studentIdNum, program, amountNum, category);
    if (result && result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const actionLabel = mode === "subtract" ? "خصم" : "إضافة";
    const programLabel = program === "initiative" ? `مبادرة ${category}` : "البرنامج الذاتي";

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`${actionLabel} ${Math.abs(amountNum)} نقطة (${programLabel})`]
    );

    const updatedStudent = await studentModel.getStudentById(studentIdNum);
    res.json({ success: true, student: updatedStudent });
  } catch (err) {
    next(err);
  }
}

/* -------- API: تسجيل حضور يدوي لجلسة محددة -------- */
async function markAttendanceManual(req, res, next) {
  try {
    const { studentId, status, sessionId } = req.body;
    const studentIdNum = Number(studentId);
    const sessionIdNum = Number(sessionId);

    if (!studentIdNum || !status || !sessionIdNum) {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }

    const record = await studentModel.markAttendance(studentIdNum, status, sessionIdNum);
    const student = await studentModel.getStudentById(studentIdNum);

    res.json({ success: true, record, student });
  } catch (err) {
    next(err);
  }
}

/* -------- API: جلب إعدادات الذاتي الأسبوعية (متطلبان أو ثلاثة لكل أسبوع) -------- */
async function getSelfTaskConfig(req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT id, week_number, title, points FROM weekly_self_tasks ORDER BY week_number ASC, id ASC"
    );
    res.json({ success: true, config: rows });
  } catch (err) { next(err); }
}

/* -------- API: حفظ عنوان ونقاط كل متطلبات الذاتي الحالية -------- */
async function saveSelfTaskConfig(req, res, next) {
  try {
    const { configs } = req.body; // [{taskId, title, points}, ...]
    if (!Array.isArray(configs)) return res.status(400).json({ success: false });

    for (const { taskId, title, points } of configs) {
      const id = Number(taskId);
      const pts = Math.max(0, Number(points) || 0);
      const titleTrimmed = (title || "").trim();
      if (!id || !titleTrimmed) continue;
      await pool.query(
        "UPDATE weekly_self_tasks SET title = ?, points = ? WHERE id = ?",
        [titleTrimmed, pts, id]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
}

/* -------- API: إضافة متطلب ذاتي جديد لأسبوع معين -------- */
async function addSelfTask(req, res, next) {
  try {
    const weekNumber = Number(req.body.weekNumber);
    if (!weekNumber || weekNumber < 1 || weekNumber > 16) {
      return res.status(400).json({ success: false, message: "أدخل رقم أسبوع صحيح (1 إلى 16)" });
    }

    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS c FROM weekly_self_tasks WHERE week_number = ?",
      [weekNumber]
    );
    if (countRows[0].c >= 3) {
      return res.status(400).json({ success: false, message: "الحد الأقصى 3 متطلبات لكل أسبوع" });
    }

    const task = await studentModel.addSelfTask(weekNumber, `متطلب جديد - الأسبوع ${weekNumber}`, 0);

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`إضافة متطلب ذاتي جديد للأسبوع ${weekNumber}`]
    );

    res.json({ success: true, task });
  } catch (err) { next(err); }
}

/* -------- API: حذف متطلب ذاتي (يخصم النقاط ممن أنجزه أولاً) -------- */
async function deleteSelfTask(req, res, next) {
  try {
    const taskId = Number(req.body.taskId);
    if (!taskId) {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM weekly_self_tasks
       WHERE week_number = (SELECT week_number FROM weekly_self_tasks WHERE id = ?)`,
      [taskId]
    );
    if (countRows[0].c <= 2) {
      return res.status(400).json({ success: false, message: "لا يمكن أن يقل عدد متطلبات الأسبوع عن اثنين" });
    }

    await studentModel.deleteSelfTask(taskId);

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`حذف متطلب ذاتي (رقم ${taskId})`]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
}

/* -------- API: تأكيد/إلغاء إنجاز متطلب ذاتي معين لطالب -------- */
async function setSelfAchievementStatus(req, res, next) {
  try {
    const { studentId, taskId, done } = req.body;
    const studentIdNum = Number(studentId);
    const taskIdNum = Number(taskId);

    if (!studentIdNum || !taskIdNum || typeof done !== "boolean") {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }

    const result = await studentModel.setSelfAchievementDone(studentIdNum, taskIdNum, done);
    if (!result) {
      return res.status(404).json({ success: false, message: "المتطلب غير موجود" });
    }
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`تحديث إنجاز الذاتي "${result.title}" (الأسبوع ${result.week_number}) إلى ${done ? "مُنجز" : "غير مُنجز"}`]
    );

    res.json({ success: true, achievement: result });
  } catch (err) {
    next(err);
  }
}

/* -------- API: تبديل ظهور النقاط لعامة الزوار -------- */
async function toggleScoresVisible(req, res, next) {
  try {
    const current = await getScoresVisible();
    const next_val = current ? 'false' : 'true';
    await pool.query(
      "INSERT INTO settings (`key`, value) VALUES ('scores_visible', ?) ON DUPLICATE KEY UPDATE value = ?",
      [next_val, next_val]
    );
    res.json({ success: true, scoresVisible: next_val === 'true' });
  } catch (err) {
    next(err);
  }
}

/* -------- API: أرشفة نقاط الأسبوع الحالية ثم تصفير الذاتي (المبادرات لا تتأثر) -------- */
async function archiveWeekPoints(req, res, next) {
  try {
    const weekNumber = Number(req.body.weekNumber);
    if (!weekNumber || weekNumber <= 0) {
      return res.status(400).json({ success: false, message: "أدخل رقم أسبوع صحيح" });
    }

    const count = await archiveModel.archiveAndResetPoints(weekNumber);

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`أرشفة نقاط الأسبوع ${weekNumber} وتصفيرها لـ ${count} طالباً (بدون المبادرات)`]
    );

    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
}

/* -------- صفحة عرض أرشيف النقاط الأسبوعي -------- */
async function showPointsArchive(req, res, next) {
  try {
    const weeks = await archiveModel.getArchivedWeekNumbers();
    const selectedWeek = Number(req.query.week) || weeks[weeks.length - 1] || 1;
    const rows = weeks.length ? await archiveModel.getArchiveByWeek(selectedWeek) : [];

    res.render("points-archive", {
      pageTitle: "أرشيف النقاط الأسبوعي",
      activeNav: "supervisor",
      weeks,
      selectedWeek,
      rows,
    });
  } catch (err) {
    next(err);
  }
}

/* -------- API: تحديث رقم جوال طالب -------- */
async function updateStudentPhone(req, res, next) {
  try {
    const studentId = Number(req.body.studentId);
    const phone = (req.body.phone || "").trim();

    if (!studentId) {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }
    if (phone && !/^05\d{8}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "رقم الجوال يجب أن يكون بصيغة سعودية صحيحة (05xxxxxxxx)" });
    }

    await studentModel.updateStudentPhone(studentId, phone || null);
    res.json({ success: true, phone });
  } catch (err) {
    next(err);
  }
}

/* -------- صفحة تذكير نهاية الأسبوع (واتساب) -------- */
async function showWeeklyReminders(req, res, next) {
  try {
    const weekNumber = Math.min(16, Math.max(1, Number(req.query.week) || 1));
    const list = await studentModel.getWeeklyReminderList(weekNumber);

    res.render("weekly-reminders", {
      pageTitle: "تذكير نهاية الأسبوع",
      activeNav: "supervisor",
      weekNumber,
      list,
      whatsappConfigured: whatsappService.isConfigured(),
    });
  } catch (err) {
    next(err);
  }
}

/* -------- بناء نص/معاملات رسالة التذكير لطالب معيّن -------- */
function buildReminderParams(student, weekNumber) {
  const reasons = [];
  if (student.missedDays > 0) reasons.push("لم يحضر يوماً على الأقل من أيام الأسبوع");
  if (student.missedTasks > 0) reasons.push("لم يُنجز أحد متطلبات الذاتي");
  return [student.name, student.group_name, reasons.join(" و "), String(weekNumber)];
}

/* -------- API: إرسال تذكير واتساب رسمي لطالب واحد -------- */
async function sendWeeklyReminder(req, res, next) {
  try {
    const weekNumber = Number(req.body.weekNumber);
    const studentId = Number(req.body.studentId);
    if (!weekNumber || !studentId) {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }

    const list = await studentModel.getWeeklyReminderList(weekNumber);
    const student = list.find((s) => s.id === studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "الطالب غير موجود ضمن قائمة التذكير لهذا الأسبوع" });
    }
    if (!student.phone) {
      return res.status(400).json({ success: false, message: "لا يوجد رقم جوال مسجَّل لهذا الطالب" });
    }

    const result = await whatsappService.sendTemplateMessage(student.phone, buildReminderParams(student, weekNumber));
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`إرسال تذكير واتساب رسمي لـ ${student.name} (الأسبوع ${weekNumber})`]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/* -------- API: إرسال تذكير واتساب رسمي لكل طلاب القائمة دفعة واحدة -------- */
async function sendAllWeeklyReminders(req, res, next) {
  try {
    const weekNumber = Number(req.body.weekNumber);
    const studentIds = req.body.studentIds || [];

    if (!weekNumber) {
      return res.status(400).json({ success: false, message: "الرجاء تحديد أسبوع صحيح" });
    }

    const fullList = await studentModel.getWeeklyReminderList(weekNumber);
    // Filter list to only included studentIds, if provided
    const list = studentIds.length > 0
      ? fullList.filter(s => studentIds.includes(s.id))
      : fullList;

    const results = { sent: 0, failed: [] };

    for (const student of list) {
      if (!student.phone) {
        results.failed.push({ name: student.name, reason: "لا يوجد رقم جوال" });
        continue;
      }
      const result = await whatsappService.sendTemplateMessage(student.phone, buildReminderParams(student, weekNumber));
      if (result.success) {
        results.sent++;
      } else {
        results.failed.push({ name: student.name, reason: result.error });
      }
    }

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`إرسال تذكيرات واتساب لمجموعة للأسبوع ${weekNumber}: نجح ${results.sent}، فشل ${results.failed.length}`]
    );

    res.json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  showLoginPage,
  handleLogin,
  handleLogout,
  showPanel,
  showAttendanceCards,
  addStudent,
  moveStudent,
  deleteStudent,
  addPoints,
  markAttendanceManual,
  setSelfAchievementStatus,
  getSelfTaskConfig,
  saveSelfTaskConfig,
  addSelfTask,
  deleteSelfTask,
  toggleScoresVisible,
  archiveWeekPoints,
  showPointsArchive,
  updateStudentPhone,
  showWeeklyReminders,
  sendWeeklyReminder,
  sendAllWeeklyReminders,
};


async function updateCategoryPoints(req, res, next) {
  try {
    const { studentId, category, points } = req.body;
    await studentModel.updateCategoryPoints(studentId, category, points);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
module.exports.updateCategoryPoints = updateCategoryPoints;

module.exports.updateMegaGroupPoints = async (req, res) => {
  try {
    const { groupId, axis, points } = req.body;
    if (!groupId || !axis || points === undefined) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    await megaGroupModel.addPointsToMegaGroup(groupId, axis, parseInt(points, 10));
    res.json({ success: true });
  } catch (err) {
    console.error("updateMegaGroupPoints error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
module.exports.assignMegaGroup = async (req, res) => {
  try {
    const { groupId, megaGroupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ success: false, error: "Missing group id" });
    }
    await megaGroupModel.assignGroupToMegaGroup(groupId, megaGroupId || null);
    res.json({ success: true });
  } catch (err) {
    console.error("assignMegaGroup error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
