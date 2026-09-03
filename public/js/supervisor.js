/* =========================================================
   public/js/supervisor.js
   منطق لوحة المشرفين:
   - إضافة / خصم نقاط (AJAX)
   - قائمة الحضور بالجملة حسب الأسر (AJAX)
   - عرض/طباعة باركود QR لكل طالب
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const assignMegaGroupForm = document.getElementById("assignMegaGroupForm");
  if (assignMegaGroupForm) {
    assignMegaGroupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const groupId = document.getElementById("assignGroupId").value;
      const megaGroupId = document.getElementById("assignMegaGroupId").value;

      const btn = document.getElementById("assignSubmitBtn");
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "جاري الحفظ...";

      try {
        const res = await fetch("/api/supervisor/mega-groups/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId, megaGroupId })
        });
        const data = await res.json();
        if (data.success) {
          alert("تم حفظ الربط بنجاح!");
          window.location.reload();
        } else {
          alert(data.error || "حدث خطأ");
        }
      } catch (err) {
        alert("خطأ في الاتصال");
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    });
  }

  const megaGroupForm = document.getElementById("megaGroupForm");
  if (megaGroupForm) {
    megaGroupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const groupId = document.getElementById("megaGroupId").value;
      const axis = document.getElementById("megaGroupAxis").value;
      const points = document.getElementById("megaGroupPoints").value;

      const btn = document.getElementById("megaGroupSubmitBtn");
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "جاري التحديث...";

      try {
        const res = await fetch("/supervisor/api/supervisor/mega-groups/points", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId, axis, points })
        });
        const data = await res.json();
        if (data.success) {
          alert("تم تحديث النقاط بنجاح!");
          window.location.reload();
        } else {
          alert(data.error || "حدث خطأ");
        }
      } catch (err) {
        alert("خطأ في الاتصال");
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    });
  }

  setupStudentSearchSelects();
  setupPointsForm();
  setupCatPointsForm();
  setupKnowledgeTasksPanel();
  setupBarcodeModal();
  setupGlobalToggleScores();
  setupAttendanceListByFamily();
  setupAddStudentForm();
  setupDeleteStudentForm();
  setupMoveStudentForm();
  setupPhoneInputs();
});

/* =========================================================
   0.06) حفظ رقم جوال الطالب تلقائياً عند تعديله (إدارة فقط)
   ========================================================= */
function setupPhoneInputs() {
  document.querySelectorAll(".phone-input").forEach((input) => {
    const original = input.value;
    input.addEventListener("change", async () => {
      const phone = input.value.trim();
      if (phone && !/^05\d{8}$/.test(phone)) {
        alert("رقم الجوال يجب أن يكون بصيغة سعودية صحيحة (05xxxxxxxx)");
        input.value = original;
        return;
      }
      const studentId = input.dataset.studentId;
      input.disabled = true;
      try {
        const res = await fetch("/api/supervisor/students/phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, phone }),
        });
        const data = await res.json();
        if (!data.success) {
          alert(data.message || "حدث خطأ");
          input.value = original;
        } else {
          input.style.borderColor = "var(--teal)";
          setTimeout(() => { input.style.borderColor = ""; }, 1200);
        }
      } catch (e) {
        alert("حدث خطأ في الاتصال بالخادم");
        input.value = original;
      } finally {
        input.disabled = false;
      }
    });
  });
}

/* =========================================================
   0.1) إضافة طالب جديد (إدارة فقط)
   ========================================================= */
