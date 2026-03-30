// ===== SYNC & DATA LAYER =====
const STORAGE_KEY = 'gzim_dashboard_tasks';
const CLIENTS_KEY = 'gzim_dashboard_clients';
const SERVER_KEY = 'gzim_dashboard_server';
const DEFAULT_CLIENTS = ['GPS', 'Josh', 'JMJ', 'WRC Flamur'];

// Detect if we're running from the local server (not GitHub Pages)
const API_BASE = (() => {
    const loc = window.location;
    // If served from localhost or a local IP, use same origin as API
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || /^192\.168\./.test(loc.hostname) || /^10\./.test(loc.hostname)) {
        return loc.origin;
    }
    // On GitHub Pages: check if user saved a server address
    const saved = localStorage.getItem(SERVER_KEY);
    return saved || null;
})();

let serverOnline = false;

async function apiGet(path) {
    if (!API_BASE) return null;
    try {
        const res = await fetch(API_BASE + path, { signal: AbortSignal.timeout(3000) });
        if (res.ok) { serverOnline = true; return res.json(); }
    } catch {}
    serverOnline = false;
    return null;
}

async function apiPost(path, data) {
    if (!API_BASE) return false;
    try {
        const res = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(3000)
        });
        if (res.ok) { serverOnline = true; return true; }
    } catch {}
    serverOnline = false;
    return false;
}

async function apiPut(path, data) {
    if (!API_BASE) return false;
    try {
        const res = await fetch(API_BASE + path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(3000)
        });
        if (res.ok) { serverOnline = true; return true; }
    } catch {}
    serverOnline = false;
    return false;
}

async function apiDelete(path) {
    if (!API_BASE) return false;
    try {
        const res = await fetch(API_BASE + path, {
            method: 'DELETE',
            signal: AbortSignal.timeout(3000)
        });
        if (res.ok) { serverOnline = true; return true; }
    } catch {}
    serverOnline = false;
    return false;
}

// LocalStorage helpers
function loadTasksLocal() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

function saveTasksLocal(t) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

function loadClientsLocal() {
    const data = localStorage.getItem(CLIENTS_KEY);
    if (data) return JSON.parse(data);
    return [...DEFAULT_CLIENTS];
}

function saveClientsLocal(c) {
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(c));
}

// Save tasks — writes to server AND localStorage
async function saveTasks(t) {
    saveTasksLocal(t);
    await apiPost('/api/data', { tasks: t, clients });
    updateSyncStatus();
}

// Save clients — writes to server AND localStorage
async function saveClients(c) {
    saveClientsLocal(c);
    await apiPost('/api/clients', { clients: c });
    updateSyncStatus();
}

