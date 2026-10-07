/* ==========================================================
   script.js — Task List Application (Enhanced + Drag & Drop)
   Fitur: CRUD, Toggle, Filter, localStorage, Drag & Drop
          dengan HTML5 Drag API, Progress Bar, DnD hint
   ========================================================== */

"use strict";

/* ----------------------------------------------------------
   1. STATE & KONSTANTA
   ---------------------------------------------------------- */

/** @type {Task[]} Array utama penyimpan semua task di memori */
let tasks = [];

/** Filter aktif saat ini: 'all' | 'active' | 'completed' */
let currentFilter = "all";

/** Key localStorage */
const STORAGE_KEY = "tasklist_tasks_v2";

/**
 * @typedef {Object} Task
 * @property {string}  id        - ID unik
 * @property {string}  text      - Teks task
 * @property {boolean} completed - Status selesai
 * @property {number}  createdAt - Unix timestamp
 * @property {number}  order     - Urutan (untuk drag & drop)
 */

/* ----------------------------------------------------------
   2. REFERENSI DOM
   ---------------------------------------------------------- */

const taskForm          = document.getElementById("task-form");
const taskInput         = document.getElementById("task-input");
const inputError        = document.getElementById("input-error");
const taskList          = document.getElementById("task-list");
const emptyState        = document.getElementById("empty-state");
const emptyMessage      = document.getElementById("empty-message");
const taskSummary       = document.getElementById("task-summary");
const filterButtons     = document.querySelectorAll(".filter-btn");
const clearCompletedBtn = document.getElementById("clear-completed-btn");
const progressBar       = document.getElementById("progress-bar");
const progressLabel     = document.getElementById("progress-label");
const dndHint           = document.getElementById("dnd-hint");

/* ----------------------------------------------------------
   3. PERSISTENSI — localStorage
   ---------------------------------------------------------- */

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
    // Pastikan semua task punya properti `order`
    tasks.forEach((t, i) => {
      if (t.order === undefined) t.order = i;
    });
  } catch {
    tasks = [];
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/* ----------------------------------------------------------
   4. UTILITAS
   ---------------------------------------------------------- */

/** Buat ID unik */
function generateId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/** Cek apakah task lolos filter aktif */
function matchesFilter(task) {
  if (currentFilter === "active")    return !task.completed;
  if (currentFilter === "completed") return task.completed;
  return true;
}

/** Escape HTML sederhana untuk mencegah XSS */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ----------------------------------------------------------
   5. RENDER
   ---------------------------------------------------------- */

/**
 * Render ulang daftar task + update semua UI state.
 * Dipanggil setiap kali data berubah.
 */
function renderTasks() {
  // Urutkan task berdasarkan property `order`
  const sorted   = [...tasks].sort((a, b) => a.order - b.order);
  const filtered = sorted.filter(matchesFilter);

  taskList.innerHTML = "";

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    emptyMessage.textContent = getEmptyMessage();
  } else {
    emptyState.classList.add("hidden");
  }

  filtered.forEach((task) => {
    const li = createTaskElement(task);
    taskList.appendChild(li);
  });

  updateSummary();
  updateProgress();
  updateClearButton();
  updateDndHint();
}

function getEmptyMessage() {
  if (currentFilter === "active")    return "Tidak ada task aktif. Semua sudah selesai! 🎉";
  if (currentFilter === "completed") return "Belum ada task yang diselesaikan.";
  return "Belum ada task. Yuk tambahkan!";
}

/**
 * Membuat elemen <li> lengkap untuk satu task,
 * termasuk drag handle dan semua event listener.
 * @param {Task} task
 * @returns {HTMLLIElement}
 */
