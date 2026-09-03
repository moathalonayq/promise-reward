-- =========================================================
-- schema.sql
-- هيكل قاعدة بيانات قسم قائد (MySQL)
-- =========================================================
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS weekly_points_archive;
DROP TABLE IF EXISTS initiatives;
DROP TABLE IF EXISTS self_achievements;
DROP TABLE IF EXISTS weekly_self_tasks;
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS `groups`;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS supervisors;
SET FOREIGN_KEY_CHECKS = 1;
-- =========================================================
-- جدول المجموعات
-- ("groups" كلمة محجوزة في MySQL لذلك نحيطها بـ backticks دائماً)
-- =========================================================
CREATE TABLE `groups` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category ENUM('الأولوية', 'الفئة العليا') NOT NULL DEFAULT 'الأولوية'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- =========================================================
-- جدول الطلاب
-- =========================================================
CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barcode VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  name_normalized VARCHAR(150) NULL,
  group_id INT NOT NULL,
  knowledge_points INT NOT NULL DEFAULT 0,
  attendance_points INT NOT NULL DEFAULT 0,
  guardian_phone VARCHAR(20),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_students_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  INDEX idx_students_group (group_id),
  INDEX idx_students_barcode (barcode)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- =========================================================
-- جدول تعريف "الذاتي" الأسبوعي — متطلبان أو ثلاثة لكل أسبوع (1 إلى 16)
-- تختار الإدارة/المشرفون عددها بحرية لكل أسبوع، ولكل متطلب نقاطه الخاصة
-- =========================================================
CREATE TABLE weekly_self_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_number INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  points INT NOT NULL DEFAULT 0,
  INDEX idx_self_tasks_week (week_number)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
INSERT INTO weekly_self_tasks (week_number, title, points)
VALUES (1, 'متطلب 1 - الأسبوع 1', 25),
  (1, 'متطلب 2 - الأسبوع 1', 25),
  (2, 'متطلب 1 - الأسبوع 2', 25),
  (2, 'متطلب 2 - الأسبوع 2', 25),
  (3, 'متطلب 1 - الأسبوع 3', 25),
  (3, 'متطلب 2 - الأسبوع 3', 25),
  (4, 'متطلب 1 - الأسبوع 4', 25),
  (4, 'متطلب 2 - الأسبوع 4', 25),
  (5, 'متطلب 1 - الأسبوع 5', 25),
  (5, 'متطلب 2 - الأسبوع 5', 25),
  (6, 'متطلب 1 - الأسبوع 6', 25),
  (6, 'متطلب 2 - الأسبوع 6', 25),
  (7, 'متطلب 1 - الأسبوع 7', 25),
  (7, 'متطلب 2 - الأسبوع 7', 25),
  (8, 'متطلب 1 - الأسبوع 8', 25),
  (8, 'متطلب 2 - الأسبوع 8', 25),
  (9, 'متطلب 1 - الأسبوع 9', 25),
  (9, 'متطلب 2 - الأسبوع 9', 25),
  (10, 'متطلب 1 - الأسبوع 10', 25),
  (10, 'متطلب 2 - الأسبوع 10', 25),
  (11, 'متطلب 1 - الأسبوع 11', 25),
  (11, 'متطلب 2 - الأسبوع 11', 25),
  (12, 'متطلب 1 - الأسبوع 12', 25),
  (12, 'متطلب 2 - الأسبوع 12', 25),
  (13, 'متطلب 1 - الأسبوع 13', 25),
  (13, 'متطلب 2 - الأسبوع 13', 25),
  (14, 'متطلب 1 - الأسبوع 14', 25),
  (14, 'متطلب 2 - الأسبوع 14', 25),
  (15, 'متطلب 1 - الأسبوع 15', 25),
  (15, 'متطلب 2 - الأسبوع 15', 25),
  (16, 'متطلب 1 - الأسبوع 16', 25),
  (16, 'متطلب 2 - الأسبوع 16', 25);