// Sync from server (called on page load / manual refresh)
async function syncFromServer() {
    const data = await apiGet('/api/data');
    if (data) {
        tasks = data.tasks || [];
        clients = data.clients || DEFAULT_CLIENTS;
        saveTasksLocal(tasks);
        saveClientsLocal(clients);
        updateSyncStatus();
        return true;
    }
    updateSyncStatus();
    return false;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Load initial data from localStorage (fast), server sync happens after
let tasks = loadTasksLocal();
let clients = loadClientsLocal();
let editingTaskId = null;
let deletingTaskId = null;
let currentSort = { field: null, asc: true };
let draggedCard = null;

// ===== DOM REFERENCES =====
const addTaskBtn = document.getElementById('addTaskBtn');
const taskModal = document.getElementById('taskModal');
const modalTitle = document.getElementById('modalTitle');
const modalClose = document.getElementById('modalClose');
const taskForm = document.getElementById('taskForm');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const deleteModal = document.getElementById('deleteModal');
const deleteModalClose = document.getElementById('deleteModalClose');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const notesModal = document.getElementById('notesModal');
const notesModalTitle = document.getElementById('notesModalTitle');
const notesModalClose = document.getElementById('notesModalClose');
const notesContent = document.getElementById('notesContent');
const closeNotesBtn = document.getElementById('closeNotesBtn');
const clientsModal = document.getElementById('clientsModal');
const clientsModalClose = document.getElementById('clientsModalClose');
const closeClientsBtn = document.getElementById('closeClientsBtn');
const newClientInput = document.getElementById('newClientInput');
const addClientBtn = document.getElementById('addClientBtn');
const clientListManager = document.getElementById('clientListManager');
const taskTableBody = document.getElementById('taskTableBody');
const emptyTable = document.getElementById('emptyTable');
const tableView = document.getElementById('tableView');
const kanbanView = document.getElementById('kanbanView');
const kanbanBoard = document.getElementById('kanbanBoard');
const kanbanGroupBy = document.getElementById('kanbanGroupBy');
const viewBtns = document.querySelectorAll('.view-btn');
const filterClient = document.getElementById('filterClient');
const filterProject = document.getElementById('filterProject');
const filterStatus = document.getElementById('filterStatus');
const filterPriority = document.getElementById('filterPriority');
const searchInput = document.getElementById('searchInput');
const sortableHeaders = document.querySelectorAll('.sortable');
const syncIndicator = document.getElementById('syncIndicator');

// Form fields
const taskName = document.getElementById('taskName');
const taskClient = document.getElementById('taskClient');
const taskProject = document.getElementById('taskProject');
const taskDueDate = document.getElementById('taskDueDate');
const taskPriority = document.getElementById('taskPriority');
const taskStatus = document.getElementById('taskStatus');
const taskNotes = document.getElementById('taskNotes');
const projectList = document.getElementById('projectList');

// Summary
const summaryTotal = document.getElementById('summaryTotal');
const summaryOpen = document.getElementById('summaryOpen');
const summaryOverdue = document.getElementById('summaryOverdue');
const summaryCompleted = document.getElementById('summaryCompleted');

// ===== SYNC STATUS INDICATOR =====
function updateSyncStatus() {
    if (!syncIndicator) return;
    if (API_BASE && serverOnline) {
        syncIndicator.textContent = 'Synced';
        syncIndicator.className = 'sync-indicator synced';
    } else if (API_BASE) {
        syncIndicator.textContent = 'Offline';
        syncIndicator.className = 'sync-indicator offline';
    } else {
        syncIndicator.textContent = 'Local';
        syncIndicator.className = 'sync-indicator local';
    }
}

// ===== HELPERS =====
const ALL_STATUSES = ['To Do', 'In Progress', 'Hold', 'Late', 'Completed'];

function getUniqueValues(field) {
    return [...new Set(tasks.map(t => t[field]).filter(Boolean))].sort();
}

function isBusinessDayPastDue(dateStr) {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    let nextBiz = new Date(due);
    nextBiz.setDate(nextBiz.getDate() + 1);
    while (nextBiz.getDay() === 0 || nextBiz.getDay() === 6) {
        nextBiz.setDate(nextBiz.getDate() + 1);
    }
    return today >= nextBiz;
}

function autoDetectLate() {
    let changed = false;
    tasks.forEach(task => {
        if (task.status !== 'Completed' && task.status !== 'Late' && isBusinessDayPastDue(task.dueDate)) {
            task.status = 'Late';
            changed = true;
        }
    });
    if (changed) saveTasks(tasks);
}

function getFilteredTasks() {
    let filtered = [...tasks];
    const clientVal = filterClient.value;
    const projectVal = filterProject.value;
    const statusVal = filterStatus.value;
    const priorityVal = filterPriority.value;
    const searchVal = searchInput.value.toLowerCase().trim();

    if (clientVal) filtered = filtered.filter(t => t.client === clientVal);
    if (projectVal) filtered = filtered.filter(t => t.project === projectVal);
    if (statusVal) filtered = filtered.filter(t => t.status === statusVal);
    if (priorityVal) filtered = filtered.filter(t => t.priority === priorityVal);
    if (searchVal) {
        filtered = filtered.filter(t =>
            t.task.toLowerCase().includes(searchVal) ||
            t.client.toLowerCase().includes(searchVal) ||
            t.project.toLowerCase().includes(searchVal) ||
            (t.notes && t.notes.toLowerCase().includes(searchVal))
        );
    }

    if (currentSort.field) {
        filtered.sort((a, b) => {
            let valA = a[currentSort.field] || '';
            let valB = b[currentSort.field] || '';

            if (currentSort.field === 'priority') {
                const order = { High: 0, Medium: 1, Low: 2 };
                valA = order[valA] ?? 1;
                valB = order[valB] ?? 1;
            } else if (currentSort.field === 'status') {
                const order = { 'To Do': 0, 'In Progress': 1, 'Hold': 2, 'Late': 3, 'Completed': 4 };
                valA = order[valA] ?? 0;
                valB = order[valB] ?? 0;
            } else if (currentSort.field === 'dueDate') {
                valA = valA || '9999-12-31';
                valB = valB || '9999-12-31';
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }

            if (valA < valB) return currentSort.asc ? -1 : 1;
            if (valA > valB) return currentSort.asc ? 1 : -1;
            return 0;
        });
    }

    return filtered;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr + 'T00:00:00');
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function getDueDateClass(dateStr) {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 3) return 'due-soon';
    return '';
}

