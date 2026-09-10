(() => {
  const config = window.SUPABASE_CONFIG || {};
  const ready = config.url?.startsWith("https://") && !config.url.includes("YOUR_") && config.anonKey && !config.anonKey.includes("YOUR_");
  const client = ready && window.supabase ? window.supabase.createClient(config.url, config.anonKey) : null;

  const $ = selector => document.querySelector(selector);
  const authShell = $("#authShell"), calendarApp = $("#calendarApp"), authForm = $("#authForm");
  const emailInput = $("#emailInput"), passwordInput = $("#passwordInput"), authMessage = $("#authMessage");
  const authSubmit = $("#authSubmit"), authSwitch = $("#authSwitch"), authSwitchText = $("#authSwitchText");
  const authEyebrow = $("#authEyebrow"), authTitle = $("#authTitle"), authCopy = $("#authCopy");
  const grid = $("#calendarGrid"), monthLabel = $("#monthLabel"), dialog = $("#taskDialog"), form = $("#taskForm");
  const titleInput = $("#taskTitle"), dateInput = $("#taskDate"), timeInput = $("#taskTime"), categoryInput = $("#taskCategory"), visibilityInput = $("#taskVisibility");
  const completedInput = $("#taskCompleted"), deleteButton = $("#deleteButton"), dialogMode = $("#dialogMode"), dialogTitle = $("#dialogTitle");
  const taskTemplate = $("#taskTemplate"), calendar = $("#calendar"), scheduleMessage = $("#scheduleMessage");
  const myScheduleButton = $("#myScheduleButton"), sharedScheduleButton = $("#sharedScheduleButton"), shareIdArea = $("#shareIdArea");
  const sharedSearchForm = $("#sharedSearchForm"), sharedUserIdInput = $("#sharedUserId"), userIdNode = $("#userId");

  const today = startOfDay(new Date());
  let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let editingId = null, activeUserId = null, authMode = "signin", scheduleMode = "own", sharedUserId = "", tasks = [], sharedTasks = [];

  function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function isoDate(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function taskSort(a, b) { return (a.time || "99:99").localeCompare(b.time || "99:99") || a.title.localeCompare(b.title); }
  function categoryName(category) { return { work: "Work", personal: "Personal", study: "Study", health: "Health" }[category] || ""; }
  function formatTime(time) {
    if (!time) return "";
    const [hours, minutes] = time.split(":").map(Number);
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes));
  }
  function setAuthMessage(message = "", success = false) {
    authMessage.textContent = message;
    authMessage.classList.toggle("success", success);
  }
  function setTaskMessage(message = "") {
    let node = $("#taskMessage");
    if (!node) {
      node = document.createElement("p");
      node.id = "taskMessage";
      node.className = "form-message";
      form.querySelector(".dialog-actions").before(node);
    }
    node.textContent = message;
  }
  function showAuth() { authShell.hidden = false; calendarApp.hidden = true; }
  function showCalendar() { authShell.hidden = true; calendarApp.hidden = false; }
  function isOwnSchedule() { return scheduleMode === "own"; }
  function setScheduleMessage(message, shared = false) {
    scheduleMessage.textContent = message;
    scheduleMessage.classList.toggle("shared", shared);
  }
  function setScheduleMode(mode) {
    scheduleMode = mode;
    const own = isOwnSchedule();
    myScheduleButton.classList.toggle("active", own);
    myScheduleButton.setAttribute("aria-selected", String(own));
    sharedScheduleButton.classList.toggle("active", !own);
    sharedScheduleButton.setAttribute("aria-selected", String(!own));
    shareIdArea.hidden = !own;
    sharedSearchForm.hidden = own;
    calendar.classList.toggle("shared-view", !own);
    if (own) setScheduleMessage("Only you can see private tasks.");
    else if (!sharedUserId) setScheduleMessage("Paste a user's share ID to view only their viewable tasks.", true);
    renderCalendar();
  }

  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === "signup";
    authEyebrow.textContent = signup ? "Create an account" : "Welcome back";
    authTitle.textContent = signup ? "Start planning simply." : "Your days, in one place.";
    authCopy.textContent = signup ? "Create an account to keep your calendar in sync." : "Sign in to see your calendar.";
    authSubmit.textContent = signup ? "Create account" : "Sign in";
    authSwitchText.textContent = signup ? "Already have an account?" : "New to Daymark?";
    authSwitch.textContent = signup ? "Sign in" : "Create an account";
    passwordInput.autocomplete = signup ? "new-password" : "current-password";
    setAuthMessage();
  }

  function normalizeTask(row) {
    return {
      id: row.id, title: row.title, date: row.task_date,
      time: row.task_time ? row.task_time.slice(0, 5) : "",
      category: row.category || "", completed: row.completed, viewable: Boolean(row.is_viewable),
    };
  }
  async function loadTasks() {
    const { data, error } = await client.from("tasks")
      .select("id, title, task_date, task_time, category, completed, is_viewable")
      .eq("user_id", activeUserId);
    if (error) { setTaskMessage(`Could not load tasks: ${error.message}`); return; }
    tasks = data.map(normalizeTask);
    renderCalendar();
  }
  async function loadSharedTasks(userId) {
    const { data, error } = await client.from("tasks")
      .select("id, title, task_date, task_time, category, completed, is_viewable")
      .eq("user_id", userId)
      .eq("is_viewable", true);
    if (error) { setScheduleMessage(`Could not load that schedule: ${error.message}`, true); return; }
    sharedUserId = userId;
    sharedTasks = data.map(normalizeTask);
    setScheduleMessage(sharedTasks.length ? "Viewing this user's viewable tasks. Private tasks are hidden." : "No viewable tasks found for this user ID.", true);
    renderCalendar();
  }

  async function handleSession(session) {
    const user = session?.user;
    if (!user) {
      activeUserId = null;
      tasks = [];
      sharedTasks = [];
      sharedUserId = "";
      scheduleMode = "own";
      showAuth();
      return;
    }
    if (activeUserId === user.id) return;
    activeUserId = user.id;
    userIdNode.textContent = user.id;
    sharedTasks = [];
    sharedUserId = "";
    setScheduleMode("own");
    showCalendar();
    await loadTasks();
  }

  function renderCalendar() {
    monthLabel.textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(visibleMonth);
    grid.replaceChildren();
    const firstVisible = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - visibleMonth.getDay());
    const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
    const days = Math.ceil((visibleMonth.getDay() + monthEnd.getDate()) / 7) * 7;
    for (let index = 0; index < days; index++) {
      const date = new Date(firstVisible.getFullYear(), firstVisible.getMonth(), firstVisible.getDate() + index);
      const dateString = isoDate(date);
      const cell = document.createElement("div");
      cell.className = "day-cell";
      cell.dataset.date = dateString;
      if (isOwnSchedule()) {
        cell.tabIndex = 0;
        cell.setAttribute("role", "button");
        cell.setAttribute("aria-label", `Add task on ${new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date)}`);
      }
      if (date.getMonth() !== visibleMonth.getMonth()) cell.classList.add("outside");
      if (date.getTime() === today.getTime()) cell.classList.add("today");
      const number = document.createElement("span");
      number.className = "day-number";
      number.textContent = date.getDate();
      cell.append(number);
      const scheduleTasks = isOwnSchedule() ? tasks : sharedTasks;
      const items = scheduleTasks.filter(task => task.date === dateString).sort(taskSort);
      if (items.length) {
        const list = document.createElement("div");
        list.className = "task-list";
        items.forEach(task => list.append(renderTask(task)));
        cell.append(list);
      }
      grid.append(cell);
    }
  }

  function renderTask(task) {
    const chip = taskTemplate.content.firstElementChild.cloneNode(true);
    chip.classList.toggle("completed", Boolean(task.completed));
    if (task.category) chip.classList.add(`category-${task.category}`);
    chip.dataset.id = task.id;
    const category = categoryName(task.category);
    chip.title = `${task.title}${task.time ? ` · ${formatTime(task.time)}` : ""}${category ? ` · ${category}` : ""}`;
    if (isOwnSchedule()) {
      chip.tabIndex = 0;
      chip.setAttribute("role", "button");
      chip.setAttribute("aria-label", `Edit ${task.title}`);
      chip.addEventListener("click", event => { event.stopPropagation(); openEdit(task.id); });
      chip.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEdit(task.id); }
      });
    } else chip.classList.add("view-only");
    chip.querySelector(".task-time").textContent = formatTime(task.time);
    chip.querySelector(".task-title").textContent = task.title;
    return chip;
  }

  function openNew(date) {
    editingId = null;
    form.reset();
    dateInput.value = date;
    categoryInput.value = "";
    visibilityInput.value = "private";
    dialogMode.textContent = "New task";
    dialogTitle.textContent = "Plan something";
    deleteButton.classList.remove("visible");
    setTaskMessage();
    dialog.showModal();
    titleInput.focus();
  }
  function openEdit(id) {
    const task = tasks.find(item => item.id === id);
    if (!task) return;
    editingId = id;
    titleInput.value = task.title;
    dateInput.value = task.date;
    timeInput.value = task.time || "";
    categoryInput.value = task.category || "";
    visibilityInput.value = task.viewable ? "viewable" : "private";
    completedInput.checked = Boolean(task.completed);
    dialogMode.textContent = task.completed ? "Completed task" : "Edit task";
    dialogTitle.textContent = "Task details";
    deleteButton.classList.add("visible");
    setTaskMessage();
    dialog.showModal();
    titleInput.focus();
  }
  function closeDialog() { dialog.close(); editingId = null; }
  function taskPayload() {
    return { title: titleInput.value.trim(), task_date: dateInput.value, task_time: timeInput.value || null, category: categoryInput.value, completed: completedInput.checked, is_viewable: visibilityInput.value === "viewable" };
  }

  grid.addEventListener("click", event => { const cell = event.target.closest(".day-cell"); if (cell && isOwnSchedule()) openNew(cell.dataset.date); });
  grid.addEventListener("keydown", event => {
    const cell = event.target.closest(".day-cell");
    if (cell && isOwnSchedule() && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openNew(cell.dataset.date); }
  });
  $("#previousButton").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); renderCalendar(); });
  $("#nextButton").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); renderCalendar(); });
  $("#todayButton").addEventListener("click", () => { visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1); renderCalendar(); });
  $("#closeButton").addEventListener("click", closeDialog);
  $("#cancelButton").addEventListener("click", closeDialog);
  $("#signOutButton").addEventListener("click", () => client.auth.signOut());
  dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(); });
  myScheduleButton.addEventListener("click", () => setScheduleMode("own"));
  sharedScheduleButton.addEventListener("click", () => setScheduleMode("shared"));
  $("#copyUserId").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(activeUserId);
      $("#copyUserId").textContent = "Copied";
      setTimeout(() => { $("#copyUserId").textContent = "Copy"; }, 1600);
    } catch { setScheduleMessage("Copy your share ID manually.", false); }
  });
  sharedSearchForm.addEventListener("submit", async event => {
    event.preventDefault();
    const userId = sharedUserIdInput.value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      setScheduleMessage("Enter a valid share ID.", true);
      return;
    }
    await loadSharedTasks(userId);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = taskPayload();
    if (!payload.title) return;
    const saveButton = form.querySelector(".save-button");
    saveButton.disabled = true;
    setTaskMessage();
    const { error } = editingId
      ? await client.from("tasks").update(payload).eq("id", editingId)
      : await client.from("tasks").insert(payload);
    saveButton.disabled = false;
    if (error) { setTaskMessage(`Could not save task: ${error.message}`); return; }
    await loadTasks();
    closeDialog();
  });
  deleteButton.addEventListener("click", async () => {
    if (!editingId) return;
    deleteButton.disabled = true;
    const { error } = await client.from("tasks").delete().eq("id", editingId);
    deleteButton.disabled = false;
    if (error) { setTaskMessage(`Could not delete task: ${error.message}`); return; }
    await loadTasks();
    closeDialog();
  });

  authSwitch.addEventListener("click", () => setAuthMode(authMode === "signin" ? "signup" : "signin"));
  authForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = emailInput.value.trim(), password = passwordInput.value;
    authSubmit.disabled = true;
    setAuthMessage();
    const result = authMode === "signup"
      ? await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } })
      : await client.auth.signInWithPassword({ email, password });
    authSubmit.disabled = false;
    if (result.error) { setAuthMessage(result.error.message); return; }
    if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email to confirm your account, then sign in.", true);
  });

  async function initialize() {
    if (!client) {
      showAuth();
      setAuthMessage("Add your Supabase URL and publishable key in supabase-config.js, then reload.");
      authSubmit.disabled = true;
      return;
    }
    client.auth.onAuthStateChange((_event, session) => { void handleSession(session); });
    const { data: { session } } = await client.auth.getSession();
    await handleSession(session);
  }

  setAuthMode("signin");
  initialize();
})();