function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = `task-item${task.completed ? " is-completed" : ""}`;
  li.dataset.id = task.id;
  li.setAttribute("draggable", "true");

  // ── Drag Handle ──
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.title = "Seret untuk mengubah urutan";
  handle.setAttribute("aria-hidden", "true");
  handle.innerHTML = iconGrip();

  // ── Checkbox ──
  const checkbox = document.createElement("input");
  checkbox.type      = "checkbox";
  checkbox.className = "task-checkbox";
  checkbox.checked   = task.completed;
  checkbox.setAttribute("aria-label", `Tandai selesai: ${escapeHtml(task.text)}`);
  checkbox.addEventListener("change", () => toggleTask(task.id));

  // ── Wrapper teks + badge ──
  const textWrapper = document.createElement("div");
  textWrapper.className = "flex-1 min-w-0";

  const span = document.createElement("span");
  span.className = `task-text${task.completed ? " completed" : ""}`;
  span.textContent = task.text;
  textWrapper.appendChild(span);

  if (task.completed) {
    const badge = document.createElement("span");
    badge.className = "badge-completed mt-1";
    badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5" fill="none"
      viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Selesai`;
    textWrapper.appendChild(badge);
  }

  // ── Tombol Edit ──
  const editBtn = document.createElement("button");
  editBtn.className   = "btn-action btn-edit";
  editBtn.title       = "Edit task";
  editBtn.setAttribute("aria-label", "Edit task");
  editBtn.innerHTML   = iconEdit();
  editBtn.addEventListener("click", () => startEdit(task.id, li, span, editBtn, deleteBtn));

  // ── Tombol Delete ──
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-action btn-delete";
  deleteBtn.title     = "Hapus task";
  deleteBtn.setAttribute("aria-label", "Hapus task");
  deleteBtn.innerHTML = iconDelete();
  deleteBtn.addEventListener("click", () => removeTask(task.id, li));

  li.appendChild(handle);
  li.appendChild(checkbox);
  li.appendChild(textWrapper);
  li.appendChild(editBtn);
  li.appendChild(deleteBtn);

  // Pasang drag & drop events pada elemen ini
  attachDragEvents(li);

  return li;
}

/* ----------------------------------------------------------
   6. UI STATE HELPERS
   ---------------------------------------------------------- */

function updateSummary() {
  const total     = tasks.length;
  const done      = tasks.filter((t) => t.completed).length;
  const remaining = total - done;
  taskSummary.textContent = `${remaining} aktif · ${done} selesai · ${total} total`;
}

function updateProgress() {
  const total = tasks.length;
  const done  = tasks.filter((t) => t.completed).length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

  progressBar.style.width  = `${pct}%`;
  progressLabel.textContent = total === 0 ? "Belum ada task" : `${pct}% selesai`;
}

function updateClearButton() {
  const hasCompleted = tasks.some((t) => t.completed);
  clearCompletedBtn.classList.toggle("hidden", !hasCompleted);
}

/** Tampilkan hint DnD hanya jika ada >1 task yang terlihat */
function updateDndHint() {
  const visibleCount = tasks.filter(matchesFilter).length;
  dndHint.classList.toggle("hidden", visibleCount < 2);
}

/* ----------------------------------------------------------
   7. CRUD OPERATIONS
   ---------------------------------------------------------- */

/** CREATE */
function addTask(text) {
  const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order)) : -1;
  /** @type {Task} */
  const newTask = {
    id:        generateId(),
    text:      text.trim(),
    completed: false,
    createdAt: Date.now(),
    order:     maxOrder + 1,
  };
  tasks.unshift(newTask);
  // Normalisasi order agar task baru tetap di atas
  tasks.forEach((t, i) => { t.order = i; });
  saveToStorage();
  renderTasks();
}

/** TOGGLE completed */
function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveToStorage();
  renderTasks();
}

/** DELETE (dengan animasi) */
function removeTask(id, li) {
  li.classList.add("removing");
  li.addEventListener("animationend", () => {
    tasks = tasks.filter((t) => t.id !== id);
    saveToStorage();
    renderTasks();
  }, { once: true });
}

/** UPDATE teks */
function updateTask(id, newText) {
  const trimmed = newText.trim();
  if (!trimmed) return;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.text = trimmed;
  saveToStorage();
  renderTasks();
}

/** DELETE ALL COMPLETED */
function clearCompleted() {
  tasks = tasks.filter((t) => !t.completed);
  saveToStorage();
  renderTasks();
}

/* ----------------------------------------------------------
   8. INLINE EDIT
   ---------------------------------------------------------- */

function startEdit(id, li, span, editBtn, deleteBtn) {
  if (li.dataset.editing === "true") return;
  li.dataset.editing = "true";

  const currentText = span.textContent;

  const input = document.createElement("input");
  input.type      = "text";
  input.className = "edit-input";
  input.value     = currentText;
  input.maxLength = 120;
  input.setAttribute("aria-label", "Edit teks task");

  span.replaceWith(input);
  input.focus();
  input.select();

  const badge = li.querySelector(".badge-completed");
  if (badge) badge.style.display = "none";

  editBtn.className = "btn-action btn-save";
  editBtn.title     = "Simpan perubahan";
  editBtn.innerHTML = iconSave();
  deleteBtn.disabled      = true;
  deleteBtn.style.opacity = "0.3";

  // Nonaktifkan drag saat mode edit
  li.setAttribute("draggable", "false");

  const save = () => {
    const newText = input.value.trim();
    if (newText) {
      updateTask(id, newText);
    } else {
      cancelEdit();
    }
  };

  const cancelEdit = () => {
    li.dataset.editing      = "";
    li.setAttribute("draggable", "true");
    input.replaceWith(span);
    if (badge) badge.style.display = "";
    editBtn.className       = "btn-action btn-edit";
    editBtn.title           = "Edit task";
    editBtn.innerHTML       = iconEdit();
    deleteBtn.disabled      = false;
    deleteBtn.style.opacity = "";
  };

  editBtn.onclick = save;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); save(); }
    if (e.key === "Escape") { cancelEdit(); }
  });
  input.addEventListener("blur", save, { once: true });
}

/* ----------------------------------------------------------
   9. FILTER
   ---------------------------------------------------------- */

function setFilter(filter) {
  currentFilter = filter;
  filterButtons.forEach((btn) => {
    btn.classList.toggle("active-filter", btn.dataset.filter === filter);
  });
  renderTasks();
}

/* ----------------------------------------------------------
   10. DRAG & DROP — HTML5 Drag API
   ---------------------------------------------------------- */

/**
 * State drag & drop.
 * dragSrcId: ID task yang sedang di-drag.
 */
let dragSrcId = null;

/**
 * Memasang semua event listener drag & drop pada satu <li> task.
 * @param {HTMLLIElement} li
 */
function attachDragEvents(li) {
  li.addEventListener("dragstart", onDragStart);
  li.addEventListener("dragend",   onDragEnd);
  li.addEventListener("dragover",  onDragOver);
  li.addEventListener("dragenter", onDragEnter);
  li.addEventListener("dragleave", onDragLeave);
  li.addEventListener("drop",      onDrop);
}

/** Saat mulai menyeret kartu */
function onDragStart(e) {
  const li = e.currentTarget;

  // Jangan drag saat sedang edit
  if (li.dataset.editing === "true") {
    e.preventDefault();
    return;
  }

  dragSrcId = li.dataset.id;

  // Beri sedikit delay agar browser sempat render ghost sebelum class berubah
  requestAnimationFrame(() => {
    li.classList.add("dragging");
  });

  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragSrcId);
}

/** Saat kartu dilepas (selesai drag) */
function onDragEnd(e) {
  const li = e.currentTarget;
  li.classList.remove("dragging");
  dragSrcId = null;

  // Bersihkan semua state drag-over dari semua kartu
  document.querySelectorAll(".task-item").forEach((el) => {
    el.classList.remove("drag-over");
  });
}

/** Saat kartu yang di-drag berada di atas kartu lain */
function onDragOver(e) {
  e.preventDefault(); // izinkan drop
  e.dataTransfer.dropEffect = "move";
}

/** Saat kartu yang di-drag memasuki area kartu lain */
function onDragEnter(e) {
  e.preventDefault();
  const li = e.currentTarget;
  if (li.dataset.id === dragSrcId) return; // skip diri sendiri
  li.classList.add("drag-over");
}

/** Saat kartu yang di-drag meninggalkan area kartu lain */
function onDragLeave(e) {
  const li      = e.currentTarget;
  // Pastikan hanya hilangkan class jika mouse benar-benar keluar dari elemen ini,
  // bukan ke child element
  if (!li.contains(e.relatedTarget)) {
    li.classList.remove("drag-over");
  }
}

/** Saat kartu dijatuhkan ke kartu lain → reorder */
function onDrop(e) {
  e.preventDefault();
  const targetLi = e.currentTarget;
  targetLi.classList.remove("drag-over");

  const targetId = targetLi.dataset.id;
  if (!dragSrcId || dragSrcId === targetId) return;

  // Tukar order antara task sumber dan target
  const srcTask    = tasks.find((t) => t.id === dragSrcId);
  const targetTask = tasks.find((t) => t.id === targetId);
  if (!srcTask || !targetTask) return;

  // Ambil semua task terfilter saat ini dalam urutan tampil
  const filtered = [...tasks]
    .sort((a, b) => a.order - b.order)
    .filter(matchesFilter);

  const srcIdx    = filtered.findIndex((t) => t.id === dragSrcId);
  const targetIdx = filtered.findIndex((t) => t.id === targetId);

  // Pindahkan srcTask ke posisi targetIdx dalam filtered
  filtered.splice(srcIdx, 1);
  filtered.splice(targetIdx, 0, srcTask);

  // Assign ulang order hanya untuk task yang ada di filtered
  // (task di filter lain tidak berubah, tapi kita perlu menghindari konflik)
  filtered.forEach((t, i) => {
    t.order = i;
  });

  // Normalisasi seluruh tasks agar task di luar filter tidak tumpang tindih
  const filteredIds = new Set(filtered.map((t) => t.id));
  const notFiltered = tasks
    .filter((t) => !filteredIds.has(t.id))
    .sort((a, b) => a.order - b.order);

  // Beri order di luar range filtered
  let nextOrder = filtered.length;
  notFiltered.forEach((t) => {
    t.order = nextOrder++;
  });

  saveToStorage();
  renderTasks();
}

/* ----------------------------------------------------------
   11. EVENT LISTENERS
   ---------------------------------------------------------- */

/** Submit form */
taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    inputError.classList.remove("hidden");
    taskInput.focus();
    return;
  }
  inputError.classList.add("hidden");
  addTask(text);
  taskInput.value = "";
  taskInput.focus();
});

/** Sembunyikan error saat mulai mengetik */
taskInput.addEventListener("input", () => {
  if (taskInput.value.trim()) inputError.classList.add("hidden");
});

/** Klik filter */
filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => setFilter(btn.dataset.filter));
});

/** Clear completed */
clearCompletedBtn.addEventListener("click", () => {
  if (confirm("Hapus semua task yang sudah selesai?")) clearCompleted();
});

/* ----------------------------------------------------------
   12. SVG ICON HELPERS
   ---------------------------------------------------------- */

function iconGrip() {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="9"  cy="6"  r="1.4"/>
    <circle cx="15" cy="6"  r="1.4"/>
    <circle cx="9"  cy="12" r="1.4"/>
    <circle cx="15" cy="12" r="1.4"/>
    <circle cx="9"  cy="18" r="1.4"/>
    <circle cx="15" cy="18" r="1.4"/>
  </svg>`;
}

function iconEdit() {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none"
    viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round"
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
         M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`;
}

function iconDelete() {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none"
    viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round"
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7
         m5 4v6m4-6v6M9 7V4h6v3M3 7h18"/>
  </svg>`;
}

function iconSave() {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none"
    viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
  </svg>`;
}

/* ----------------------------------------------------------
   13. INISIALISASI
   ---------------------------------------------------------- */

function init() {
  loadFromStorage();
  renderTasks();
}

init();