function getStatusClass(status) {
    switch (status) {
        case 'To Do': return 'todo';
        case 'In Progress': return 'in-progress';
        case 'Completed': return 'completed';
        case 'Hold': return 'hold';
        case 'Late': return 'late';
        default: return 'todo';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== DASHBOARD SUMMARY =====
function updateSummary() {
    const total = tasks.length;
    const open = tasks.filter(t => t.status === 'To Do' || t.status === 'In Progress').length;
    const overdue = tasks.filter(t => t.status === 'Late').length;
    const completed = tasks.filter(t => t.status === 'Completed').length;

    summaryTotal.textContent = total;
    summaryOpen.textContent = open;
    summaryOverdue.textContent = overdue;
    summaryCompleted.textContent = completed;
}

// ===== FILTER DROPDOWNS =====
function updateFilterOptions() {
    const currentClient = filterClient.value;
    const currentProject = filterProject.value;

    const taskClients = getUniqueValues('client');
    const allClients = [...new Set([...clients, ...taskClients])].sort();
    const projects = getUniqueValues('project');

    filterClient.innerHTML = '<option value="">All Clients</option>' +
        allClients.map(c => `<option value="${escapeHtml(c)}" ${c === currentClient ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

    filterProject.innerHTML = '<option value="">All Projects</option>' +
        projects.map(p => `<option value="${escapeHtml(p)}" ${p === currentProject ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');

    updateClientDropdown();
    projectList.innerHTML = projects.map(p => `<option value="${escapeHtml(p)}">`).join('');
}

function updateClientDropdown(selectedValue) {
    const taskClients = getUniqueValues('client');
    const allClients = [...new Set([...clients, ...taskClients])].sort();
    const current = selectedValue || taskClient.value;

    taskClient.innerHTML = '<option value="">Select a client...</option>' +
        allClients.map(c => `<option value="${escapeHtml(c)}" ${c === current ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('') +
        '<option value="__manage__">+ Manage Clients...</option>';
}

// ===== INLINE EDITING =====
function startInlineEdit(td, taskId, field) {
    if (td.querySelector('input, select, textarea')) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const currentValue = task[field] || '';

    if (field === 'status') {
        const select = document.createElement('select');
        select.className = 'inline-edit-select';
        ALL_STATUSES.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            if (s === currentValue) opt.selected = true;
            select.appendChild(opt);
        });
        td.innerHTML = '';
        td.appendChild(select);
        select.focus();

        select.addEventListener('change', () => {
            task[field] = select.value;
            task.updatedAt = new Date().toISOString();
            saveTasks(tasks);
            renderAll();
        });
        select.addEventListener('blur', () => renderAll());
    } else if (field === 'priority') {
        const select = document.createElement('select');
        select.className = 'inline-edit-select';
        ['High', 'Medium', 'Low'].forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (p === currentValue) opt.selected = true;
            select.appendChild(opt);
        });
        td.innerHTML = '';
        td.appendChild(select);
        select.focus();

        select.addEventListener('change', () => {
            task[field] = select.value;
            task.updatedAt = new Date().toISOString();
            saveTasks(tasks);
            renderAll();
        });
        select.addEventListener('blur', () => renderAll());
    } else if (field === 'client') {
        const select = document.createElement('select');
        select.className = 'inline-edit-select';
        const taskClients = getUniqueValues('client');
        const allClients = [...new Set([...clients, ...taskClients])].sort();
        allClients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (c === currentValue) opt.selected = true;
            select.appendChild(opt);
        });
        td.innerHTML = '';
        td.appendChild(select);
        select.focus();

        select.addEventListener('change', () => {
            task[field] = select.value;
            task.updatedAt = new Date().toISOString();
            saveTasks(tasks);
            renderAll();
        });
        select.addEventListener('blur', () => renderAll());
    } else if (field === 'dueDate') {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'inline-edit-input';
        input.value = currentValue;
        td.innerHTML = '';
        td.appendChild(input);
        input.focus();

        const save = () => {
            task[field] = input.value;
            task.updatedAt = new Date().toISOString();
            if (task.status !== 'Completed' && isBusinessDayPastDue(input.value)) {
                task.status = 'Late';
            } else if (task.status === 'Late' && !isBusinessDayPastDue(input.value)) {
                task.status = 'To Do';
            }
            saveTasks(tasks);
            renderAll();
        };
        input.addEventListener('change', save);
        input.addEventListener('blur', () => renderAll());
    } else if (field === 'notes') {
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-input';
        textarea.value = currentValue;
        textarea.rows = 3;
        textarea.style.minHeight = '80px';
        textarea.style.resize = 'vertical';
        td.innerHTML = '';
        td.appendChild(textarea);
        textarea.focus();

        const save = () => {
            task[field] = textarea.value.trim();
            task.updatedAt = new Date().toISOString();
            saveTasks(tasks);
            renderAll();
        };
        textarea.addEventListener('blur', save);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { renderAll(); }
        });
    } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = currentValue;

        if (field === 'project') {
            input.setAttribute('list', 'inlineProjectList');
            let dl = document.getElementById('inlineProjectList');
            if (!dl) {
                dl = document.createElement('datalist');
                dl.id = 'inlineProjectList';
                document.body.appendChild(dl);
            }
            const projects = getUniqueValues('project');
            dl.innerHTML = projects.map(p => `<option value="${escapeHtml(p)}">`).join('');
        }

        td.innerHTML = '';
        td.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
            const val = input.value.trim();
            if (val) {
                task[field] = val;
                task.updatedAt = new Date().toISOString();
                saveTasks(tasks);
            }
            renderAll();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { renderAll(); }
        });
    }
}

// ===== TABLE RENDERING =====
function renderTable() {
    const filtered = getFilteredTasks();

    if (filtered.length === 0 && tasks.length === 0) {
        taskTableBody.innerHTML = '';
        emptyTable.style.display = 'block';
        return;
    }

    emptyTable.style.display = filtered.length === 0 ? 'block' : 'none';

    taskTableBody.innerHTML = filtered.map(task => {
        const dueDateClass = getDueDateClass(task.dueDate);
        const statusClass = getStatusClass(task.status);
        const isLate = task.status === 'Late';
        const notesPreview = task.notes ? escapeHtml(task.notes.substring(0, 60)) + (task.notes.length > 60 ? '...' : '') : '';

        return `<tr data-id="${task.id}" class="${isLate ? 'row-late' : ''}">
            <td class="task-name-cell editable-cell" data-field="task" title="${escapeHtml(task.task)}">${escapeHtml(task.task)}</td>
            <td class="editable-cell" data-field="client">${escapeHtml(task.client)}</td>
            <td class="editable-cell" data-field="project">${escapeHtml(task.project)}</td>
            <td class="due-date-cell ${dueDateClass} editable-cell" data-field="dueDate">${formatDate(task.dueDate)}</td>
            <td class="editable-cell" data-field="priority">
                <span class="priority-badge">
                    <span class="priority-dot ${task.priority.toLowerCase()}"></span>
                    ${task.priority}
                </span>
            </td>
            <td class="editable-cell" data-field="status">
                <span class="status-badge ${statusClass}">${task.status}</span>
            </td>
            <td class="notes-cell editable-cell ${task.notes ? '' : 'empty'}" data-field="notes"
                title="${task.notes ? 'Click to edit notes' : 'Click to add notes'}">
                ${notesPreview || 'No notes'}
            </td>
            <td class="actions-cell">
                <button class="btn-icon" onclick="editTask('${task.id}')" title="Edit">&#9998;</button>
                <button class="btn-icon delete" onclick="promptDelete('${task.id}')" title="Delete">&#128465;</button>
            </td>
        </tr>`;
    }).join('');

    taskTableBody.querySelectorAll('.editable-cell').forEach(td => {
        td.addEventListener('click', (e) => {
            const tr = td.closest('tr');
            const taskId = tr.dataset.id;
            const field = td.dataset.field;
            startInlineEdit(td, taskId, field);
        });
    });
}

// ===== KANBAN RENDERING =====
function renderKanban() {
    const filtered = getFilteredTasks();
    const groupBy = kanbanGroupBy.value;

    let groups;
    if (groupBy === 'status') {
        groups = ALL_STATUSES;
    } else {
        groups = [...new Set(filtered.map(t => t[groupBy]))].sort();
        if (groups.length === 0) groups = ['No items'];
    }

    kanbanBoard.innerHTML = groups.map(group => {
        const groupTasks = filtered.filter(t => t[groupBy] === group);
        const headerColor = groupBy === 'status' ? getStatusHeaderColor(group) : '';

        return `<div class="kanban-column" data-group="${escapeHtml(group)}" data-group-by="${groupBy}">
            <div class="kanban-column-header" ${headerColor ? `style="border-top: 3px solid ${headerColor}"` : ''}>
                <span>${escapeHtml(group)}</span>
                <span class="count">${groupTasks.length}</span>
            </div>
            <div class="kanban-column-body"
                 ondragover="handleDragOver(event)"
                 ondragleave="handleDragLeave(event)"
                 ondrop="handleDrop(event, '${escapeHtml(group)}', '${groupBy}')">
                ${groupTasks.map(task => renderKanbanCard(task, groupBy)).join('')}
            </div>
        </div>`;
    }).join('');
}

function getStatusHeaderColor(status) {
    switch (status) {
        case 'To Do': return '#a0aec0';
        case 'In Progress': return '#2ecc71';
        case 'Hold': return '#f39c12';
        case 'Late': return '#e74c3c';
        case 'Completed': return '#4f8ff7';
        default: return '';
    }
}

function renderKanbanCard(task, groupBy) {
    const dueDateClass = getDueDateClass(task.dueDate);
    const statusClass = getStatusClass(task.status);
    const isLate = task.status === 'Late';

    let metaItems = [];
    if (groupBy !== 'client') metaItems.push(`<span>${escapeHtml(task.client)}</span>`);
    if (groupBy !== 'project') metaItems.push(`<span>${escapeHtml(task.project)}</span>`);
    if (groupBy !== 'status') metaItems.push(`<span class="status-badge ${statusClass}">${task.status}</span>`);

    return `<div class="kanban-card ${isLate ? 'card-late' : ''}" draggable="true" data-id="${task.id}"
                ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)">
        <div class="kanban-card-title">${escapeHtml(task.task)}</div>
        <div class="kanban-card-meta">
            ${metaItems.join('')}
            <span class="priority-badge">
                <span class="priority-dot ${task.priority.toLowerCase()}"></span>
                ${task.priority}
            </span>
            ${task.dueDate ? `<span class="${dueDateClass}">${formatDate(task.dueDate)}</span>` : ''}
        </div>
        <div class="kanban-card-footer">
            <span class="kanban-card-notes"
                  ${task.notes ? `onclick="showNotes('${task.id}')"` : ''}
                  title="${task.notes ? 'Click to view notes' : ''}">
                ${task.notes ? escapeHtml(task.notes.substring(0, 40)) + (task.notes.length > 40 ? '...' : '') : ''}
            </span>
            <div class="kanban-card-actions">
                <button class="btn-icon" onclick="editTask('${task.id}')" title="Edit">&#9998;</button>
                <button class="btn-icon delete" onclick="promptDelete('${task.id}')" title="Delete">&#128465;</button>
            </div>
        </div>
    </div>`;
}

// ===== DRAG AND DROP =====
function handleDragStart(e) {
    draggedCard = e.target.closest('.kanban-card');
    draggedCard.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedCard.dataset.id);
}

function handleDragEnd(e) {
    if (draggedCard) {
        draggedCard.classList.remove('dragging');
        draggedCard = null;
    }
    document.querySelectorAll('.kanban-column-body').forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e, group, groupBy) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task[groupBy] = group;
        task.updatedAt = new Date().toISOString();
        saveTasks(tasks);
        renderAll();
    }
}

// ===== MODAL HANDLING =====
function openTaskModal(taskId) {
    updateClientDropdown();
    if (taskId) {
        editingTaskId = taskId;
        modalTitle.textContent = 'Edit Task';
        saveBtn.textContent = 'Update Task';
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        taskName.value = task.task;
        updateClientDropdown(task.client);
        taskProject.value = task.project;
        taskDueDate.value = task.dueDate || '';
        taskPriority.value = task.priority;
        taskStatus.value = task.status;
        taskNotes.value = task.notes || '';
    } else {
        editingTaskId = null;
        modalTitle.textContent = 'New Task';
        saveBtn.textContent = 'Save Task';
        taskForm.reset();
        updateClientDropdown();
        taskPriority.value = 'Medium';
        taskStatus.value = 'To Do';
    }
    taskModal.classList.remove('hidden');
    taskName.focus();
}

function closeTaskModal() {
    taskModal.classList.add('hidden');
    editingTaskId = null;
    taskForm.reset();
}

function showNotes(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.notes) return;
    notesModalTitle.textContent = task.task;
    notesContent.textContent = task.notes;
    notesModal.classList.remove('hidden');
}

function closeNotesModal() {
    notesModal.classList.add('hidden');
}

function promptDelete(taskId) {
    deletingTaskId = taskId;
    deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
    deleteModal.classList.add('hidden');
    deletingTaskId = null;
}

function confirmDelete() {
    if (deletingTaskId) {
        tasks = tasks.filter(t => t.id !== deletingTaskId);
        saveTasks(tasks);
        closeDeleteModal();
        renderAll();
    }
}

// ===== CLIENT MANAGER =====
function openClientsModal() {
    renderClientList();
    clientsModal.classList.remove('hidden');
    newClientInput.focus();
}

function closeClientsModal() {
    clientsModal.classList.add('hidden');
    updateClientDropdown();
    updateFilterOptions();
}

function renderClientList() {
    clientListManager.innerHTML = clients.sort().map(c =>
        `<li>
            <span>${escapeHtml(c)}</span>
            <button class="btn-icon delete" onclick="removeClient('${escapeHtml(c)}')" title="Remove">&#128465;</button>
        </li>`
    ).join('');
}

function addNewClient() {
    const name = newClientInput.value.trim();
    if (!name) return;
    if (clients.includes(name)) {
        newClientInput.value = '';
        return;
    }
    clients.push(name);
    saveClients(clients);
    newClientInput.value = '';
    renderClientList();
}

function removeClient(name) {
    clients = clients.filter(c => c !== name);
    saveClients(clients);
    renderClientList();
}

// ===== CRUD =====
function saveTask(e) {
    e.preventDefault();

    const taskData = {
        id: editingTaskId || generateId(),
        task: taskName.value.trim(),
        client: taskClient.value.trim(),
        project: taskProject.value.trim(),
        dueDate: taskDueDate.value || '',
        priority: taskPriority.value,
        status: taskStatus.value,
        notes: taskNotes.value.trim(),
        createdAt: editingTaskId ? (tasks.find(t => t.id === editingTaskId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (editingTaskId) {
        const idx = tasks.findIndex(t => t.id === editingTaskId);
        if (idx !== -1) tasks[idx] = taskData;
    } else {
        tasks.push(taskData);
    }

    saveTasks(tasks);
    closeTaskModal();
    renderAll();
}

function editTask(taskId) {
    openTaskModal(taskId);
}

// ===== SORTING =====
function handleSort(e) {
    const field = e.currentTarget.dataset.sort;
    if (currentSort.field === field) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.field = field;
        currentSort.asc = true;
    }
    updateSortIcons();
    renderTable();
}

function updateSortIcons() {
    sortableHeaders.forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (th.dataset.sort === currentSort.field) {
            icon.textContent = currentSort.asc ? ' \u25B2' : ' \u25BC';
        } else {
            icon.textContent = '';
        }
    });
}

// ===== VIEW SWITCHING =====
function switchView(view) {
    viewBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    tableView.classList.toggle('hidden', view !== 'table');
    kanbanView.classList.toggle('hidden', view !== 'kanban');
    if (view === 'kanban') renderKanban();
}

// ===== PULL TO REFRESH =====
let pullStartY = 0;
let pulling = false;

document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
        pullStartY = e.touches[0].clientY;
        pulling = true;
    }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const pullDistance = e.touches[0].clientY - pullStartY;
    if (pullDistance > 80 && window.scrollY === 0) {
        pulling = false;
        // Show syncing feedback
        if (syncIndicator) {
            syncIndicator.textContent = 'Syncing...';
            syncIndicator.className = 'sync-indicator syncing';
        }
        syncFromServer().then(() => {
            renderAll();
        });
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    pulling = false;
}, { passive: true });

// ===== RENDER ALL =====
function renderAll() {
    autoDetectLate();
    updateSummary();
    updateFilterOptions();
    renderTable();
    if (!kanbanView.classList.contains('hidden')) {
        renderKanban();
    }
}

// ===== EVENT LISTENERS =====
addTaskBtn.addEventListener('click', () => openTaskModal());
modalClose.addEventListener('click', closeTaskModal);
cancelBtn.addEventListener('click', closeTaskModal);
taskForm.addEventListener('submit', saveTask);
deleteModalClose.addEventListener('click', closeDeleteModal);
cancelDeleteBtn.addEventListener('click', closeDeleteModal);
confirmDeleteBtn.addEventListener('click', confirmDelete);
notesModalClose.addEventListener('click', closeNotesModal);
closeNotesBtn.addEventListener('click', closeNotesModal);
clientsModalClose.addEventListener('click', closeClientsModal);
closeClientsBtn.addEventListener('click', closeClientsModal);
addClientBtn.addEventListener('click', addNewClient);
newClientInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNewClient(); } });

taskClient.addEventListener('change', () => {
    if (taskClient.value === '__manage__') {
        taskClient.value = '';
        openClientsModal();
    }
});

viewBtns.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

filterClient.addEventListener('change', renderAll);
filterProject.addEventListener('change', renderAll);
filterStatus.addEventListener('change', renderAll);
filterPriority.addEventListener('change', renderAll);
searchInput.addEventListener('input', renderAll);
kanbanGroupBy.addEventListener('change', renderKanban);

sortableHeaders.forEach(th => th.addEventListener('click', handleSort));

taskModal.addEventListener('click', e => { if (e.target === taskModal) closeTaskModal(); });
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });
notesModal.addEventListener('click', e => { if (e.target === notesModal) closeNotesModal(); });
clientsModal.addEventListener('click', e => { if (e.target === clientsModal) closeClientsModal(); });

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeTaskModal();
        closeDeleteModal();
        closeNotesModal();
        closeClientsModal();
    }
    if (e.ctrlKey && e.key === 'n' && taskModal.classList.contains('hidden')) {
        e.preventDefault();
        openTaskModal();
    }
});

// ===== DATA MIGRATION =====
(function migrateStatuses() {
    let changed = false;
    tasks.forEach(t => {
        if (t.status === 'Done') { t.status = 'Completed'; changed = true; }
    });
    if (changed) saveTasks(tasks);
})();

// ===== DESKTOP AUTO-REFRESH =====
// Poll server every 3 seconds on desktop only (not mobile — saves battery)
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
let lastKnownVersion = 0;

async function checkForUpdates() {
    if (!API_BASE) return;
    try {
        const res = await fetch(API_BASE + '/api/version', { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return;
        const data = await res.json();
        if (lastKnownVersion > 0 && data.version !== lastKnownVersion) {
            // Data changed on server — pull fresh data
            await syncFromServer();
            renderAll();
        }
        lastKnownVersion = data.version;
    } catch {}
}

if (!isMobile && API_BASE) {
    // Initial version check
    checkForUpdates();
    // Poll every 5 seconds
    setInterval(checkForUpdates, 5000);
}

// ===== INIT =====
// Render immediately from localStorage, then try server sync
renderAll();
syncFromServer().then(synced => {
    if (synced) {
        renderAll();
        // Set initial version so polling doesn't trigger an immediate re-render
        fetch(API_BASE + '/api/version').then(r => r.json()).then(d => { lastKnownVersion = d.version; }).catch(() => {});
    }
});
