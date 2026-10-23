// ===== Mobile nav toggle =====
(function () {
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    toggle.classList.toggle('open');
    links.classList.toggle('open');
  });

  links.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      toggle.classList.remove('open');
      links.classList.remove('open');
    });
  });
})();

// ===== Contact form (demo) =====
(function () {
  var form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var success = document.getElementById('formSuccess');
    if (success) {
      success.classList.add('show');
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    form.reset();
    setTimeout(function () {
      if (success) success.classList.remove('show');
    }, 5000);
  });
})();

// ===== Todo App (Supabase connected) =====
(function () {
  // Supabase config — publishable key, works with sb_publishable_* format
  var SUPABASE_URL = 'https://gktpkwmmtoaaobfpfeow.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xxWHiJ7Mr8S3k1Xm_9133g_2Qf5TvYW';
  var TABLE = 'todos';
  var STORAGE_KEY = 'yijia-todo-app-v1'; // localStorage offline fallback

  // Build Supabase client (only if SDK loaded)
  var sb = null;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn('[Todo] Supabase init failed:', e);
    }
  }

  var dateInput = document.getElementById('todoDate');
  var textInput = document.getElementById('todoText');
  var addBtn = document.getElementById('todoAdd');
  var listOpenEl = document.getElementById('todoListOpen');
  var listDoneEl = document.getElementById('todoListDone');
  var emptyMainEl = document.getElementById('todoEmptyMain');
  var emptyOpenEl = document.getElementById('todoEmptyOpen');
  var emptyDoneEl = document.getElementById('todoEmptyDone');
  var sectionOpenEl = document.getElementById('todoSectionOpen');
  var sectionDoneEl = document.getElementById('todoSectionDone');
  var openCountEl = document.getElementById('todoOpenCount');
  var doneCountEl = document.getElementById('todoDoneCount');
  var countEl = document.getElementById('todoCount');
  var clearBtn = document.getElementById('todoClearCompleted');
  var emojiBtn = document.getElementById('todoEmojiBtn');
  var emojiPanel = document.getElementById('todoEmojiPanel');
  var prioritySelect = document.getElementById('todoPriority');
  var searchInput = document.getElementById('todoSearch');
  var searchClearBtn = document.getElementById('todoSearchClear');
  var searchKeyword = '';

  if (!listOpenEl || !listDoneEl) return;

  function todayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  if (dateInput && !dateInput.value) {
    dateInput.value = todayStr();
  }

  // === In-memory state ===
  var tasks = [];

  // === LocalStorage (offline fallback) ===
  function saveToLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (e) { }
  }
  function loadFromLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      arr.forEach(function (t) {
        if (t.emoji == null) t.emoji = '';
        if (!t.priority) t.priority = 'medium';
      });
      return arr;
    } catch (e) { return []; }
  }

  // === Supabase I/O ===
  function loadFromSupabase() {
    if (!sb) return Promise.reject(new Error('no sb client'));
    return sb.from(TABLE).select('*').order('created_at', { ascending: true }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(normalizeFromRow);
    });
  }

  function insertToSupabase(task) {
    if (!sb) return Promise.reject(new Error('no sb client'));
    var row = {
      text: task.text,
      date: task.date || null,
      emoji: task.emoji || '',
      priority: task.priority || 'medium',
      completed: !!task.completed
    };
    return sb.from(TABLE).insert([row]).select().then(function (res) {
      if (res.error) throw res.error;
      return (res.data && res.data[0]) ? res.data[0] : null;
    });
  }

  function updateSupabase(task) {
    if (!sb) return Promise.reject(new Error('no sb client'));
    return sb.from(TABLE).update({
      text: task.text,
      date: task.date || null,
      emoji: task.emoji || '',
      priority: task.priority || 'medium',
      completed: !!task.completed
    }).eq('id', task.id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function deleteFromSupabase(id) {
    if (!sb) return Promise.reject(new Error('no sb client'));
    return sb.from(TABLE).delete().eq('id', id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function deleteCompletedFromSupabase(ids) {
    if (!sb || !ids.length) return Promise.resolve();
    return sb.from(TABLE).delete().in('id', ids).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function normalizeFromRow(row) {
    // Map supabase row -> our task shape
    return {
      id: row.id,
      text: row.text || '',
      date: row.date || '',
      emoji: row.emoji || '',
      priority: row.priority || 'medium',
      completed: !!row.completed,
      created_at: row.created_at
    };
  }

  // === Initial load: Supabase first, localStorage fallback ===
  function init() {
    // First paint with local cache so page isn't blank
    tasks = loadFromLocal();
    render();

    if (sb) {
      // Race Supabase fetch with a 1.8s timeout
      var timeout = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, 1800);
      });
      Promise.race([loadFromSupabase(), timeout])
        .then(function (remote) {
          if (remote.length > 0 || tasks.length === 0) {
            // Prefer remote if it has data, or if local was empty anyway
            tasks = remote;
          }
          saveToLocal();
          render();
        })
        .catch(function (err) {
          console.warn('[Todo] Supabase load failed, using local cache:', err.message || err);
          // Keep local tasks as-is
        });
    }
  }

  // === Helpers ===
  function formatDate(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return parts[1] + '/' + parts[2] + '/' + parts[0];
  }

  function priorityLabel(p) {
    if (p === 'high') return 'High';
    if (p === 'low') return 'Low';
    return 'Med';
  }

  function searchFilter(arr) {
    if (!searchKeyword) return arr;
    var kw = searchKeyword.toLowerCase();
    return arr.filter(function (t) {
      return (
        t.text.toLowerCase().indexOf(kw) !== -1 ||
        (t.emoji && t.emoji.toLowerCase().indexOf(kw) !== -1) ||
        (t.date && t.date.indexOf(kw) !== -1) ||
        t.priority.toLowerCase().indexOf(kw) !== -1
      );
    });
  }

  // === Build task <li> ===
  function createTaskLi(task, onComplete, onEdit, onDelete) {
    var li = document.createElement('li');
    li.className = 'todo-item' +
      (task.completed ? ' completed' : '') +
      (' pri-' + task.priority);

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = !!task.completed;
    checkbox.setAttribute('aria-label', 'Mark "' + task.text + '" as complete');

    var wrap = document.createElement('div');
    wrap.className = 'todo-text-wrap';

    var topRow = document.createElement('div');
    topRow.className = 'todo-top-row';

    if (task.emoji) {
      var emojiEl = document.createElement('span');
      emojiEl.className = 'todo-emoji-display';
      emojiEl.textContent = task.emoji;
      topRow.appendChild(emojiEl);
    }

    var span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = task.text;
    span.setAttribute('title', 'Click to edit');
    topRow.appendChild(span);

    var priBadge = document.createElement('span');
    priBadge.className = 'todo-priority-badge pri-' + task.priority;
    priBadge.textContent = priorityLabel(task.priority);
    topRow.appendChild(priBadge);

    wrap.appendChild(topRow);

    if (task.date) {
      var dateBadge = document.createElement('span');
      dateBadge.className = 'todo-date-badge';
      dateBadge.textContent = '📅 ' + formatDate(task.date);
      wrap.appendChild(dateBadge);
    }

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'todo-delete';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', 'Delete "' + task.text + '"');

    li.appendChild(checkbox);
    li.appendChild(wrap);
    li.appendChild(delBtn);

    checkbox.addEventListener('change', onComplete);
    span.addEventListener('click', function () { onEdit(span, task, li); });
    delBtn.addEventListener('click', onDelete);

    return li;
  }

  // === Render ===
  function render() {
    listOpenEl.innerHTML = '';
    listDoneEl.innerHTML = '';

    var filtered = searchFilter(tasks);
    var openTasks = filtered.filter(function (t) { return !t.completed; });
    var doneTasks = filtered.filter(function (t) { return t.completed; });

    var totalDone = tasks.filter(function (t) { return t.completed; }).length;
    var hasAnyTask = tasks.length > 0;
    var hasVisibleTask = filtered.length > 0;

    if (!hasVisibleTask && searchKeyword && hasAnyTask) {
      emptyMainEl.hidden = false;
      emptyMainEl.querySelector('p').textContent = 'No tasks match "' + searchKeyword + '".';
      sectionOpenEl.hidden = true;
      sectionDoneEl.hidden = true;
    } else if (!hasAnyTask) {
      emptyMainEl.hidden = false;
      emptyMainEl.querySelector('p').textContent = 'No tasks yet — add one above to get started.';
      sectionOpenEl.hidden = true;
      sectionDoneEl.hidden = true;
    } else {
      emptyMainEl.hidden = true;
      sectionOpenEl.hidden = false;
      sectionDoneEl.hidden = false;

      openCountEl.textContent = openTasks.length;
      if (openTasks.length === 0) {
        emptyOpenEl.hidden = false;
      } else {
        emptyOpenEl.hidden = true;
        openTasks.forEach(function (task) {
          listOpenEl.appendChild(createTaskLi(
            task,
            function () { toggleComplete(task, true); },
            startEdit,
            function () { removeTask(task); }
          ));
        });
      }

      doneCountEl.textContent = doneTasks.length;
      if (doneTasks.length === 0) {
        emptyDoneEl.hidden = false;
      } else {
        emptyDoneEl.hidden = true;
        doneTasks.forEach(function (task) {
          listDoneEl.appendChild(createTaskLi(
            task,
            function () { toggleComplete(task, false); },
            startEdit,
            function () { removeTask(task); }
          ));
        });
      }
    }

    var total = tasks.length;
    countEl.textContent = 'Completed ' + totalDone + ' / ' + total;
    clearBtn.hidden = totalDone === 0;
  }

  // === Data mutations (optimistic UI → async write) ===
  function addTask() {
    var text = textInput.value.trim();
    if (!text) { textInput.focus(); return; }
    var dateVal = dateInput ? dateInput.value : '';
    var emojiVal = emojiBtn ? emojiBtn.textContent.trim() : '';
    if (emojiVal === '✨') emojiVal = '';
    var priVal = prioritySelect ? prioritySelect.value : 'medium';

    var tempTask = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      text: text,
      date: dateVal,
      emoji: emojiVal,
      priority: priVal,
      completed: false
    };

    // Optimistic add
    tasks.push(tempTask);
    saveToLocal();
    render();

    // Async write to Supabase
    insertToSupabase(tempTask).then(function (row) {
      if (row) {
        // Replace temp id with real uuid from supabase
        tempTask.id = row.id;
      }
      saveToLocal();
    }).catch(function (err) {
      console.warn('[Todo] Insert failed:', err.message || err);
    });

    // Reset form
    textInput.value = '';
    if (dateInput) dateInput.value = todayStr();
    if (emojiBtn) emojiBtn.textContent = '✨';
    if (prioritySelect) prioritySelect.value = 'medium';
    textInput.focus();
  }

  function toggleComplete(task, completed) {
    task.completed = completed;
    saveToLocal();
    render();
    updateSupabase(task).catch(function (err) {
      console.warn('[Todo] Update (complete) failed:', err.message || err);
    });
  }

  function removeTask(task) {
    var i = tasks.indexOf(task);
    if (i === -1) return;
    tasks.splice(i, 1);
    saveToLocal();
    render();
    deleteFromSupabase(task.id).catch(function (err) {
      console.warn('[Todo] Delete failed:', err.message || err);
    });
  }

  function clearCompleted() {
    var doneIds = tasks.filter(function (t) { return t.completed; }).map(function (t) { return t.id; });
    tasks = tasks.filter(function (t) { return !t.completed; });
    saveToLocal();
    render();
    deleteCompletedFromSupabase(doneIds).catch(function (err) {
      console.warn('[Todo] Clear completed failed:', err.message || err);
    });
  }

  // === Inline edit ===
  function startEdit(span, task, li) {
    li.classList.add('editing');
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-text-input-inline';
    input.value = task.text;
    input.setAttribute('autocomplete', 'off');

    span.replaceWith(input);
    input.focus();
    input.select();

    function finishSave() {
      var newText = input.value.trim();
      li.classList.remove('editing');
      if (newText && newText !== task.text) {
        task.text = newText;
        saveToLocal();
        updateSupabase(task).catch(function (err) {
          console.warn('[Todo] Update (edit) failed:', err.message || err);
        });
      }
      render();
    }
    function finishCancel() {
      li.classList.remove('editing');
      render();
    }

    input.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); finishSave(); }
      else if (e.key === 'Escape') { e.preventDefault(); finishCancel(); }
    });
    input.addEventListener('blur', finishSave);
  }

  // === Wire up events ===
  if (emojiBtn && emojiPanel) {
    emojiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      emojiPanel.hidden = !emojiPanel.hidden;
    });
    emojiPanel.addEventListener('click', function (e) {
      var opt = e.target.closest('.todo-emoji-opt');
      if (!opt) return;
      emojiBtn.textContent = opt.getAttribute('data-emoji') || '✨';
      emojiPanel.hidden = true;
    });
    document.addEventListener('click', function (e) {
      if (!emojiPanel.hidden && !emojiPanel.contains(e.target) && e.target !== emojiBtn) {
        emojiPanel.hidden = true;
      }
    });
  }

  if (addBtn) addBtn.addEventListener('click', addTask);

  if (textInput) {
    textInput.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); addTask(); }
    });
  }

  if (clearBtn) clearBtn.addEventListener('click', clearCompleted);

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchKeyword = searchInput.value.trim();
      if (searchClearBtn) searchClearBtn.hidden = searchKeyword.length === 0;
      render();
    });
  }
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', function () {
      if (searchInput) searchInput.value = '';
      searchKeyword = '';
      searchClearBtn.hidden = true;
      render();
      if (searchInput) searchInput.focus();
    });
  }

  init();
})();