-- =========================================================
-- جدول إنجاز الذاتي لكل طالب — صف واحد فقط عند تأكيد إنجاز متطلب معين
-- (عدم وجود صف = لم يُنجز بعد). النقاط تُقرأ من weekly_self_tasks عند التأكيد
-- =========================================================
CREATE TABLE self_achievements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  task_id INT NOT NULL,
  points INT NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_self_ach_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_self_ach_task FOREIGN KEY (task_id) REFERENCES weekly_self_tasks(id) ON DELETE CASCADE,
  UNIQUE KEY uq_student_task (student_id, task_id),
  INDEX idx_self_ach_student (student_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- =========================================================
-- جدول المبادرات — محصورة في أربعة محاور ثابتة
-- (التقنية / الأدبية / الأصولية / المهارية)، والنقاط تُحدَّد عند الإنجاز
-- =========================================================
CREATE TABLE initiatives (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  category ENUM('التقنية', 'الأدبية', 'الأصولية', 'المهارية') NOT NULL,
  points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_initiatives_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_initiatives_student (student_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- =========================================================
-- جدول أرشيف النقاط الأسبوعي — لقطة (snapshot) لنقاط كل طالب
-- في نهاية أسبوع معين قبل تصفيرها للأسبوع التالي، للاستذكار لاحقاً
-- (المبادرات لا تُصفَّر أبداً ولا تُؤرشف هنا لأنها تبقى كما هي)
-- =========================================================
CREATE TABLE weekly_points_archive (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  week_number INT NOT NULL,
  knowledge_points INT NOT NULL DEFAULT 0,
  total_points INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_archive_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY uq_student_week (student_id, week_number),
  INDEX idx_archive_week (week_number)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- =========================================================
-- جدول جلسات النادي (32 جلسة ثابتة بتواريخ محددة مسبقاً)
-- 16 أسبوعاً × يومين (الاثنين والخميس) ابتداءً من 1448/3/17هـ (2026-08-31م)
-- week_number و day_name لتسهيل العرض المنظَّم في الواجهة
-- =========================================================
CREATE TABLE sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_date DATE NOT NULL UNIQUE,
  day_name VARCHAR(20) NOT NULL,
  week_number INT NOT NULL,
  points INT DEFAULT 15,
  INDEX idx_sessions_date (session_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
INSERT INTO sessions (session_date, day_name, week_number)
VALUES ('2026-09-10', 'الخميس', 1),
  ('2026-09-17', 'الخميس', 2),
  ('2026-09-24', 'الخميس', 3),
  ('2026-09-28', 'الإثنين', 3),
  ('2026-10-01', 'الخميس', 4),
  ('2026-10-08', 'الخميس', 5),
  ('2026-10-12', 'الإثنين', 5),
  ('2026-10-15', 'الخميس', 6),
  ('2026-10-22', 'الخميس', 7),
  ('2026-10-26', 'الإثنين', 7),
  ('2026-10-29', 'الخميس', 8),
  ('2026-11-05', 'الخميس', 9),
  ('2026-11-09', 'الإثنين', 9),
  ('2026-11-12', 'الخميس', 10),
  ('2026-11-19', 'الخميس', 11),
  ('2026-11-26', 'الخميس', 12),
  ('2026-11-30', 'الإثنين', 12),
  ('2026-12-03', 'الخميس', 13),
  ('2026-12-10', 'الخميس', 14),
  ('2026-12-14', 'الإثنين', 14),
  ('2026-12-17', 'الخميس', 15),
  ('2026-12-24', 'الخميس', 16);
-- =========================================================
-- جدول الحضور — كل سجل مرتبط بجلسة محددة من جدول sessions
-- =========================================================
CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  session_id INT NOT NULL,
  status ENUM('حاضر', 'متأخر', 'غايب') NOT NULL,
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_student_session (student_id, session_id),
  INDEX idx_attendance_student (student_id),
  INDEX idx_attendance_session (session_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- =========================================================
-- جدول سجل عمليات المشرفين (Activity Log)
-- =========================================================
CREATE TABLE activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- =========================================================
-- جدول إعدادات النادي العامة
-- =========================================================
CREATE TABLE settings (
  `key` VARCHAR(50) PRIMARY KEY,
  value VARCHAR(200) NOT NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
INSERT INTO settings (`key`, value)
VALUES ('total_weeks', '16'),
  ('days_per_week', '2'),
  ('season_name', 'الموسم 2026'),
  ('season_start_date', '2026-08-31'),
  ('scores_visible', 'true');
-- =========================================================
-- جدول المشرفين (دعم رمز دخول ثابت + إمكانية تعدد المشرفين لاحقاً)
-- =========================================================
CREATE TABLE supervisors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  access_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL DEFAULT 'المشرف'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
INSERT INTO supervisors (access_code, name)
VALUES ('991', 'مشرف عام');