function setupAddStudentForm() {
  const btn = document.getElementById("addStudentBtn");
  const msg = document.getElementById("addStudentMsg");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const nameInput = document.getElementById("newStudentName");
    const groupSelect = document.getElementById("newStudentGroup");
    const name = nameInput.value.trim();
    const groupId = groupSelect.value;

    if (!name) {
      showMsg(msg, "أدخل اسم الطالب", "error");
      return;
    }
    if (!groupId) {
      showMsg(msg, "اختر الأسرة", "error");
      return;
    }

    btn.disabled = true;
    try {
      const res = await fetch("/api/supervisor/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, groupId }),
      });
      const data = await res.json();
      if (!data.success) {
        showMsg(msg, data.message || "حدث خطأ", "error");
        return;
      }
      showMsg(msg, `✅ تمت إضافة "${data.student.name}" إلى ${data.student.group_name} (باركود: ${data.student.barcode})`, "success");
      nameInput.value = "";
      groupSelect.value = "";
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/* =========================================================
   0.15) حذف طالب (إدارة فقط)
   ========================================================= */
function setupDeleteStudentForm() {
  const btn = document.getElementById("deleteStudentBtn");
  const msg = document.getElementById("deleteStudentMsg");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const nameInput = document.getElementById("deleteStudentName");
    const groupSelect = document.getElementById("deleteStudentGroup");
    const name = nameInput.value.trim();
    const groupId = groupSelect.value;

    if (!name) {
      showMsg(msg, "أدخل اسم الطالب", "error");
      return;
    }
    if (!groupId) {
      showMsg(msg, "اختر الأسرة", "error");
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف الطالب "${name}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }

    btn.disabled = true;
    try {
      const res = await fetch("/api/supervisor/students/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, groupId }),
      });
      const data = await res.json();
      if (!data.success) {
        showMsg(msg, data.message || "حدث خطأ", "error");
        return;
      }
      showMsg(msg, `✅ تم حذف "${data.student.name}" من ${data.student.group_name}`, "success");
      nameInput.value = "";
      groupSelect.value = "";
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/* =========================================================
   0.2) نقل طالب موجود إلى أسرة أخرى (إدارة فقط)
   ========================================================= */
function setupMoveStudentForm() {
  const btn = document.getElementById("moveStudentBtn");
  const msg = document.getElementById("moveStudentMsg");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const studentId = document.getElementById("moveStudentSelect").value;
    const groupSelect = document.getElementById("moveStudentGroup");
    const groupId = groupSelect.value;

    if (!studentId) {
      showMsg(msg, "اختر الطالب", "error");
      return;
    }
    if (!groupId) {
      showMsg(msg, "اختر الأسرة الجديدة", "error");
      return;
    }

    btn.disabled = true;
    try {
      const res = await fetch("/api/supervisor/students/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, groupId }),
      });
      const data = await res.json();
      if (!data.success) {
        showMsg(msg, data.message || "حدث خطأ", "error");
        return;
      }
      showMsg(msg, `✅ تم نقل "${data.student.name}" إلى ${data.student.group_name}`, "success");
      document.getElementById("moveStudentSearch").value = "";
      document.getElementById("moveStudentSelect").value = "";
      groupSelect.value = "";
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/* =========================================================
   0.3) قائمة الحضور بالجملة: أزرار الأسر
   ========================================================= */
function setupAttendanceListByFamily() {
  const dataEl = document.getElementById("attendanceGroupsDataJson");
  const sessionSelect = document.getElementById("attListSessionSelect");
  if (!dataEl || !sessionSelect) return;

  const allGroups = JSON.parse(dataEl.textContent);

  window.showFamilyAttendance = function (index) {
    const group = allGroups[index];

    document.getElementById("familyPickerLevel").classList.add("hidden");
    document.getElementById("familyDetailLevel").classList.remove("hidden");
    document.getElementById("familyDetailTitle").textContent = group.groupName + " (" + group.members.length + " طالب)";

    const body = document.getElementById("familyDetailBody");
    body.innerHTML = group.members.map((m) => `
      <div class="attendance-row" data-student-id="${m.id}" data-attendance='${JSON.stringify(m.attendance)}'>
        <span class="attendance-row-name">${m.name}</span>
        <div class="attendance-row-actions">
          <button type="button" class="att-btn att-present" data-status="حاضر">حاضر</button>
          <button type="button" class="att-btn att-late" data-status="متأخر">متأخر</button>
          <button type="button" class="att-btn att-absent" data-status="غايب">غايب</button>
        </div>
      </div>
    `).join("");

    attachAttendanceRowHandlers(sessionSelect);
    refreshAttendanceButtonStates(sessionSelect);
  };

  window.backToFamilyPicker = function () {
    document.getElementById("familyDetailLevel").classList.add("hidden");
    document.getElementById("familyPickerLevel").classList.remove("hidden");
  };

  sessionSelect.addEventListener("change", () => refreshAttendanceButtonStates(sessionSelect));
}

function refreshAttendanceButtonStates(sessionSelect) {
  const sessionId = sessionSelect.value;
  document.querySelectorAll("#familyDetailBody .attendance-row").forEach((row) => {
    const attendance = JSON.parse(row.dataset.attendance || "{}");
    const status = attendance[sessionId] || null;
    row.querySelectorAll(".att-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.status === status);
    });
  });
}

function attachAttendanceRowHandlers(sessionSelect) {
  document.querySelectorAll("#familyDetailBody .attendance-row").forEach((row) => {
    row.querySelectorAll(".att-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const studentId = row.dataset.studentId;
        const sessionId = sessionSelect.value;
        const status = btn.dataset.status;

        btn.disabled = true;
        try {
          const res = await fetch("/api/supervisor/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId, sessionId, status }),
          });
          const data = await res.json();
          if (!data.success) throw new Error();

          const attendance = JSON.parse(row.dataset.attendance || "{}");
          attendance[sessionId] = status;
          row.dataset.attendance = JSON.stringify(attendance);

          row.querySelectorAll(".att-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.status === status);
          });
        } catch (e) {
          alert("حدث خطأ، حاول مرة أخرى");
        } finally {
          btn.disabled = false;
        }
      });
    });
  });
}

