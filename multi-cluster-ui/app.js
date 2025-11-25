// web-ui/app.js
const aggregatorUrl = (window.__AGG_URL__ && window.__AGG_URL__) || "http://localhost:8000";

const loginPanel = document.getElementById('loginPanel');
const dashboard = document.getElementById('dashboard');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginMsg = document.getElementById('loginMsg');

const clusterSelect = document.getElementById('clusterSelect');
const namespaceSelect = document.getElementById('namespaceSelect');
const deploymentSelect = document.getElementById('deploymentSelect');
const output = document.getElementById('output');
const restartBtn = document.getElementById('restartBtn');

const logsDiv = document.getElementById('logs');
const downloadLogs = document.getElementById('downloadLogs');
const exportConsole = document.getElementById('exportConsole');

let token = null;
let currentUser = null;
const LOG_KEY = "mc_ui_logs_v1";

function pushLog(level, event, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    user: currentUser || "anonymous",
    event,
    details
  };
  const arr = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  arr.unshift(entry);
  localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(0,1000)));
  renderLogs();
  console.log("[MC-UI]", entry);

  if (token) {
    fetch(`${aggregatorUrl}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(entry)
    }).catch(()=>{});
  }
}

function renderLogs(){
  const arr = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  logsDiv.innerHTML = "";
  arr.forEach(l => {
    const el = document.createElement("div");
    el.className = 'log-line';
    el.innerHTML = `<div class="log-meta">${l.ts} • ${l.user} • ${l.level}</div>
                    <div>${escapeHtml(JSON.stringify(l.event))} ${l.details ? "<pre style='margin:6px 0;color:#9cd6b8;'>"+escapeHtml(JSON.stringify(l.details, null, 2))+"</pre>" : ""}</div>`;
    logsDiv.appendChild(el);
  });
}

function escapeHtml(s){ return (""+s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

downloadLogs.addEventListener('click', () => {
  const data = localStorage.getItem(LOG_KEY) || "[]";
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `mc-ui-logs-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
});

exportConsole.addEventListener('click', () => {
  console.log("Export logs:", localStorage.getItem(LOG_KEY) || "[]");
  alert("Logs printed to console");
});

// ----- Login: send as x-www-form-urlencoded so server accepts OAuth2 form
loginBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) { loginMsg.innerText = "username & password required"; return; }

  const data = new URLSearchParams();
  data.append("username", username);
  data.append("password", password);

  try {
    const res = await fetch(`${aggregatorUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: data
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>({detail:'error'}));
      loginMsg.innerText = `Login failed: ${err.detail || JSON.stringify(err)}`;
      pushLog("warn","login.failed",{username, status: res.status, error: err});
      return;
    }

    const body = await res.json();
    token = body.access_token || null;
    currentUser = username;
    loginMsg.innerText = "";
    loginPanel.style.display = 'none';
    dashboard.style.display = 'block';
    pushLog("info","login.success",{username});
    loadClusters();

  } catch (err) {
    loginMsg.innerText = "Login error";
    pushLog("error","login.error",{error:String(err)});
  }
});

// logout
logoutBtn.addEventListener('click', () => {
  token = null;
  currentUser = null;
  loginPanel.style.display = 'block';
  dashboard.style.display = 'none';
  pushLog("info","logout",{});
});

// load clusters/namespaces/deployments
async function loadClusters(){
  try {
    const r = await fetch(`${aggregatorUrl}/clusters`, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const clusters = await r.json();
    clusterSelect.innerHTML = "";
    clusters.forEach(c => clusterSelect.add(new Option(c, c)));
    pushLog("info","clusters.load",{count:clusters.length});
    loadNamespaces();
  } catch (err) {
    pushLog("error","clusters.error",{error:String(err)});
    output.textContent = "Failed to fetch clusters: "+String(err);
  }
}

clusterSelect.addEventListener('change', loadNamespaces);
namespaceSelect.addEventListener('change', loadDeployments);

async function loadNamespaces(){
  const cluster = clusterSelect.value; if(!cluster) return;
  try {
    const r = await fetch(`${aggregatorUrl}/namespaces/${encodeURIComponent(cluster)}`, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const ns = await r.json();
    namespaceSelect.innerHTML = "";
    ns.forEach(n => namespaceSelect.add(new Option(n, n)));
    pushLog("info","namespaces.load",{cluster, count: ns.length});
    loadDeployments();
  } catch (err) {
    pushLog("error","namespaces.error",{cluster,error:String(err)});
    output.textContent = "Failed to fetch namespaces: "+String(err);
  }
}

async function loadDeployments(){
  const cluster = clusterSelect.value; const namespace = namespaceSelect.value; if(!cluster||!namespace) return;
  try {
    const r = await fetch(`${aggregatorUrl}/deployments/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}`, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const ds = await r.json();
    deploymentSelect.innerHTML = "";
    ds.forEach(d => deploymentSelect.add(new Option(d, d)));
    pushLog("info","deployments.load",{cluster, namespace, count: ds.length});
  } catch (err) {
    pushLog("error","deployments.error",{cluster,namespace,error:String(err)});
    output.textContent = "Failed to fetch deployments: "+String(err);
  }
}

// restart action
restartBtn.addEventListener('click', async () => {
  const cluster = clusterSelect.value; const namespace = namespaceSelect.value; const deployment = deploymentSelect.value;
  if(!cluster||!namespace||!deployment){ output.textContent = "Choose cluster / namespace / deployment first"; return; }
  const url = `${aggregatorUrl}/restart?cluster=${encodeURIComponent(cluster)}&namespace=${encodeURIComponent(namespace)}&deployment_name=${encodeURIComponent(deployment)}`;
  pushLog("info","restart.request",{cluster,namespace,deployment});
  try {
    const r = await fetch(url, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
    const body = await r.json();
    if (!r.ok) {
      pushLog("error","restart.failed",{cluster,namespace,deployment,status:r.status,body});
      output.textContent = JSON.stringify(body,null,2);
    } else {
      pushLog("info","restart.success",{cluster,namespace,deployment});
      output.textContent = JSON.stringify(body,null,2);
    }
  } catch (err) {
    pushLog("error","restart.error",{error:String(err)});
    output.textContent = "Request failed: "+String(err);
  }
});

// init logs view
renderLogs();
