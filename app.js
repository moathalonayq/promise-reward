/* =========================================================
   app.js
   نقطة تشغيل تطبيق Express لموقع قسم قائد
   ========================================================= */

require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");

const homeRoutes = require("./routes/homeRoutes");
const guardianRoutes = require("./routes/guardianRoutes");
const groupRoutes = require("./routes/groupRoutes");
const supervisorRoutes = require("./routes/supervisorRoutes");
const displayRoutes = require("./routes/displayRoutes");
const dailyAttendanceRoutes = require("./routes/dailyAttendanceRoutes");
const megaGroupRoutes = require("./routes/megaGroupRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// نثق بالبروكسي الأمامي (Railway) حتى يتعرّف Express على أن الاتصال HTTPS فعلياً
// عبر ترويسة X-Forwarded-Proto، وإلا فلن يُحفَظ كوكي الجلسة (secure: true) أبداً
// ويفشل تسجيل دخول المشرف/الإدارة في الإنتاج رغم صحة الرمز
// Auto-migrate new columns
const pool = require("./config/db");
(async () => {
  try {
    await pool.query("ALTER TABLE students ADD COLUMN cultural_points INT DEFAULT 0, ADD COLUMN sports_points INT DEFAULT 0");
    console.log("Auto-migration: Added cultural/sports points columns");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") {
      console.error("Auto-migration error:", err);
    }
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mega_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        cultural_points INT DEFAULT 0,
        sports_points INT DEFAULT 0,
        audience_points INT DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const megaGroups = [
      ["العطاء", 0, 0, 0],
      ["البناء", 0, 0, 0],
      ["الإخاء", 0, 0, 0]
    ];

    for (const mg of megaGroups) {
      await pool.query(
        "INSERT IGNORE INTO mega_groups (name, cultural_points, sports_points, audience_points) VALUES (?, ?, ?, ?)",
        mg
      );
    }
    console.log("Auto-migration: Mega groups setup complete");
  } catch (err) {
    console.error("Auto-migration mega groups error:", err);
  }

  try {
    await pool.query("ALTER TABLE `groups` ADD COLUMN mega_group_id INT DEFAULT NULL");
    await pool.query("ALTER TABLE `groups` ADD CONSTRAINT fk_mega_group FOREIGN KEY (mega_group_id) REFERENCES mega_groups(id) ON DELETE SET NULL");
    console.log("Auto-migration: Added mega_group_id to groups table");
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') {
      console.error("Auto-migration mega_group_id error:", err);
    }
  }

  try {
    const requiredDates = ["2026-09-10", "2026-09-17", "2026-09-24", "2026-09-28", "2026-10-01", "2026-10-08", "2026-10-12", "2026-10-15", "2026-10-22", "2026-10-26", "2026-10-29", "2026-11-05", "2026-11-09", "2026-11-12", "2026-11-19", "2026-11-26", "2026-11-30", "2026-12-03", "2026-12-10", "2026-12-14", "2026-12-17", "2026-12-24"];

    // Find old sessions
    const [oldSessions] = await pool.query("SELECT id FROM sessions WHERE session_date NOT IN (?)", [requiredDates]);
    if (oldSessions.length > 0) {
      console.log(`Migrating sessions table... found ${oldSessions.length} old sessions to delete.`);
      const oldIds = oldSessions.map(r => r.id);

      // Delete attendance for those sessions first (in case ON DELETE CASCADE is missing)
      await pool.query("DELETE FROM attendance WHERE session_id IN (?)", [oldIds]);

      // Delete the old sessions
      await pool.query("DELETE FROM sessions WHERE id IN (?)", [oldIds]);
      console.log("Old sessions and their attendance deleted.");
    }

    // Insert the required dates if they don't exist
    const sessionsToInsert = [
      ["2026-09-10", "الخميس", 1],
      ["2026-09-17", "الخميس", 2],
      ["2026-09-24", "الخميس", 3],
      ["2026-09-28", "الإثنين", 3],
      ["2026-10-01", "الخميس", 4],
      ["2026-10-08", "الخميس", 5],
      ["2026-10-12", "الإثنين", 5],
      ["2026-10-15", "الخميس", 6],
      ["2026-10-22", "الخميس", 7],
      ["2026-10-26", "الإثنين", 7],
      ["2026-10-29", "الخميس", 8],
      ["2026-11-05", "الخميس", 9],
      ["2026-11-09", "الإثنين", 9],
      ["2026-11-12", "الخميس", 10],
      ["2026-11-19", "الخميس", 11],
      ["2026-11-26", "الخميس", 12],
      ["2026-11-30", "الإثنين", 12],
      ["2026-12-03", "الخميس", 13],
      ["2026-12-10", "الخميس", 14],
      ["2026-12-14", "الإثنين", 14],
      ["2026-12-17", "الخميس", 15],
      ["2026-12-24", "الخميس", 16]
    ];

    for (const s of sessionsToInsert) {
      await pool.query("INSERT IGNORE INTO sessions (session_date, day_name, week_number) VALUES (?, ?, ?)", s);
    }
  } catch (err) {
    console.error("Auto-migration sessions error:", err);
  }

  try {
    await pool.query("ALTER TABLE sessions ADD COLUMN points INT DEFAULT 15");
    console.log("Auto-migration: Added points column to sessions table");
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') {
      console.error("Auto-migration sessions points error:", err);
    }
  }
})();

app.set("trust proxy", 1);

/* -------- محرك القوالب EJS -------- */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* -------- قراءة بيانات النماذج (form-data) و JSON -------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* -------- الملفات الثابتة (CSS / JS / صور) -------- */
app.use(express.static(path.join(__dirname, "public")));

/* -------- الجلسات (لتسجيل دخول المشرف) -------- */
app.use(session({
  secret: process.env.SESSION_SECRET || "qayrawan-club-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 يوماً
    secure: process.env.NODE_ENV === "production",
  },
}));

/* -------- متغيرات عامة متاحة في كل القوالب -------- */
app.use((req, res, next) => {
  res.locals.isSupervisor = !!(req.session && req.session.isSupervisor);
  res.locals.currentYear = new Date().getFullYear();
  next();
});

/* -------- المسارات -------- */
app.use("/", homeRoutes);
app.use("/", guardianRoutes);
app.use("/", groupRoutes);
app.use("/", supervisorRoutes);
app.use("/", displayRoutes);
app.use("/", dailyAttendanceRoutes);
app.use("/mega-groups", megaGroupRoutes);

/* -------- صفحة 404 -------- */
app.use((req, res) => {
  res.status(404).render("404", { pageTitle: "الصفحة غير موجودة", activeNav: "" });
});

/* -------- معالج الأخطاء العام -------- */
app.use((err, req, res, next) => {
  console.error("❌ خطأ في التطبيق:", err);
  res.status(500).render("error", {
    pageTitle: "حدث خطأ",
    activeNav: "",
    message: process.env.NODE_ENV === "production"
      ? "حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً"
      : err.message,
  });
});

// نُشغّل الخادم فقط عند تشغيل هذا الملف مباشرة (node app.js / npm start)
// وليس عند استدعائه من ملفات الاختبار (require("../app")) حتى لا يحجز
// منفذاً فعلياً أثناء تشغيل supertest، الذي ينشئ خادمه المؤقت بنفسه.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 الموقع يعمل الآن على المنفذ ${PORT}`);
  });
}

module.exports = app;