/* =========================================================
   زر إخفاء / إظهار أعمدة النقاط في جدول المشرف فقط
   ========================================================= */
function setupToggleScores() {
  const btn = document.getElementById("toggleScoresBtn");
  if (!btn) return;
  let hidden = false;
  btn.addEventListener("click", () => {
    hidden = !hidden;
    document.querySelectorAll(".col-scores").forEach(el => {
      el.style.display = hidden ? "none" : "";
    });
    btn.textContent = hidden ? "إظهار النقاط" : "إخفاء النقاط";
  });
}

/* =========================================================
   زر إخفاء / إظهار النقاط عالمياً لجميع الزوار
   ========================================================= */
const SCORES_PIN = "135";

function setupGlobalToggleScores() {
  const btn = document.getElementById("globalToggleScoresBtn");
  const msg = document.getElementById("scoresToggleMsg");
  const statusText = document.getElementById("scoresStatusText");
  const pinInput = document.getElementById("scoresPinInput");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const pin = pinInput ? pinInput.value.trim() : "";
    if (pin !== SCORES_PIN) {
      msg.textContent = "❌ الرمز غير صحيح";
      msg.style.color = "#dc2626";
      if (pinInput) { pinInput.value = ""; pinInput.focus(); }
      setTimeout(() => { msg.textContent = ""; msg.style.color = ""; }, 2500);
      return;
    }

    btn.disabled = true;
    try {
      const res = await fetch("/api/supervisor/toggle-scores", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error();
      const visible = data.scoresVisible;
      statusText.textContent = visible ? "ظاهرة ✅" : "مخفية 🔒";
      statusText.className = "scores-status-badge " + (visible ? "badge-visible" : "badge-hidden");
      btn.textContent = visible ? "🔒 إخفاء النقاط" : "✅ إظهار النقاط";
      btn.className = "btn " + (visible ? "btn-danger-outline" : "btn-primary");
      msg.style.color = "#16a34a";
      msg.textContent = visible ? "✅ تم إظهار النقاط للزوار" : "🔒 تم إخفاء النقاط عن الزوار";
      if (pinInput) pinInput.value = "";
      setTimeout(() => { msg.textContent = ""; msg.style.color = ""; }, 3000);
    } catch {
      msg.textContent = "حدث خطأ";
      msg.style.color = "#dc2626";
    } finally {
      btn.disabled = false;
    }
  });

  // إرسال بالضغط على Enter في حقل الرمز
  if (pinInput) {
    pinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btn.click();
    });
  }
}

