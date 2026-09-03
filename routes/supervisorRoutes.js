/* =========================================================
   routes/supervisorRoutes.js
   ========================================================= */
const express = require("express");
const router = express.Router();
const supervisorController = require("../controllers/supervisorController");
const { requireSupervisorPage, requireSupervisorApi, requireAdminApi } = require("../middleware/requireSupervisor");

/* -------- صفحات -------- */
router.get("/supervisor/login", supervisorController.showLoginPage);
router.post("/supervisor/login", supervisorController.handleLogin);
router.post("/supervisor/logout", supervisorController.handleLogout);
router.get("/supervisor/panel", requireSupervisorPage, supervisorController.showPanel);
router.get("/supervisor/attendance-cards", requireSupervisorPage, supervisorController.showAttendanceCards);
router.get("/supervisor/points-archive", requireSupervisorPage, supervisorController.showPointsArchive);
router.get("/supervisor/weekly-reminders", requireSupervisorPage, supervisorController.showWeeklyReminders);

/* -------- API (محمية بجلسة المشرف) -------- */
router.post("/api/supervisor/students", requireAdminApi, supervisorController.addStudent);
router.post("/api/supervisor/students/move", requireAdminApi, supervisorController.moveStudent);
router.post("/api/supervisor/students/delete", requireAdminApi, supervisorController.deleteStudent);
router.post("/api/supervisor/students/phone", requireAdminApi, supervisorController.updateStudentPhone);
router.post("/api/supervisor/weekly-reminders/send", requireAdminApi, supervisorController.sendWeeklyReminder);
router.post("/api/supervisor/weekly-reminders/send-all", requireAdminApi, supervisorController.sendAllWeeklyReminders);
router.post("/api/supervisor/points", requireSupervisorApi, supervisorController.addPoints);
router.post("/api/supervisor/attendance", requireSupervisorApi, supervisorController.markAttendanceManual);
router.post("/api/supervisor/self-achievements", requireAdminApi, supervisorController.setSelfAchievementStatus);
router.get("/api/supervisor/self-task-config", requireAdminApi, supervisorController.getSelfTaskConfig);
router.post("/api/supervisor/self-task-config", requireAdminApi, supervisorController.saveSelfTaskConfig);
router.post("/api/supervisor/self-tasks/add", requireAdminApi, supervisorController.addSelfTask);
router.post("/api/supervisor/self-tasks/delete", requireAdminApi, supervisorController.deleteSelfTask);
router.post("/api/supervisor/toggle-scores", requireAdminApi, supervisorController.toggleScoresVisible);
router.post("/api/supervisor/archive-week", requireAdminApi, supervisorController.archiveWeekPoints);

router.post("/api/supervisor/category-points", requireSupervisorApi, supervisorController.updateCategoryPoints);
router.post("/api/supervisor/session-points", requireAdminApi, supervisorController.updateSessionPoints);
router.post("/api/supervisor/mega-groups/points", requireSupervisorApi, supervisorController.updateMegaGroupPoints);
router.post("/api/supervisor/mega-groups/assign", requireSupervisorApi, supervisorController.assignMegaGroup);

module.exports = router;
