const API_BASE = "https://demo-fullstack-backend.dvybornyh332.workers.dev";

const state = { page: 1, pageSize: 10, pages: 1, total: 0 };

const el = (id) => document.getElementById(id);
const apiUrlLabel = el("api-url");
if (apiUrlLabel) apiUrlLabel.textContent = API_BASE;

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " +
    d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

async function api(path, options) {
  const res = await fetch(API_BASE + path, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
  if (!res.ok) {
    let message = "HTTP " + res.status;
    try {
      const body = await res.json();
      if (body && body.error && body.error.message) message = body.error.message;
    } catch (e) { /* ignore */ }
    throw new Error(message);
  }
  return res.json();
}

async function checkHealth() {
  const pill = el("api-status");
  try {
    const res = await fetch(API_BASE + "/health");
    if (!res.ok) throw new Error("unhealthy");
    pill.className = "status-pill status-ok";
    pill.textContent = "API онлайн";
  } catch (e) {
    pill.className = "status-pill status-fail";
    pill.textContent = "API недоступен";
  }
}

function currentQuery() {
  const params = new URLSearchParams();
  const search = el("filter-search").value.trim();
  const status = el("filter-status").value;
  const priority = el("filter-priority").value;
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  params.set("sort", el("sort-by").value);
  params.set("order", el("sort-order").value);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  return params.toString();
}

async function loadTasks() {
  const errorBox = el("error");
  errorBox.classList.add("hidden");
  try {
    const data = await api("/api/v1/tasks?" + currentQuery());
    state.total = data.total;
    state.pages = data.pages;
    renderRows(data.items);
    el("page-info").textContent = "Стр. " + data.page + " из " + data.pages + " · всего " + data.total;
    el("prev").disabled = data.page <= 1;
    el("next").disabled = data.page >= data.pages;
  } catch (e) {
    errorBox.textContent = "Не удалось загрузить задачи: " + e.message;
    errorBox.classList.remove("hidden");
  }
}

function renderRows(items) {
  const tbody = el("task-rows");
  tbody.innerHTML = "";
  el("empty").classList.toggle("hidden", items.length > 0);

  items.forEach((task) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100 row-hover";

    const title = document.createElement("td");
    title.className = "py-2.5 pr-3";
    title.innerHTML = '<div class="font-medium">' + escapeHtml(task.title) + "</div>" +
      (task.description ? '<div class="text-xs text-slate-500 mt-0.5">' + escapeHtml(task.description) + "</div>" : "");

    const status = document.createElement("td");
    status.className = "py-2.5 pr-3";
    const select = document.createElement("select");
    select.className = "badge badge-" + task.status;
    ["todo", "in_progress", "done", "blocked"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      if (value === task.status) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        await api("/api/v1/tasks/" + task.id, { method: "PATCH", body: JSON.stringify({ status: select.value }) });
        await Promise.all([loadTasks(), loadSummary()]);
      } catch (e) {
        alert("Не удалось обновить статус: " + e.message);
        select.disabled = false;
      }
    });
    status.appendChild(select);

    const priority = document.createElement("td");
    priority.className = "py-2.5 pr-3";
    priority.innerHTML = '<span class="badge badge-' + task.priority + '">' + task.priority + "</span>";

    const assignee = document.createElement("td");
    assignee.className = "py-2.5 pr-3 hidden md:table-cell text-slate-600";
    assignee.textContent = task.assignee;

    const created = document.createElement("td");
    created.className = "py-2.5 pr-3 hidden lg:table-cell text-slate-500 text-xs whitespace-nowrap";
    created.textContent = fmtDate(task.createdAt);

    const actions = document.createElement("td");
    actions.className = "py-2.5 pr-3 text-right";
    const del = document.createElement("button");
    del.className = "btn-ghost";
    del.textContent = "Удалить";
    del.addEventListener("click", async () => {
      if (!confirm("Удалить задачу?")) return;
      try {
        await api("/api/v1/tasks/" + task.id, { method: "DELETE" });
        await Promise.all([loadTasks(), loadSummary()]);
      } catch (e) {
        alert("Не удалось удалить: " + e.message);
      }
    });
    actions.appendChild(del);

    tr.appendChild(title);
    tr.appendChild(status);
    tr.appendChild(priority);
    tr.appendChild(assignee);
    tr.appendChild(created);
    tr.appendChild(actions);
    tbody.appendChild(tr);
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

async function loadSummary() {
  try {
    const data = await api("/api/v1/analytics/summary?days=14");
    el("kpi-total").textContent = data.total;
    el("kpi-progress").textContent = data.byStatus.in_progress + data.byStatus.blocked;
    el("kpi-done").textContent = data.byStatus.done;
    el("kpi-rate").textContent = data.completionRate + "%";
    renderChart(data.createdPerDay);
    renderPriorities(data.byPriority);
  } catch (e) {
    el("kpi-total").textContent = "—";
  }
}

function renderChart(points) {
  const chart = el("chart");
  chart.innerHTML = "";
  if (!points || points.length === 0) {
    chart.innerHTML = '<div class="text-sm text-slate-400 w-full text-center py-10">Нет данных за период</div>';
    return;
  }
  const max = Math.max.apply(null, points.map((p) => p.count)) || 1;
  points.forEach((point) => {
    const col = document.createElement("div");
    col.className = "chart-col";
    col.title = point.date + ": " + point.count;
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = Math.max(3, Math.round((point.count / max) * 140)) + "px";
    const label = document.createElement("div");
    label.className = "chart-label";
    label.textContent = point.date.slice(8) + "." + point.date.slice(5, 7);
    col.appendChild(bar);
    col.appendChild(label);
    chart.appendChild(col);
  });
}

function renderPriorities(byPriority) {
  const container = el("priority-bars");
  container.innerHTML = "";
  const colors = { critical: "#dc2626", high: "#f97316", medium: "#eab308", low: "#94a3b8" };
  const total = Object.values(byPriority).reduce((a, b) => a + b, 0) || 1;
  ["critical", "high", "medium", "low"].forEach((key) => {
    const value = byPriority[key] || 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML =
      '<span class="text-slate-600">' + key + "</span>" +
      '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round((value / total) * 100) + "%;background:" + colors[key] + '"></span></span>' +
      '<span class="text-right text-slate-500">' + value + "</span>";
    container.appendChild(row);
  });
}

async function runAudit() {
  const box = el("audit-body");
  box.innerHTML = '<div class="text-slate-400">выполняется…</div>';
  try {
    const report = await api("/api/v1/analytics/audit");
    renderAudit(report);
  } catch (e) {
    box.innerHTML = '<div class="text-red-600">Ошибка аудита: ' + escapeHtml(e.message) + "</div>";
  }
}

function renderAudit(report) {
  const box = el("audit-body");
  box.innerHTML = "";

  const head = document.createElement("div");
  head.className = "flex items-center gap-3 mb-3";
  head.innerHTML =
    '<div class="text-2xl font-bold">' + report.score + '<span class="text-sm text-slate-400">/100</span></div>' +
    '<div class="text-xs text-slate-500">' + report.checksRun + " проверок выполнено</div>";
  box.appendChild(head);

  if (report.findings.length === 0) {
    const ok = document.createElement("div");
    ok.className = "text-emerald-600 text-sm";
    ok.textContent = "Замечаний не найдено.";
    box.appendChild(ok);
  } else {
    report.findings.forEach((finding) => {
      const div = document.createElement("div");
      div.className = "finding finding-" + finding.severity;
      div.innerHTML =
        '<div class="font-medium">' + escapeHtml(finding.message) + "</div>" +
        '<div class="text-xs text-slate-500 mt-1">' + escapeHtml(finding.category) + " · " + escapeHtml(finding.location) + "</div>";
      box.appendChild(div);
    });
  }

  if (report.refactoringPlan && report.refactoringPlan.length) {
    const planTitle = document.createElement("div");
    planTitle.className = "text-xs uppercase tracking-wider text-slate-500 mt-4 mb-2";
    planTitle.textContent = "План рефакторинга";
    box.appendChild(planTitle);

    report.refactoringPlan.forEach((step) => {
      const div = document.createElement("div");
      div.className = "plan-step";
      div.innerHTML = '<div class="plan-num">' + step.step + "</div>" +
        '<div><div>' + escapeHtml(step.action) + '</div><div class="text-xs text-slate-500">' + escapeHtml(step.rationale) + " · " + step.effort + "</div></div>";
      box.appendChild(div);
    });
  }
}

async function loadMetrics() {
  try {
    const res = await fetch(API_BASE + "/metrics");
    const text = await res.text();
    const relevant = text.split("\n").filter((line) => line.startsWith("http_") || line.startsWith("tasks_") || line.startsWith("cache_") || line.startsWith("repository_"));
    el("metrics").textContent = relevant.slice(0, 40).join("\n") || text.slice(0, 2000);
  } catch (e) {
    el("metrics").textContent = "недоступно";
  }
}

el("create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = el("new-title").value.trim();
  if (!title) return;
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    await api("/api/v1/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: title,
        priority: el("new-priority").value,
        assignee: el("new-assignee").value.trim() || "unassigned",
        description: "",
      }),
    });
    el("new-title").value = "";
    el("new-assignee").value = "";
    await Promise.all([loadTasks(), loadSummary()]);
  } catch (e) {
    alert("Не удалось создать задачу: " + e.message);
  } finally {
    button.disabled = false;
  }
});

let debounce;
el("filter-search").addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => { state.page = 1; loadTasks(); }, 300);
});
["filter-status", "filter-priority", "sort-by", "sort-order"].forEach((id) => {
  el(id).addEventListener("change", () => { state.page = 1; loadTasks(); });
});

el("refresh").addEventListener("click", () => { loadTasks(); loadSummary(); loadMetrics(); });
el("prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadTasks(); } });
el("next").addEventListener("click", () => { if (state.page < state.pages) { state.page += 1; loadTasks(); } });
el("run-audit").addEventListener("click", runAudit);

checkHealth();
loadTasks();
loadSummary();
loadMetrics();
runAudit();
setInterval(checkHealth, 15000);
setInterval(loadSummary, 30000);