/* =========================================================
   0) قائمة بحث سريعة بالكتابة لاختيار الطالب
   تُستخدم بدل القائمة المنسدلة الطويلة في نموذجي النقاط والحضور
   ========================================================= */
function setupStudentSearchSelects() {
  const dataEl = document.getElementById("studentsDataJson");
  if (!dataEl) return;

  const students = JSON.parse(dataEl.textContent)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  setupStudentSearchSelect("moveStudentSearch", "moveStudentResults", "moveStudentSelect", students);

  setupGroupStudentPicker("initiativeGroupPicker", "initiativeStudentPicker", "initiativeStudentSelect", students);
  setupGroupStudentPicker("catPointsGroupPicker", "catPointsStudentPicker", "catPointsStudentSelect", students);
  setupGroupStudentPicker("catPointsGroupPicker", "catPointsStudentPicker", "catPointsStudentSelect", students);
  setupGroupStudentPicker("tasksGroupPicker", "tasksStudentPicker", "tasksStudentSelect", students, (id) => {
    loadKnowledgeTasks(id);
  });
}

/* =========================================================
   0.05) اختيار الطالب عبر أسرته (أسرة ثم طالب، بدون كتابة)
   ========================================================= */
function setupGroupStudentPicker(groupSelectId, studentSelectId, hiddenId, students, onSelect) {
  const groupSelect = document.getElementById(groupSelectId);
  const studentSelect = document.getElementById(studentSelectId);
  const hidden = document.getElementById(hiddenId);
  if (!groupSelect || !studentSelect || !hidden) return;

  const byGroup = {};
  students.forEach((s) => {
    if (!byGroup[s.group]) byGroup[s.group] = [];
    byGroup[s.group].push(s);
  });

  Object.keys(byGroup).sort((a, b) => a.localeCompare(b, "ar")).forEach((groupName) => {
    const opt = document.createElement("option");
    opt.value = groupName;
    opt.textContent = groupName;
    groupSelect.appendChild(opt);
  });

  groupSelect.addEventListener("change", () => {
    studentSelect.innerHTML = `<option value="">اختر الطالب</option>`;
    hidden.value = "";
    hidden.dataset.name = "";
    const groupName = groupSelect.value;
    if (!groupName) {
      studentSelect.disabled = true;
      return;
    }
    byGroup[groupName].forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      studentSelect.appendChild(opt);
    });
    studentSelect.disabled = false;
  });

  studentSelect.addEventListener("change", () => {
    const selectedOption = studentSelect.selectedOptions[0];
    if (!studentSelect.value) {
      hidden.value = "";
      hidden.dataset.name = "";
      return;
    }
    hidden.value = studentSelect.value;
    hidden.dataset.name = selectedOption.textContent;
    if (onSelect) onSelect(studentSelect.value);
  });
}

function setupStudentSearchSelect(inputId, resultsId, hiddenId, students, onSelect) {
  const input = document.getElementById(inputId);
  const resultsBox = document.getElementById(resultsId);
  const hidden = document.getElementById(hiddenId);
  if (!input || !resultsBox || !hidden) return;

  input.addEventListener("input", () => {
    hidden.value = "";
    hidden.dataset.name = "";
    const query = input.value.trim().toLocaleLowerCase("ar");

    if (!query) {
      resultsBox.innerHTML = "";
      resultsBox.classList.remove("visible");
      return;
    }

    // مطابقة أي كلمة من الاسم تبدأ بنص البحث (وليس فقط بداية الاسم الكامل)
    // مع تقديم تطابق الاسم الأول على الأب ثم العائلة في الترتيب
    const matches = students
      .map((s) => {
        const words = s.name.toLocaleLowerCase("ar").split(/\s+/);
        const wordIndex = words.findIndex((w) => w.startsWith(query));
        return { ...s, wordIndex };
      })
      .filter((s) => s.wordIndex !== -1)
      .sort((a, b) => a.wordIndex - b.wordIndex || a.name.localeCompare(b.name, "ar"));

    if (!matches.length) {
      resultsBox.innerHTML = `<div class="search-empty">لا يوجد طالب بهذا الاسم</div>`;
      resultsBox.classList.add("visible");
      return;
    }

    resultsBox.innerHTML = matches.map((s) => `
      <div class="search-item" data-id="${s.id}" data-name="${s.name}">
        <span>${s.name}</span>
        <span class="search-item-group">${s.group}</span>
      </div>
    `).join("");
    resultsBox.classList.add("visible");

    resultsBox.querySelectorAll(".search-item").forEach((item) => {
      item.addEventListener("click", () => {
        hidden.value = item.dataset.id;
        hidden.dataset.name = item.dataset.name;
        input.value = item.dataset.name;
        resultsBox.innerHTML = "";
        resultsBox.classList.remove("visible");
        if (onSelect) onSelect(item.dataset.id);
      });
    });
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      input.dispatchEvent(new Event("input"));
    }
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !resultsBox.contains(e.target)) {
      resultsBox.classList.remove("visible");
    }
  });
}

/* =========================================================
   1) تسجيل مبادرة (إضافة / خصم نقاط بأحد المحاور الأربعة)
   ========================================================= */

/* =========================================================
   Update Cultural/Sports Points Form
   ========================================================= */
function setupCatPointsForm() {
  const btn = document.getElementById("updateCatPointsBtn");
  const msg = document.getElementById("catPointsMsg");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const groupId = document.getElementById("catPointsMegaGroupSelect").value;
    const category = document.getElementById("catPointsCategory").value;
    const points = document.getElementById("catPointsAmount").value;

    if (!groupId) {
      showMsg(msg, "الرجاء اختيار المجموعة الكبرى", "error");
      return;
    }
    if (!category) {
      showMsg(msg, "الرجاء اختيار البرنامج", "error");
      return;
    }

    btn.disabled = true;
    try {
      const res = await fetch("/api/supervisor/mega-groups/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, axis: category, points })
      });
      const data = await res.json();

      if (data.success) {
        showMsg(msg, "تم تحديث النقاط بنجاح!", "success");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showMsg(msg, data.error || "حدث خطأ غير معروف", "error");
      }
    } catch (err) {
      console.error(err);
      showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function setupPointsForm() {
  const addBtn = document.getElementById("addInitiativeBtn");
  const subtractBtn = document.getElementById("subtractInitiativeBtn");
  const msg = document.getElementById("initiativeMsg");
  if (!addBtn || !subtractBtn) return;

  addBtn.addEventListener("click", () => submitPoints("add"));
  subtractBtn.addEventListener("click", () => submitPoints("subtract"));

  async function submitPoints(mode) {
    const studentId = document.getElementById("initiativeStudentSelect").value;
    const amount = Number(document.getElementById("initiativeAmount").value);
    const reason = document.getElementById("initiativeCategorySelect").value;
    const studentName = document.getElementById("initiativeStudentSelect").dataset.name;

    if (!studentId) {
      showMsg(msg, "اختر طالباً أولاً", "error");
      return;
    }
    if (!reason) {
      showMsg(msg, "اختر محور المبادرة", "error");
      return;
    }
    if (!amount || amount <= 0) {
      showMsg(msg, "أدخل عدد نقاط صحيح", "error");
      return;
    }

    await sendPointsRequest({ studentId, program: "initiative", amount, reason, mode, studentName, msg });
  }

  async function sendPointsRequest({ studentId, program, amount, reason, mode, studentName, msg }) {
    try {
      const res = await fetch("/api/supervisor/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, program, amount, reason, mode }),
      });
      const data = await res.json();

      if (!data.success) {
        showMsg(msg, data.message || "حدث خطأ", "error");
        return;
      }

      const actionLabel = mode === "subtract" ? "خصم" : "تسجيل";
      msg.className = "form-msg success";
      msg.innerHTML = `تم ${actionLabel} ${amount} نقطة (${reason}) لـ ${studentName} بنجاح ✅ <button type="button" class="btn-undo-points">↩️ تراجع</button>`;
      document.getElementById("initiativeAmount").value = "";

      const undoBtn = msg.querySelector(".btn-undo-points");
      undoBtn.addEventListener("click", async () => {
        undoBtn.disabled = true;
        const reverseMode = mode === "subtract" ? "add" : "subtract";
        await sendPointsRequest({
          studentId, program, amount, reason,
          mode: reverseMode, studentName, msg,
        });
      }, { once: true });

      updateStudentRowInTable(data.student);
    } catch (err) {
      showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
    }
  }
}

/* =========================================================
   2.5) تقييم متطلبات البرنامج المعرفي
   المشرف هو من يحدّد إنجاز كل متطلب (الطالب يخبره شخصياً)
   ========================================================= */
function setupKnowledgeTasksPanel() {
  loadTaskConfig();
  const saveBtn = document.getElementById("saveTaskConfigBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveTaskConfig);
  const addBtn = document.getElementById("addTaskBtn");
  if (addBtn) addBtn.addEventListener("click", addTask);
}

/* تحميل إعدادات الذاتي الأسبوعية (متطلبان أو ثلاثة لكل أسبوع) وعرضها مجمَّعة */
async function loadTaskConfig() {
  const configBox = document.getElementById("taskConfigList");
  if (!configBox) return;

  try {
    const res = await fetch("/api/supervisor/self-task-config");
    const data = await res.json();
    if (!data.success) return;

    const byWeek = {};
    data.config.forEach((t) => {
      if (!byWeek[t.week_number]) byWeek[t.week_number] = [];
      byWeek[t.week_number].push(t);
    });

    configBox.innerHTML = Object.keys(byWeek).map((week) => `
      <div class="task-config-group-title">الأسبوع ${week}</div>
      ${byWeek[week].map((t) => `
        <div class="task-config-row">
          <input type="text" class="task-config-title-input" data-task-id="${t.id}"
            placeholder="عنوان المتطلب" value="${t.title}">
          <input type="number" class="task-config-input" data-task-id="${t.id}"
            min="1" placeholder="0" value="${t.points > 0 ? t.points : ""}">
          <span class="task-points-label">نقطة</span>
          <button type="button" class="btn-delete-task" data-task-id="${t.id}" title="حذف المتطلب">🗑️</button>
        </div>
      `).join("")}
    `).join("");

    configBox.querySelectorAll(".btn-delete-task").forEach((btn) => {
      btn.addEventListener("click", () => deleteTask(btn.dataset.taskId));
    });
  } catch (e) {
    configBox.innerHTML = `<p class="form-msg error">تعذر تحميل الإعدادات</p>`;
  }
}

/* إضافة متطلب جديد لأسبوع مختار */
async function addTask() {
  const weekSelect = document.getElementById("addTaskWeekSelect");
  const msg = document.getElementById("taskConfigMsg");
  const weekNumber = Number(weekSelect.value);

  try {
    const res = await fetch("/api/supervisor/self-tasks/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekNumber }),
    });
    const data = await res.json();
    if (!data.success) {
      showMsg(msg, data.message || "حدث خطأ", "error");
      return;
    }
    showMsg(msg, "تمت إضافة متطلب جديد، عدّل عنوانه ونقاطه ثم احفظ ✅", "success");
    loadTaskConfig();
  } catch (e) {
    showMsg(msg, "حدث خطأ في الاتصال", "error");
  }
}

/* حذف متطلب (يخصم النقاط ممن أنجزه أولاً) */
async function deleteTask(taskId) {
  const msg = document.getElementById("taskConfigMsg");
  if (!confirm("هل تريد حذف هذا المتطلب؟ سيُخصَم من كل طالب أنجزه.")) return;

  try {
    const res = await fetch("/api/supervisor/self-tasks/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    const data = await res.json();
    if (!data.success) {
      showMsg(msg, data.message || "حدث خطأ", "error");
      return;
    }
    showMsg(msg, "تم حذف المتطلب ✅", "success");
    loadTaskConfig();
  } catch (e) {
    showMsg(msg, "حدث خطأ في الاتصال", "error");
  }
}

/* حفظ عنوان ونقاط كل متطلبات الذاتي الحالية */
async function saveTaskConfig() {
  const titleInputs = document.querySelectorAll(".task-config-title-input");
  const saveBtn = document.getElementById("saveTaskConfigBtn");
  const msg = document.getElementById("taskConfigMsg");

  const configs = Array.from(titleInputs).map((titleInput) => {
    const taskId = titleInput.dataset.taskId;
    const pointInput = document.querySelector(`.task-config-input[data-task-id="${taskId}"]`);
    return {
      taskId: Number(taskId),
      title: titleInput.value.trim(),
      points: pointInput ? Number(pointInput.value) || 0 : 0,
    };
  });

  if (configs.some((c) => c.points <= 0 || !c.title)) {
    showMsg(msg, "أدخل عنواناً ونقاطاً لكل متطلب", "error");
    return;
  }

  saveBtn.disabled = true;
  try {
    const res = await fetch("/api/supervisor/self-task-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configs }),
    });
    const data = await res.json();
    showMsg(msg, data.success ? "تم حفظ الإعدادات بنجاح ✅" : "حدث خطأ", data.success ? "success" : "error");
  } catch (e) {
    showMsg(msg, "حدث خطأ في الاتصال", "error");
  } finally {
    saveBtn.disabled = false;
  }
}

async function loadKnowledgeTasks(studentId) {
  const list = document.getElementById("knowledgeTasksList");
  const msg = document.getElementById("tasksMsg");
  list.innerHTML = "جارٍ التحميل...";
  msg.textContent = "";

  try {
    const res = await fetch(`/api/students/${studentId}`);
    const data = await res.json();

    if (!data.success) {
      list.innerHTML = "";
      showMsg(msg, "تعذر تحميل إنجاز هذا الطالب", "error");
      return;
    }

    const tasks = data.student.self_achievements;
    if (!tasks.length) {
      list.innerHTML = `<p class="empty-note">لا توجد متطلبات معرَّفة بعد</p>`;
      return;
    }

    const byWeek = {};
    tasks.forEach((t) => {
      if (!byWeek[t.week_number]) byWeek[t.week_number] = [];
      byWeek[t.week_number].push(t);
    });

    list.innerHTML = Object.keys(byWeek).map((week) => `
      <div class="task-config-group-title">الأسبوع ${week}</div>
      ${byWeek[week].map((t) => `
        <div class="task-toggle-item">
          <input type="checkbox" class="task-toggle-checkbox" data-task-id="${t.task_id}" ${t.done ? "checked" : ""}>
          <span class="task-toggle-title">${t.title}</span>
          ${t.done && t.points ? `<span class="task-done-points">${t.points} نقطة</span>` : ""}
        </div>
      `).join("")}
    `).join("");

    list.querySelectorAll(".task-toggle-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", async () => {
        const taskId = checkbox.dataset.taskId;
        const done = checkbox.checked;
        checkbox.disabled = true;
        try {
          const res = await fetch("/api/supervisor/self-achievements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId, taskId, done }),
          });
          const data = await res.json();
          if (!data.success) {
            checkbox.checked = !done;
            showMsg(msg, data.message || "حدث خطأ", "error");
          } else {
            const a = data.achievement;
            const action = done ? "تم إنجاز" : "تم إلغاء إنجاز";
            showMsg(msg, action + " [" + a.title + "]" + (done && a.points ? " (+" + a.points + " نقطة) ✅" : " ✅"), "success");
            loadKnowledgeTasks(studentId);
          }
        } catch (err) {
          checkbox.checked = !done;
          showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
        } finally {
          checkbox.disabled = false;
        }
      });
    });
  } catch (err) {
    list.innerHTML = "";
    showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
  }
}

/* =========================================================
   مساعد: عرض رسالة نجاح/خطأ في النماذج
   ========================================================= */
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "form-msg " + type;
}

/* =========================================================
   مساعد: تحديث صف الطالب في الجدول بعد تعديل نقاطه
   ========================================================= */
function updateStudentRowInTable(student) {
  const row = document.querySelector(`tr[data-student-id="${student.id}"]`);
  if (!row) return;

  row.querySelector(".cell-knowledge").textContent = student.knowledge_points;
  const attCell = row.querySelector(".cell-attendance-points");
  if (attCell) attCell.textContent = student.attendance_points;
  row.querySelector(".cell-total").innerHTML = `<strong>${student.total_points}</strong>`;
}

/* =========================================================
   3) عرض / طباعة باركود QR لكل طالب (من جدول المشرف)
   ========================================================= */
function setupBarcodeModal() {
  const modal = document.getElementById("barcodeModal");
  const closeBtn = document.getElementById("closeBarcodeModal");
  const nameEl = document.getElementById("barcodeModalName");
  const codeEl = document.getElementById("barcodeModalCode");
  const canvasHolder = document.getElementById("barcodeModalCanvas");
  const printBtn = document.getElementById("printBarcodeBtn");

  let currentStudent = null;

  document.querySelectorAll(".btn-show-barcode").forEach((btn) => {
    btn.addEventListener("click", () => {
      const barcode = btn.dataset.barcode;
      const name = btn.dataset.name;
      currentStudent = { barcode, name };

      nameEl.textContent = name;
      codeEl.textContent = barcode;
      canvasHolder.innerHTML = "";

      new QRCode(canvasHolder, {
        text: barcode,
        width: 180,
        height: 180,
        colorDark: "#1B4332",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });

      modal.classList.remove("hidden");
    });
  });

  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  printBtn.addEventListener("click", () => {
    if (!currentStudent) return;
    printSingleBarcode(currentStudent);
  });
}

function printSingleBarcode(student) {
  const win = window.open("", "_blank", "width=420,height=560");
  win.document.write(`
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>باركود ${student.name}</title>
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; text-align:center; padding:30px; }
        h2 { color:#1B4332; margin-bottom:4px; }
        p { color:#555; margin:4px 0; }
        #qrPrint { margin:20px auto; }
        .code { font-size:18px; font-weight:bold; letter-spacing:1px; margin-top:10px; }
      </style>
    </head>
    <body>
      <h2>قسم قائد</h2>
      <p>${student.name}</p>
      <div id="qrPrint"></div>
      <div class="code">${student.barcode}</div>
    </body>
    </html>
  `);
  win.document.close();

  const script = win.document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
  script.onload = () => {
    new win.QRCode(win.document.getElementById("qrPrint"), {
      text: student.barcode,
      width: 200,
      height: 200,
      colorDark: "#1B4332",
      colorLight: "#ffffff",
    });
    setTimeout(() => win.print(), 400);
  };
  win.document.body.appendChild(script);
}

  
  // Session Points Logic
  const sessionPointsSessionId = document.getElementById("sessionPointsSessionId");
  const sessionPointsAmount = document.getElementById("sessionPointsAmount");
  const sessionPointsForm = document.getElementById("sessionPointsForm");
  
  if (sessionPointsSessionId && sessionPointsAmount && sessionPointsForm) {
    sessionPointsSessionId.addEventListener("change", (e) => {
      const selected = e.target.options[e.target.selectedIndex];
      if (selected.value) {
        sessionPointsAmount.value = selected.dataset.points;
      } else {
        sessionPointsAmount.value = "";
      }
    });

    sessionPointsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("sessionPointsMsg");
      const sessionId = sessionPointsSessionId.value;
      const points = sessionPointsAmount.value;
      if (!sessionId || points === "") {
        showMsg(msg, "الرجاء اختيار الجلسة وتحديد النقاط", "error");
        return;
      }
      const btn = document.getElementById("saveSessionPointsBtn");
      btn.disabled = true;
      try {
        const res = await fetch("/api/supervisor/session-points", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, points })
        });
        const data = await res.json();
        if (data.success) {
          showMsg(msg, data.message, "success");
          const opt = sessionPointsSessionId.options[sessionPointsSessionId.selectedIndex];
          opt.dataset.points = points;
        } else {
          showMsg(msg, data.message || "حدث خطأ", "error");
        }
      } catch (err) {
        showMsg(msg, "خطأ في الاتصال", "error");
      }
      btn.disabled = false;
    });
  }
