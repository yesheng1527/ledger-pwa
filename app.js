const CACHE_KEY = "ledger-pwa-cache-v2";
const LOCAL_AUTH_KEY = "ledger-pwa-local-auth-v1";
const LOCAL_SESSION_KEY = "ledger-pwa-local-session-v1";
const OFFLINE_EMAIL_KEY = "ledger-pwa-offline-email";
const SUPABASE_STORAGE_KEY = "ledger-pwa-supabase-session";
const SUPABASE_SESSION_BACKUP_KEY = "ledger-pwa-supabase-session-backup";
const APP_VERSION = "32";
const DEMO_TRANSACTION_IDS = new Set(["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"]);

clearLegacyDemoBills();

const app = document.querySelector("#app");
const toastNode = document.querySelector("#toast");

const fallbackState = {
  theme: "teal",
  period: { month: "2024-06" },
  profile: { name: "小明", bio: "记录每一笔，掌控每一天", avatar: "人" },
  accounts: [],
  categories: [],
  transactions: [],
  budgets: { total: 0, categories: {} },
  savingPlans: []
};

function seedLocalState() {
  return {
    theme: "teal",
    period: { month: "2024-06" },
    profile: { name: "小明", bio: "记录每一笔，掌控每一天", avatar: "人" },
    accounts: [
      { id: "wechat", name: "微信钱包", balance: 0, color: "#11c95f", icon: "微", isDefault: true },
      { id: "alipay", name: "支付宝账户", balance: 0, color: "#3487ff", icon: "支", isDefault: false },
      { id: "cmb", name: "招商银行储蓄卡", balance: 0, color: "#e51b2a", icon: "招", isDefault: false },
      { id: "cash", name: "现金", balance: 0, color: "#ff9d00", icon: "现", isDefault: false }
    ],
    categories: [
      { id: "food", type: "expense", name: "餐饮美食", color: "#ff9d1b", icon: "食" },
      { id: "transport", type: "expense", name: "交通出行", color: "#4d86f7", icon: "车" },
      { id: "shopping", type: "expense", name: "购物消费", color: "#27be72", icon: "购" },
      { id: "home", type: "expense", name: "居家生活", color: "#8b5be8", icon: "家" },
      { id: "fun", type: "expense", name: "休闲娱乐", color: "#ff5c72", icon: "乐" },
      { id: "network", type: "expense", name: "通讯网络", color: "#ff7a1a", icon: "网" },
      { id: "salary", type: "income", name: "工资收入", color: "#009b8f", icon: "工" },
      { id: "bonus", type: "income", name: "奖金红包", color: "#34c759", icon: "奖" }
    ],
    transactions: [],
    budgets: { total: 0, categories: {} },
    savingPlans: []
  };
}

const navTabs = [
  { id: "home", label: "首页", icon: "⌂" },
  { id: "ledger", label: "账本", icon: "▰" },
  { id: "entry", label: "记一笔", icon: "+" },
  { id: "stats", label: "统计", icon: "▥" },
  { id: "mine", label: "我的", icon: "♟" }
];

const config = window.LEDGER_SUPABASE_CONFIG || {};
const hasConfig = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
const supabaseClient = hasConfig && window.supabase
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: SUPABASE_STORAGE_KEY,
        lock: async (_name, _acquireTimeout, fn) => fn()
      }
    })
  : null;

let route = { name: "boot", params: {} };
let session = null;
let draft = { type: "expense", accountId: "", categoryId: "" };
let syncStatus = { mode: "unknown", lastSyncedAt: null, error: "", counts: null };

const store = {
  state: readCache(),
  async load() {
    if (!session) return;
    if (isLocalMode()) {
      const key = localUserDataKey(session.user.email);
      const saved = localStorage.getItem(key);
      this.state = saved ? { ...seedLocalState(), ...JSON.parse(saved) } : seedLocalState();
      syncStatus = { mode: "local", lastSyncedAt: null, error: "", counts: null };
      this.cache();
      syncDraftDefaults();
      return;
    }
    const userId = session.user.id;
    let data = await this.fetchRemoteState(userId);
    if (data.needsSeed) {
      await this.ensureDefaults(userId);
      data = await this.fetchRemoteState(userId);
    }
    this.state = data.state;
    syncStatus = {
      mode: "cloud",
      lastSyncedAt: new Date().toLocaleString("zh-CN"),
      error: "",
      counts: {
        accounts: data.state.accounts.length,
        categories: data.state.categories.length,
        transactions: data.state.transactions.length,
        savingPlans: data.state.savingPlans.length
      }
    };
    this.cache();
    syncDraftDefaults();
  },
  async fetchRemoteState(userId) {
    const encodedUserId = encodeURIComponent(userId);
    const diagnostics = await Promise.all([
      restRequest("profiles", `profiles?select=*&user_id=eq.${encodedUserId}&limit=1`, { single: true }),
      restRequest("accounts", `accounts?select=*&user_id=eq.${encodedUserId}&order=created_at.asc`),
      restRequest("categories", `categories?select=*&user_id=eq.${encodedUserId}&order=type.asc,created_at.asc`),
      restRequest("transactions", `transactions?select=*&user_id=eq.${encodedUserId}&order=tx_date.desc,tx_time.desc`),
      restRequest("budgets", `budgets?select=*&user_id=eq.${encodedUserId}&limit=1`, { single: true }),
      restRequest("category_budgets", `category_budgets?select=*&user_id=eq.${encodedUserId}`),
      restRequest("saving_plans", `saving_plans?select=*&user_id=eq.${encodedUserId}&order=created_at.asc`)
    ]);
    setSyncDiagnostics(diagnostics.map(({ name, status, ms, error }) => ({ name, status, ms, error })));
    const failed = diagnostics.find((item) => item.status !== "ok");
    if (failed) throw new Error(`${failed.name}: ${failed.error || "请求失败"}`);

    const [
      profileRes,
      accountsRes,
      categoriesRes,
      transactionsRes,
      budgetRes,
      categoryBudgetsRes,
      plansRes
    ] = diagnostics.map((item) => item.result);

    throwIfError(profileRes);
    throwIfError(accountsRes);
    throwIfError(categoriesRes);
    throwIfError(transactionsRes);
    throwIfError(budgetRes);
    throwIfError(categoryBudgetsRes);
    throwIfError(plansRes);

    const needsSeed = !profileRes.data || !(accountsRes.data || []).length || !(categoriesRes.data || []).length;
    const fallback = seedLocalState();
    const categoryBudgetMap = {};
    (categoryBudgetsRes.data || []).forEach((item) => {
      categoryBudgetMap[item.category_id] = Number(item.amount || 0);
    });

    return {
      needsSeed,
      state: {
        theme: profileRes.data?.theme || fallback.theme,
        period: { month: profileRes.data?.current_month || fallback.period.month },
        profile: {
          name: profileRes.data?.name || fallback.profile.name,
          bio: profileRes.data?.bio || fallback.profile.bio,
          avatar: profileRes.data?.avatar || fallback.profile.avatar
        },
        accounts: (accountsRes.data || []).map(mapAccount),
        categories: (categoriesRes.data || []).map(mapCategory),
        transactions: (transactionsRes.data || []).map(mapTransaction),
        budgets: {
          total: Number(budgetRes.data?.total || fallback.budgets.total || 0),
          categories: categoryBudgetMap
        },
        savingPlans: (plansRes.data || []).map(mapSavingPlan)
      }
    };
  },
  cache() {
    if ((isLocalMode()) && session?.user?.email) {
      localStorage.setItem(localUserDataKey(session.user.email), JSON.stringify(this.state));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(this.state));
  },
  async ensureDefaults(userId) {
    const diagnostic = await restRequest("seed_ledger_defaults", "rpc/seed_ledger_defaults", {
      method: "POST",
      body: { target_user: userId },
      ms: 15000
    });
    setSyncDiagnostics([diagnostic].map(({ name, status, ms, error }) => ({ name, status, ms, error })));
    if (diagnostic.status !== "ok") throw new Error(`${diagnostic.name}: ${diagnostic.error || "请求失败"}`);
  },
  async setSelectedMonth(month) {
    this.state.period = { month };
    this.state.theme = this.state.theme || "teal";
    if (isLocalMode()) {
      this.cache();
      return;
    }
    await supabaseClient.from("profiles").update({ current_month: month }).eq("user_id", session.user.id);
    this.cache();
  },
  async addTransaction(transaction) {
    const id = `t${Date.now()}`;
    if (isLocalMode()) {
      const account = this.state.accounts.find((item) => item.id === transaction.accountId);
      if (account) account.balance += transaction.type === "income" ? transaction.amount : -transaction.amount;
      this.state.transactions.unshift({ ...transaction, id });
      this.cache();
      return;
    }
    const row = {
      id,
      user_id: session.user.id,
      type: transaction.type,
      amount: transaction.amount,
      title: transaction.title,
      category_id: transaction.categoryId,
      account_id: transaction.accountId,
      tx_date: transaction.date,
      tx_time: transaction.time,
      note: transaction.note || ""
    };
    const account = this.state.accounts.find((item) => item.id === transaction.accountId);
    const nextBalance = Number(account?.balance || 0) + (transaction.type === "income" ? transaction.amount : -transaction.amount);
    const insertRes = await supabaseClient.from("transactions").insert(row);
    throwIfError(insertRes);
    const accountRes = await supabaseClient
      .from("accounts")
      .update({ balance: nextBalance })
      .eq("user_id", session.user.id)
      .eq("id", transaction.accountId);
    throwIfError(accountRes);
    this.state.transactions.unshift({ ...transaction, id });
    if (account) account.balance = nextBalance;
    this.cache();
  },
  async deleteTransaction(id) {
    const tx = this.state.transactions.find((item) => item.id === id);
    if (!tx) return false;
    const account = this.state.accounts.find((item) => item.id === tx.accountId);
    const nextBalance = Number(account?.balance || 0) + (tx.type === "income" ? -tx.amount : tx.amount);
    if (isLocalMode()) {
      this.state.transactions = this.state.transactions.filter((item) => item.id !== id);
      if (account) account.balance = nextBalance;
      this.cache();
      return true;
    }
    const deleteRes = await supabaseClient
      .from("transactions")
      .delete()
      .eq("user_id", session.user.id)
      .eq("id", id);
    throwIfError(deleteRes);
    if (account) {
      const accountRes = await supabaseClient
        .from("accounts")
        .update({ balance: nextBalance })
        .eq("user_id", session.user.id)
        .eq("id", tx.accountId);
      throwIfError(accountRes);
      account.balance = nextBalance;
    }
    this.state.transactions = this.state.transactions.filter((item) => item.id !== id);
    this.cache();
    return true;
  },
  async upsertAccount(account) {
    if (account.isDefault) {
      if (isLocalMode()) {
        this.state.accounts.forEach((item) => (item.isDefault = false));
        upsertLocal(this.state.accounts, account);
        this.cache();
        return;
      }
      const clearRes = await supabaseClient.from("accounts").update({ is_default: false }).eq("user_id", session.user.id);
      throwIfError(clearRes);
      this.state.accounts.forEach((item) => (item.isDefault = false));
    }
    if (isLocalMode()) {
      upsertLocal(this.state.accounts, account);
      this.cache();
      return;
    }
    const row = {
      id: account.id,
      user_id: session.user.id,
      name: account.name,
      balance: account.balance,
      color: account.color,
      icon: account.icon,
      is_default: account.isDefault
    };
    const res = await supabaseClient.from("accounts").upsert(row, { onConflict: "user_id,id" });
    throwIfError(res);
    upsertLocal(this.state.accounts, account);
    this.cache();
  },
  async upsertSavingPlan(plan) {
    if (isLocalMode()) {
      upsertLocal(this.state.savingPlans, plan);
      this.cache();
      return;
    }
    const row = {
      id: plan.id,
      user_id: session.user.id,
      name: plan.name,
      icon: plan.icon,
      target: plan.target,
      saved: plan.saved,
      due_date: plan.dueDate
    };
    const res = await supabaseClient.from("saving_plans").upsert(row, { onConflict: "user_id,id" });
    throwIfError(res);
    upsertLocal(this.state.savingPlans, plan);
    this.cache();
  },
  async upsertCategory(category) {
    if (isLocalMode()) {
      upsertLocal(this.state.categories, category);
      this.cache();
      return;
    }
    const row = {
      id: category.id,
      user_id: session.user.id,
      type: category.type,
      name: category.name,
      color: category.color,
      icon: category.icon
    };
    const res = await supabaseClient.from("categories").upsert(row, { onConflict: "user_id,id" });
    throwIfError(res);
    upsertLocal(this.state.categories, category);
    this.cache();
  },
  async deleteCategory(id) {
    const used = this.state.transactions.some((tx) => tx.categoryId === id);
    if (used) return false;
    if (isLocalMode()) {
      this.state.categories = this.state.categories.filter((item) => item.id !== id);
      delete this.state.budgets.categories[id];
      this.cache();
      return true;
    }
    const res = await supabaseClient.from("categories").delete().eq("user_id", session.user.id).eq("id", id);
    throwIfError(res);
    this.state.categories = this.state.categories.filter((item) => item.id !== id);
    delete this.state.budgets.categories[id];
    this.cache();
    return true;
  },
  async saveBudget(total, categoryBudgets) {
    if (isLocalMode()) {
      this.state.budgets = { total, categories: categoryBudgets };
      this.cache();
      return;
    }
    const budgetRes = await supabaseClient
      .from("budgets")
      .upsert({ user_id: session.user.id, total }, { onConflict: "user_id" });
    throwIfError(budgetRes);
    const rows = Object.entries(categoryBudgets).map(([categoryId, amount]) => ({
      user_id: session.user.id,
      category_id: categoryId,
      amount
    }));
    if (rows.length) {
      const categoryRes = await supabaseClient.from("category_budgets").upsert(rows, { onConflict: "user_id,category_id" });
      throwIfError(categoryRes);
    }
    this.state.budgets = { total, categories: categoryBudgets };
    this.cache();
  },
  async saveProfile(profile) {
    if (isLocalMode()) {
      this.state.profile = profile;
      this.cache();
      return;
    }
    const res = await supabaseClient
      .from("profiles")
      .update({
        name: profile.name,
        bio: profile.bio,
        avatar: profile.avatar,
        theme: this.state.theme || "teal"
      })
      .eq("user_id", session.user.id);
    throwIfError(res);
    this.state.profile = profile;
    this.cache();
  },
  async saveTheme(theme) {
    if (isLocalMode()) {
      this.state.theme = theme;
      this.cache();
      return;
    }
    const res = await supabaseClient.from("profiles").update({ theme }).eq("user_id", session.user.id);
    throwIfError(res);
    this.state.theme = theme;
    this.cache();
  },
  async cleanupDemoData() {
    const cleaned = resetUserLedgerState(this.state);
    if (isLocalMode()) {
      this.state = cleaned;
      this.cache();
      return { mode: "local" };
    }
    const userId = session.user.id;
    const encodedUserId = encodeURIComponent(userId);
    const diagnostics = await Promise.all([
      restRequest("cleanup_transactions", `transactions?user_id=eq.${encodedUserId}`, { method: "DELETE", prefer: "return=minimal", ms: 8000 }),
      restRequest("cleanup_accounts", `accounts?user_id=eq.${encodedUserId}`, { method: "PATCH", body: { balance: 0 }, prefer: "return=minimal", ms: 8000 }),
      restRequest("cleanup_budgets", `budgets?user_id=eq.${encodedUserId}`, { method: "PATCH", body: { total: 0 }, prefer: "return=minimal", ms: 8000 }),
      restRequest("cleanup_category_budgets", `category_budgets?user_id=eq.${encodedUserId}`, { method: "DELETE", prefer: "return=minimal", ms: 8000 }),
      restRequest("cleanup_saving_plans", `saving_plans?user_id=eq.${encodedUserId}`, { method: "DELETE", prefer: "return=minimal", ms: 8000 })
    ]);
    setSyncDiagnostics(diagnostics.map(({ name, status, ms, error }) => ({ name, status, ms, error })));
    const failed = diagnostics.find((item) => item.status !== "ok");
    if (failed) throw new Error(`${failed.name}: ${failed.error || "清理失败"}`);
    this.state = cleaned;
    this.cache();
    return { mode: "cloud", diagnostics };
  }
};

function mapAccount(row) {
  return { id: row.id, name: row.name, balance: Number(row.balance || 0), color: row.color, icon: row.icon, isDefault: row.is_default };
}

function mapCategory(row) {
  return { id: row.id, type: row.type, name: row.name, color: row.color, icon: row.icon };
}

function mapTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount || 0),
    title: row.title,
    categoryId: row.category_id,
    accountId: row.account_id,
    date: row.tx_date,
    time: String(row.tx_time || "09:41").slice(0, 5),
    note: row.note || ""
  };
}

function mapSavingPlan(row) {
  return { id: row.id, name: row.name, icon: row.icon, target: Number(row.target || 0), saved: Number(row.saved || 0), dueDate: row.due_date };
}

function upsertLocal(list, item) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) list[index] = item;
  else list.push(item);
}

function throwIfError(result) {
  if (result?.error) throw result.error;
}

function withTimeout(promise, ms, message = "连接 Supabase 超时，请稍后再试") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

function backupSupabaseSession(nextSession) {
  if (!nextSession?.access_token || !nextSession?.refresh_token) return;
  localStorage.setItem(
    SUPABASE_SESSION_BACKUP_KEY,
    JSON.stringify({
      access_token: nextSession.access_token,
      refresh_token: nextSession.refresh_token,
      email: nextSession.user?.email || "",
      saved_at: Date.now()
    })
  );
}

function readSupabaseSessionBackup() {
  try {
    return JSON.parse(localStorage.getItem(SUPABASE_SESSION_BACKUP_KEY) || "null");
  } catch {
    return null;
  }
}

function readSupabaseStoredSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SUPABASE_STORAGE_KEY) || "null");
    return stored?.currentSession || stored?.session || null;
  } catch {
    return null;
  }
}

function clearSupabaseSessionBackup() {
  localStorage.removeItem(SUPABASE_SESSION_BACKUP_KEY);
}

function hasCachedLedgerData() {
  return Boolean(localStorage.getItem(CACHE_KEY));
}

function isLocalMode() {
  return !supabaseClient || session?.access_token === "offline";
}

function offlineSessionFromEmail(email = "offline@ledger.local") {
  return {
    access_token: "offline",
    user: {
      id: `offline-${String(email).toLowerCase()}`,
      email: String(email).toLowerCase()
    }
  };
}

function enterOfflineMode(message = "Supabase 连接失败，已进入本地模式") {
  const email = localStorage.getItem(LOCAL_SESSION_KEY) || localStorage.getItem(OFFLINE_EMAIL_KEY) || "offline@ledger.local";
  session = offlineSessionFromEmail(email);
  localStorage.setItem(OFFLINE_EMAIL_KEY, session.user.email);
  store.state = readCache();
  syncDraftDefaults();
  navigate("home");
  showToast(message);
}

function setBootDiagnostics(items) {
  const node = document.querySelector("#bootDiagnostics");
  if (!node) return;
  node.innerHTML = items.map((item) => `<div>${item}</div>`).join("");
}

function setSyncDiagnostics(items) {
  window.ledgerSyncDiagnostics = items;
  console.table(items);
  if (items.every((item) => item.status === "ok")) return;
  const failed = items.find((item) => item.status !== "ok");
  showToast(`云端请求异常：${failed.name} ${failed.error || failed.status}`);
}

async function timedSupabase(name, promise, ms = 10000) {
  const started = performance.now();
  try {
    const result = await withTimeout(promise, ms, `${name} 请求超时`);
    const elapsed = Math.round(performance.now() - started);
    if (result?.error) return { name, status: "error", ms: elapsed, error: result.error.message, result };
    return { name, status: "ok", ms: elapsed, result };
  } catch (error) {
    return { name, status: "timeout", ms: Math.round(performance.now() - started), error: translateError(error), result: { error } };
  }
}

async function restRequest(name, path, { method = "GET", body, single = false, prefer, ms = 10000 } = {}) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Prefer: prefer || (single ? "return=representation" : "return=representation")
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    const elapsed = Math.round(performance.now() - started);
    if (!response.ok) return { name, status: "error", ms: elapsed, error: data?.message || response.statusText, result: { error: data } };
    return { name, status: "ok", ms: elapsed, result: { data: single ? (Array.isArray(data) ? data[0] || null : data) : data } };
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    return { name, status: error.name === "AbortError" ? "timeout" : "error", ms: elapsed, error: error.name === "AbortError" ? `${name} 请求超时` : translateError(error), result: { error } };
  } finally {
    clearTimeout(timer);
  }
}

async function diagnoseSupabase() {
  if (!hasConfig) return ["配置：缺少 Supabase URL 或 anon key"];
  if (!window.supabase) return ["SDK：Supabase JS 未加载"];
  const headers = { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}` };
  const health = await withTimeout(
    fetch(`${config.SUPABASE_URL}/auth/v1/health`, { headers }).then((res) => res.status),
    3000,
    "Auth 健康检查超时"
  );
  const rest = await withTimeout(
    fetch(`${config.SUPABASE_URL}/rest/v1/profiles?select=user_id&limit=1`, { headers }).then((res) => res.status),
    3000,
    "数据库 REST 检查超时"
  );
  return [`Auth：${health}`, `数据库：${rest}`, `SDK：已加载`];
}

function readCache() {
  try {
    return { ...fallbackState, ...JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") };
  } catch {
    return fallbackState;
  }
}

function cleanProductionState(state) {
  if (!state) return state;
  return {
    ...state,
    transactions: (state.transactions || []).filter((tx) => !DEMO_TRANSACTION_IDS.has(tx.id)),
    accounts: (state.accounts || []).map((account) => ({ ...account, balance: 0 })),
    budgets: { total: 0, categories: {} },
    savingPlans: []
  };
}

function resetUserLedgerState(state) {
  if (!state) return state;
  return {
    ...state,
    transactions: [],
    accounts: (state.accounts || []).map((account) => ({ ...account, balance: 0 })),
    budgets: { total: 0, categories: {} },
    savingPlans: []
  };
}

function clearLegacyDemoBills() {
  const cleanState = (state) => {
    if (!state?.transactions) return state;
    return cleanProductionState(state);
  };
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached) localStorage.setItem(CACHE_KEY, JSON.stringify(cleanState(cached)));
    Object.keys(localStorage)
      .filter((key) => key.startsWith("ledger-pwa-local-data:"))
      .forEach((key) => {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        if (saved) localStorage.setItem(key, JSON.stringify(cleanState(saved)));
      });
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}

function localUserDataKey(email) {
  return `ledger-pwa-local-data:${String(email || "").toLowerCase()}`;
}

function readLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_AUTH_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalUsers(users) {
  localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(users));
}

function localSessionFromEmail(email) {
  return { user: { id: String(email).toLowerCase(), email: String(email).toLowerCase() }, local: true };
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedMoney(tx) {
  return `${tx.type === "income" ? "+" : "-"}${money(tx.amount)}`;
}

function selectedMonth() {
  return store.state.period?.month || "2024-06";
}

async function setSelectedMonth(month) {
  await store.setSelectedMonth(month);
}

function currentMonthTx() {
  return store.state.transactions.filter((tx) => tx.date?.startsWith(selectedMonth()));
}

function monthInfo(month = selectedMonth()) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, monthNumber, days: new Date(year, monthNumber, 0).getDate() };
}

function monthDisplay(month = selectedMonth()) {
  const { year, monthNumber } = monthInfo(month);
  return `${year}年${monthNumber}月`;
}

function monthRangeLabel(month = selectedMonth()) {
  const { monthNumber, days } = monthInfo(month);
  return `${monthNumber}月1日 - ${monthNumber}月${days}日`;
}

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function txCategory(tx) {
  return store.state.categories.find((item) => item.id === tx.categoryId) || { name: "未分类", color: "#009b8f", icon: "类" };
}

function txAccount(tx) {
  return store.state.accounts.find((item) => item.id === tx.accountId) || { name: "未知账户" };
}

function categoryTotals(type = "expense") {
  const txs = currentMonthTx().filter((tx) => tx.type === type);
  const total = txs.reduce((sum, tx) => sum + tx.amount, 0);
  return store.state.categories
    .filter((category) => category.type === type)
    .map((category) => {
      const amount = txs.filter((tx) => tx.categoryId === category.id).reduce((sum, tx) => sum + tx.amount, 0);
      return { ...category, amount, percent: total ? (amount / total) * 100 : 0 };
    })
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function totals() {
  const txs = currentMonthTx();
  const income = txs.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expense = txs.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  return { income, expense, balance: income - expense, netAssets: store.state.accounts.reduce((sum, item) => sum + item.balance, 0) };
}

function compareTxDesc(a, b) {
  return `${b.date} ${b.time || "00:00"}`.localeCompare(`${a.date} ${a.time || "00:00"}`);
}

function formatDate(date) {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function formatDateTime(tx) {
  return `${formatDate(tx.date)} ${tx.time || "09:41"}`;
}

function currentTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function showToast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("show");
  setTimeout(() => toastNode.classList.remove("show"), 1800);
}

function translateError(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "邮箱或密码不正确";
  if (lower.includes("email not confirmed")) return "邮箱还没有验证，请先去邮箱确认";
  if (lower.includes("user already registered") || lower.includes("already registered")) return "这个邮箱已经注册过";
  if (lower.includes("password") && lower.includes("6")) return "密码至少需要 6 位";
  if (lower.includes("invalid email")) return "邮箱格式不正确";
  if (lower.includes("rate limit")) return "操作太频繁，请稍后再试";
  if (lower.includes("network") || lower.includes("failed to fetch")) return "网络连接失败，请检查网络后重试";
  return message || "操作失败";
}

function numberValue(selector) {
  return Number(document.querySelector(selector)?.value || 0);
}

function textValue(selector) {
  return (document.querySelector(selector)?.value || "").trim();
}

function syncDraftDefaults() {
  draft.accountId = draft.accountId || store.state.accounts.find((item) => item.isDefault)?.id || store.state.accounts[0]?.id || "";
  const categories = store.state.categories.filter((item) => item.type === draft.type);
  draft.categoryId = categories.some((item) => item.id === draft.categoryId) ? draft.categoryId : categories[0]?.id || "";
}

function statusBar() {
  return `
    <div class="status-bar">
      <div>9:41</div>
      <div class="status-icons">
        <div class="signal"><i></i><i></i><i></i><i></i></div>
        <div class="wifi"></div>
        <div class="battery"></div>
      </div>
    </div>
  `;
}

function shell(content, activeTab, options = {}) {
  return `
    <section class="screen ${options.screenClass || ""} ${options.bottomAction ? "has-bottom-action" : ""}">
      ${content}
    </section>
    ${options.bottomAction ? `<div class="bottom-action ${options.bottomActionClass || ""}">${options.bottomAction}</div>` : ""}
    ${options.hideNav ? "" : bottomNav(activeTab)}
  `;
}

function bottomNav(activeTab) {
  return `
    <nav class="bottom-nav" aria-label="底部导航">
      ${navTabs.map((tab) => `
        <button class="nav-item ${activeTab === tab.id ? "active" : ""}" data-route="${tab.id}">
          <span class="nav-icon">${tab.icon}</span>
          <span>${tab.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function pageHead(title, subtitle = "", action = "", options = {}) {
  const subtitleNode = subtitle
    ? options.subtitleRoute
      ? `<button class="sub-title subtitle-button" data-route="${options.subtitleRoute}" ${options.subtitleReturnTo ? `data-return-to="${options.subtitleReturnTo}"` : ""}>${subtitle}<span class="chevron-down"></span></button>`
      : `<div class="sub-title">${subtitle}<span class="chevron-down"></span></div>`
    : "";
  return `
    <header class="page-head">
      <div class="title-stack">
        <h1 class="page-title">${title}</h1>
        ${subtitleNode}
      </div>
      ${action}
    </header>
  `;
}

function backHead(title) {
  return `
    <div class="top-title">
      <button class="back-button" data-back aria-label="返回">‹</button>
      <h1>${title}</h1>
      <span></span>
    </div>
  `;
}

function walletArt() {
  return `<div class="wallet-art" aria-hidden="true"><div class="wallet-card"></div><div class="wallet"></div><div class="coin">¥</div></div>`;
}

function renderBoot() {
  return shell(`
    <section class="card" style="margin-top:32px">
      <h1 class="section-title">正在加载</h1>
      <p class="muted">正在连接 Supabase...</p>
      <div id="bootDiagnostics" class="muted" style="margin-top:12px;font-size:13px"></div>
    </section>
  `, "", { hideNav: true });
}

function renderConfigMissing() {
  return shell(`
    <section class="card" style="margin-top:32px">
      <h1 class="section-title">需要配置 Supabase</h1>
      <p class="muted">请复制 <code>supabase-config.example.js</code> 为 <code>supabase-config.js</code>，填写项目 URL 和 anon key。</p>
      <p class="muted">然后在 Supabase SQL Editor 执行 <code>supabase-schema.sql</code>。</p>
      <button class="primary-button" data-route="login" style="margin-top:16px">先用本地账号体验</button>
    </section>
  `, "", { hideNav: true });
}

function renderLogin() {
  return shell(`
    <section class="card" style="margin-top:32px">
      <h1 class="section-title">登录轻账本</h1>
      <div class="field"><label>邮箱</label><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" /></div>
      <div class="field"><label>密码</label><input id="authPassword" type="password" autocomplete="current-password" placeholder="至少 6 位" /></div>
      <div class="grid-2">
        <button class="primary-button" data-auth-login>登录</button>
        <button class="secondary-button" style="height:54px" data-auth-signup>注册</button>
      </div>
      <button class="secondary-button" data-auth-offline style="width:100%;height:46px;margin-top:12px">本地模式继续使用</button>
      <p class="muted">${supabaseClient ? "注册后如果 Supabase 开启邮箱验证，请先到邮箱确认，再回来登录。" : "当前为本地演示账号，注册和数据只保存在这台设备的浏览器里。"}</p>
    </section>
  `, "", { hideNav: true });
}

function categoryList(limit, ranked = false) {
  const items = categoryTotals("expense").slice(0, limit || 99);
  if (!items.length) return `<div class="empty">当前月份暂无支出分类数据</div>`;
  return `<div class="bar-list">${items.map((item, index) => `
    <button class="category-row" data-category-detail="${item.id}" style="background:transparent;padding:0;text-align:left">
      ${ranked ? `<span class="rank-badge">${index + 1}</span>` : `<span class="icon-bubble" style="background:${item.color}">${item.icon}</span>`}
      <span>
        <span class="category-name">${ranked ? `<span class="icon-bubble" style="width:28px;height:28px;display:inline-grid;margin-right:8px;background:${item.color};font-size:15px">${item.icon}</span>` : ""}${item.name}</span>
        <span class="progress-track"><span class="progress-fill" style="width:${item.percent}%;background:${item.color}"></span></span>
      </span>
      <span class="muted">${item.percent.toFixed(1)}%</span>
      <span class="amount-text expense">${money(item.amount)}</span>
    </button>
  `).join("")}</div>`;
}

function txRows(txs) {
  if (!txs.length) return `<div class="empty">暂无记录</div>`;
  return `<div class="tx-list">${txs.map((tx) => {
    const category = txCategory(tx);
    return `
      <button class="tx-row tx-button" data-transaction-detail="${tx.id}">
        <span class="icon-bubble" style="background:${category.color}">${category.icon}</span>
        <span><div class="tx-title">${tx.title}</div><div class="tx-meta">${formatDateTime(tx)} · ${category.name}</div></span>
        <strong class="${tx.type === "income" ? "income" : "expense"}">${signedMoney(tx)}</strong>
      </button>
    `;
  }).join("")}</div>`;
}

function groupedTxRows(txs) {
  if (!txs.length) return `<div class="empty">暂无记录</div>`;
  const groups = txs.reduce((map, tx) => {
    if (!map[tx.date]) map[tx.date] = [];
    map[tx.date].push(tx);
    return map;
  }, {});
  return Object.entries(groups).map(([date, items]) => {
    const income = items.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
    const expense = items.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
    return `<div style="margin-bottom:18px"><div class="row-between" style="margin-bottom:10px"><strong>${formatDate(date)}</strong><span class="muted">收入 ${money(income)} · 支出 ${money(expense)}</span></div>${txRows(items)}</div>`;
  }).join("");
}

function renderHome() {
  const total = totals();
  const recent = [...currentMonthTx()].sort(compareTxDesc).slice(0, 3);
  return shell(`
    ${pageHead("本月总览", monthRangeLabel(), `<button class="pill-button" data-route="calendar">▣ 日历视图</button>`, { subtitleRoute: "period", subtitleReturnTo: "home" })}
    <section class="card money-hero">${walletArt()}<div class="balance-label">结余(元) ◎</div><div class="balance-main">${money(total.balance)}</div><div class="summary-box"><div><div class="metric-title">收入(元)</div><div class="metric-value income">${money(total.income)}</div><div class="muted">较上月 +15.6% ↗</div></div><div class="divider"></div><div><div class="metric-title">支出(元)</div><div class="metric-value expense">${money(total.expense)}</div><div class="muted">较上月 -8.3% ↘</div></div></div></section>
    <section class="card"><div class="card-head"><h2 class="section-title">支出分类TOP5</h2><button class="link-button" data-route="categoriesAll">查看全部 ›</button></div>${categoryList(5)}</section>
    <section class="card"><div class="card-head"><h2 class="section-title">当月收支</h2><button class="link-button" data-route="transactions">查看全部 ›</button></div>${txRows(recent)}</section>
  `, "home");
}

function renderLedger() {
  const total = totals();
  const usedPercent = store.state.budgets.total ? Math.min(100, (total.expense / store.state.budgets.total) * 100) : 0;
  return shell(`
    ${pageHead("账本资产")}
    <section class="card"><div class="card-head"><h2 class="section-title">预算管理</h2><button class="link-button income" data-route="budget">预算设置 ›</button></div><div class="row-between"><div><div class="muted">本月已用</div><div class="metric-value expense">${usedPercent.toFixed(1)}%</div></div><div style="text-align:right"><div class="muted">剩余预算</div><div class="metric-value">${money(store.state.budgets.total - total.expense)}</div></div></div><div class="progress-track" style="height:10px;margin:16px 0"><span class="progress-fill" style="width:${usedPercent}%;background:var(--expense)"></span></div><div class="muted">总预算 ${money(store.state.budgets.total)} · 已支出 ${money(total.expense)}</div></section>
    <section class="card"><div class="card-head"><h2 class="section-title">账户资产</h2><button class="link-button income" data-route="accounts">账户管理 ›</button></div><div class="card" style="margin:0 0 12px;background:linear-gradient(145deg,var(--primary-soft),#fff);box-shadow:none">${walletArt()}<div class="metric-title income">净资产</div><div class="balance-main income" style="font-size:34px;margin:8px 0 0">${money(total.netAssets)}</div></div><div class="account-grid">${store.state.accounts.map((account) => `<div class="asset-card"><div class="row"><span class="icon-bubble" style="background:${account.color}">${account.icon}</span><div><strong>${account.name}</strong><div>${money(account.balance)}</div>${account.isDefault ? `<span class="tag">默认账户</span>` : ""}</div></div></div>`).join("")}</div></section>
    <section class="card"><div class="card-head"><h2 class="section-title">存钱计划</h2><button class="link-button" data-route="savingPlans">查看全部 ›</button></div>${savingPlanList(2)}</section>
  `, "ledger");
}

function savingPlanList(limit) {
  const plans = store.state.savingPlans.slice(0, limit || 99);
  if (!plans.length) return `<div class="empty">暂无存钱计划</div>`;
  return `<div class="bar-list">${plans.map((plan) => {
    const percent = plan.target ? Math.min(100, (plan.saved / plan.target) * 100) : 0;
    return `<button class="row" data-edit-plan="${plan.id}" style="align-items:flex-start;width:100%;background:transparent;text-align:left;padding:0"><span class="icon-bubble soft" style="font-size:18px">${plan.icon}</span><div style="flex:1;min-width:0"><div class="row-between"><strong>${plan.name}</strong><strong class="income">${percent.toFixed(percent % 1 ? 1 : 0)}%</strong></div><div class="muted">目标日 ${plan.dueDate}</div><div class="progress-track"><span class="progress-fill" style="width:${percent}%"></span></div><div class="muted">${money(plan.saved)} / ${money(plan.target)}</div></div></button>`;
  }).join("")}</div>`;
}

function renderStats() {
  const total = totals();
  const mode = route.params.mode || "day";
  const expenseTxs = currentMonthTx().filter((tx) => tx.type === "expense");
  const maxExpense = expenseTxs.length ? Math.max(...expenseTxs.map((tx) => tx.amount)) : 0;
  const categories = categoryTotals("expense");
  return shell(`
    ${pageHead("统计分析", monthDisplay(), "", { subtitleRoute: "period", subtitleReturnTo: "stats" })}
    <section class="card"><h2 class="section-title">本月总览</h2><div class="summary-box"><div><div class="metric-title">日均支出 ⓘ</div><div class="metric-value expense">${money(total.expense / monthInfo().days)}</div></div><div class="divider"></div><div><div class="metric-title">最大单笔 ⓘ</div><div class="metric-value">${money(maxExpense)}</div></div></div></section>
    <section class="card"><h2 class="section-title">支出分类占比</h2>${categories.length ? `<div class="donut-wrap"><div class="donut"></div><div class="legend">${categories.slice(0, 5).map((item) => `<div class="row-between"><span class="row"><span class="icon-bubble" style="width:28px;height:28px;background:${item.color};font-size:14px">${item.icon}</span>${item.name}</span><span class="muted">${item.percent.toFixed(1)}%</span></div>`).join("")}</div></div>` : `<div class="empty">当前月份暂无支出分类数据</div>`}</section>
    <section class="card"><div class="card-head"><h2 class="section-title">支出趋势</h2><div class="mini-tabs">${[["day", "日"], ["week", "周"], ["month", "月"]].map(([value, label]) => `<button class="${mode === value ? "active" : ""}" data-stats-mode="${value}">${label}</button>`).join("")}</div></div>${trendChart(mode)}</section>
    <section class="card"><h2 class="section-title">支出分类TOP5</h2>${categoryList(5, true)}</section>
  `, "stats");
}

function trendChart(mode) {
  const month = selectedMonth();
  const { days } = monthInfo(month);
  let series;
  if (mode === "week") {
    series = Array.from({ length: Math.ceil(days / 7) }, (_, index) => {
      const start = index * 7 + 1;
      const end = Math.min(days, start + 6);
      const value = store.state.transactions.filter((tx) => tx.type === "expense" && tx.date.startsWith(month) && Number(tx.date.slice(8, 10)) >= start && Number(tx.date.slice(8, 10)) <= end).reduce((sum, tx) => sum + tx.amount, 0);
      return { label: `${start}-${end}`, value };
    });
  } else if (mode === "month") {
    series = Array.from({ length: 6 }, (_, index) => {
      const item = shiftMonth(month, index - 5);
      const value = store.state.transactions.filter((tx) => tx.type === "expense" && tx.date.startsWith(item)).reduce((sum, tx) => sum + tx.amount, 0);
      return { label: monthDisplay(item).replace("年", "/").replace("月", ""), value };
    });
  } else {
    series = Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const value = store.state.transactions.filter((tx) => tx.type === "expense" && tx.date === date).reduce((sum, tx) => sum + tx.amount, 0);
      return { label: `${monthInfo(month).monthNumber}/${day}`, value };
    });
  }
  const max = Math.max(...series.map((item) => item.value), 0);
  if (!max) return `<div class="chart empty-chart">当前范围暂无支出趋势数据</div>`;
  const points = series.map((item, index) => {
    const x = 20 + (index / Math.max(1, series.length - 1)) * 300;
    const y = 155 - (item.value / max) * 125;
    return `${x},${y}`;
  }).join(" ");
  return `<div class="chart"><svg viewBox="0 0 330 180" role="img" aria-label="支出趋势"><g stroke="#dbe2e8" stroke-dasharray="4 5"><line x1="20" x2="320" y1="35" y2="35"/><line x1="20" x2="320" y1="75" y2="75"/><line x1="20" x2="320" y1="115" y2="115"/><line x1="20" x2="320" y1="155" y2="155"/></g><polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
}

function renderMine() {
  const { profile } = store.state;
  const isCloud = syncStatus.mode === "cloud";
  const statusTitle = isCloud ? "云端已同步" : syncStatus.mode === "error" ? "云端同步异常" : "本地缓存模式";
  const statusDetail = isCloud
    ? `${session?.user?.email || ""}${syncStatus.lastSyncedAt ? ` · ${syncStatus.lastSyncedAt}` : ""}`
    : syncStatus.mode === "error"
      ? syncStatus.error
      : "当前显示的是本机缓存数据";
  const statusIcon = isCloud ? "云" : syncStatus.mode === "error" ? "!" : "本";
  return shell(`
    <header class="page-head"><h1 style="margin:0;font-size:30px;font-weight:950">我的</h1></header>
    <button class="profile-head" data-route="profile" style="width:100%;background:transparent;text-align:left"><span class="avatar">${profile.avatar}</span><span><strong style="font-size:20px">${profile.name}</strong><div class="muted" style="margin-top:8px">${profile.bio}</div></span><span class="muted" style="font-size:30px">›</span></button>
    <section class="card"><h2 class="section-title">同步状态</h2><div class="card" style="margin:0;background:linear-gradient(145deg,var(--primary-soft),#fff);box-shadow:none"><div class="row"><span class="icon-bubble soft">${statusIcon}</span><span><strong class="${isCloud ? "income" : "muted"}">${statusTitle}</strong><div class="muted" style="margin-top:8px">${statusDetail}</div></span></div></div></section>
    <section class="card"><h2 class="section-title">个人设置</h2>${settingRow("类", "分类管理", "categoriesManage")}${settingRow("账", "账户管理", "accounts")}${settingRow("导", "数据导出", "export")}${settingRow("题", "主题设置", "theme")}<button class="setting-row" data-auth-logout style="width:100%;background:transparent;text-align:left"><span class="icon-bubble soft">退</span><strong>退出登录</strong><span class="muted" style="font-size:28px">›</span></button></section>
  `, "mine");
}

function settingRow(icon, label, target) {
  return `<button class="setting-row" data-route="${target}" style="width:100%;background:transparent;text-align:left"><span class="icon-bubble soft">${icon}</span><strong>${label}</strong><span class="muted" style="font-size:28px">›</span></button>`;
}

function renderEntry() {
  syncDraftDefaults();
  const categories = store.state.categories.filter((item) => item.type === draft.type);
  return shell(`
    ${backHead("记一笔")}
    <section class="card entry-form-card"><div class="segmented"><button class="${draft.type === "expense" ? "active" : ""}" data-entry-type="expense">支出</button><button class="${draft.type === "income" ? "active" : ""}" data-entry-type="income">收入</button></div><div class="entry-amount-block"><label>金额</label><div class="amount-input"><span>¥</span><input id="entryAmount" inputmode="decimal" placeholder="0.00" /></div></div><div class="entry-date-time"><div class="field"><label>日期</label><input id="entryDate" type="date" value="${selectedMonth()}-${String(monthInfo().days).padStart(2, "0")}" /></div><div class="field"><label>时间</label><input id="entryTime" type="time" value="${currentTimeValue()}" /></div></div><div class="field entry-note-field"><label>备注</label><input id="entryNote" placeholder="写点什么..." /></div></section>
    <section class="card payment-card"><h2 class="section-title">支付渠道</h2><div class="grid-2">${store.state.accounts.map((account) => `<button class="select-card ${account.id === draft.accountId ? "active" : ""}" data-select-account="${account.id}"><span class="icon-bubble" style="background:${account.color}">${account.icon}</span><span><strong>${account.name}</strong><br><span class="muted">余额 ${account.balance.toFixed(2)}</span></span>${account.id === draft.accountId ? `<span class="check-dot">✓</span>` : ""}</button>`).join("")}</div></section>
    <section class="card"><h2 class="section-title">选择分类</h2><div class="grid-3">${categories.map((category) => `<button class="chip-card ${category.id === draft.categoryId ? "active" : ""}" data-select-category="${category.id}"><span class="small-symbol" style="color:${category.color}">${category.icon}</span><span>${category.name}</span></button>`).join("")}</div></section>
  `, "", { hideNav: true, screenClass: "entry-screen", bottomAction: `<button class="primary-button" data-save-entry>保存</button>` });
}

function renderCalendar() {
  const month = selectedMonth();
  const { year, monthNumber, days: daysInMonth } = monthInfo(month);
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const leading = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const selected = Math.min(route.params.day || Math.min(20, daysInMonth), daysInMonth);
  const txs = store.state.transactions.filter((tx) => tx.date === `${month}-${String(selected).padStart(2, "0")}`);
  return detailShell("日历视图", `<section class="card"><div class="calendar-head"><button class="secondary-button" data-month-nav="-12">«</button><button class="secondary-button" data-month-nav="-1">‹</button><h2 class="section-title" style="margin:0">${monthDisplay(month)}</h2><button class="secondary-button" data-month-nav="1">›</button><button class="secondary-button" data-month-nav="12">»</button></div><div class="calendar-grid">${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<div class="weekday">${day}</div>`).join("")}${Array.from({ length: leading }, () => `<div></div>`).join("")}${days.map((day) => { const date = `${month}-${String(day).padStart(2, "0")}`; const amount = store.state.transactions.filter((tx) => tx.date === date).reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0); return `<button class="day-cell ${selected === day ? "active" : ""}" data-calendar-day="${day}"><div class="day-num">${day}</div>${amount ? `<div class="day-sum">${amount > 0 ? "+" : ""}${Math.round(amount)}</div>` : ""}</button>`; }).join("")}</div></section><section class="card"><h2 class="section-title">${monthNumber}月${selected}日流水</h2>${txRows(txs)}</section>`);
}

function renderPeriod() {
  const month = route.params.month || selectedMonth();
  const expanded = route.params.expanded === "1";
  const returnTo = route.params.returnTo || "home";
  const months = Array.from({ length: 48 }, (_, index) => shiftMonth("2023-01", index));
  return detailShell("选择月份", `<section class="card"><button class="picker-summary" data-toggle-month-picker aria-expanded="${expanded}"><span>统计月份</span><strong data-selected-month="${month}">${monthDisplay(month)}</strong><i class="${expanded ? "up" : ""}" aria-hidden="true"></i></button>${expanded ? `<div class="month-panel">${months.map((item) => `<button class="month-row ${item === month ? "active" : ""}" data-quick-month="${item}"><span>${monthDisplay(item)}</span>${item === month ? "<b>已选</b>" : ""}</button>`).join("")}</div>` : ""}</section>`, { bottomAction: `<button class="primary-button" data-save-period data-return-to="${returnTo}">应用月份</button>` });
}

function renderTransactions() {
  const type = route.params.type || "all";
  const query = route.params.query || "";
  const category = route.params.category || "all";
  let txs = [...currentMonthTx()].sort(compareTxDesc);
  if (type !== "all") txs = txs.filter((tx) => tx.type === type);
  if (category !== "all") txs = txs.filter((tx) => tx.categoryId === category);
  if (query) txs = txs.filter((tx) => `${tx.title}${tx.note}`.includes(query));
  return detailShell(`${monthDisplay()}收支`, `<section class="card filter-card"><input class="search-input" id="searchTx" value="${query}" placeholder="搜索流水" /><div class="filter-segment">${[["all", "全部"], ["expense", "支出"], ["income", "收入"]].map(([value, label]) => `<button class="${type === value ? "active" : ""}" data-filter-type="${value}">${label}</button>`).join("")}</div><div class="category-scroll"><button class="filter-chip ${category === "all" ? "active" : ""}" data-filter-category="all">全部分类</button>${store.state.categories.filter((item) => type === "all" || item.type === type).map((item) => `<button class="filter-chip ${category === item.id ? "active" : ""}" data-filter-category="${item.id}"><span style="background:${item.color}">${item.icon}</span>${item.name}</button>`).join("")}</div></section><section class="card">${groupedTxRows(txs)}</section>`);
}

function renderTransactionDetail() {
  const tx = store.state.transactions.find((item) => item.id === route.params.id);
  if (!tx) return detailShell("记录详情", `<section class="card"><div class="empty">这条记录不存在或已删除</div></section>`);
  const category = txCategory(tx);
  const account = txAccount(tx);
  return detailShell(
    "记录详情",
    `<section class="card"><div class="row" style="align-items:flex-start"><span class="icon-bubble" style="background:${category.color || "var(--primary)"}">${category.icon || "记"}</span><div style="flex:1;min-width:0"><div class="muted">${tx.type === "income" ? "收入" : "支出"}</div><div class="balance-main ${tx.type === "income" ? "income" : "expense"}" style="font-size:34px;margin:8px 0">${signedMoney(tx)}</div><h2 class="section-title" style="margin-top:4px">${tx.title}</h2></div></div></section><section class="card detail-card"><div class="detail-row"><span class="icon-bubble soft">类</span><strong>分类</strong><span class="detail-value">${category.name || "-"}</span></div><div class="detail-row"><span class="icon-bubble soft">账</span><strong>账户</strong><span class="detail-value">${account.name || "-"}</span></div><div class="detail-row"><span class="icon-bubble soft">时</span><strong>时间</strong><span class="detail-value">${formatDateTime(tx)}</span></div><div class="detail-row"><span class="icon-bubble soft">注</span><strong>备注</strong><span class="detail-value">${tx.note || "无"}</span></div></section>`,
    { bottomAction: `<button class="danger-button" data-delete-transaction="${tx.id}">删除记录</button>` }
  );
}

function renderCategoriesAll() {
  return detailShell("支出分类", `<section class="card">${categoryList(99, true)}</section>`);
}

function renderCategoryDetail() {
  const category = store.state.categories.find((item) => item.id === route.params.id) || store.state.categories[0];
  const txs = store.state.transactions.filter((tx) => tx.categoryId === category.id);
  const amount = txs.reduce((sum, tx) => sum + tx.amount, 0);
  return detailShell(category.name, `<section class="card"><div class="row"><span class="icon-bubble" style="background:${category.color}">${category.icon}</span><div><div class="muted">本月合计</div><div class="balance-main expense" style="font-size:34px;margin:6px 0">${money(amount)}</div></div></div></section><section class="card"><h2 class="section-title">分类流水</h2>${txRows(txs)}</section>`);
}

function renderBudget() {
  return detailShell("预算设置", `<section class="card"><div class="field"><label>本月总预算</label><input id="totalBudget" inputmode="decimal" value="${store.state.budgets.total}" /></div>${store.state.categories.filter((item) => item.type === "expense").map((category) => `<div class="field"><label>${category.icon} ${category.name}</label><input class="categoryBudget" data-id="${category.id}" inputmode="decimal" value="${store.state.budgets.categories[category.id] || 0}" /></div>`).join("")}</section>`, { bottomAction: `<button class="primary-button" data-save-budget>保存预算</button>` });
}

function renderAccounts() {
  return detailShell("账户管理", `<section class="card"><div class="card-head"><h2 class="section-title">账户列表</h2><button class="secondary-button" data-add-account>新增</button></div><div class="bar-list">${store.state.accounts.map((account) => `<button class="select-card" data-edit-account="${account.id}"><span class="icon-bubble" style="background:${account.color}">${account.icon}</span><span><strong>${account.name}</strong><br><span class="muted">${money(account.balance)} ${account.isDefault ? "· 默认" : ""}</span></span></button>`).join("")}</div></section>${accountForm(route.params.edit)}`, { bottomAction: `<button class="primary-button" data-save-account="${route.params.edit || ""}">保存账户</button>` });
}

function accountForm(id) {
  const account = store.state.accounts.find((item) => item.id === id) || { id: "", name: "", balance: 0, color: "#009b8f", icon: "账", isDefault: false };
  return `<section class="card"><h2 class="section-title">${id ? "编辑账户" : "新增账户"}</h2><div class="field"><label>账户名称</label><input id="accountName" value="${account.name}" placeholder="例如 招商银行卡" /></div><div class="field"><label>余额</label><input id="accountBalance" inputmode="decimal" value="${account.balance}" /></div><div class="field"><label>图标</label><input id="accountIcon" value="${account.icon}" /></div><div class="field"><label>颜色</label><input id="accountColor" value="${account.color}" /></div><label class="row" style="margin-bottom:16px"><input id="accountDefault" type="checkbox" ${account.isDefault ? "checked" : ""}/> 设为默认账户</label></section>`;
}

function renderSavingPlans() {
  const plan = store.state.savingPlans.find((item) => item.id === route.params.edit) || { id: "", name: "", icon: "标", target: 0, saved: 0, dueDate: "2026-12-31" };
  return detailShell("存钱计划", `<section class="card"><div class="card-head"><h2 class="section-title">计划列表</h2><button class="secondary-button" data-route="savingPlans">新增</button></div>${savingPlanList(99)}</section><section class="card"><h2 class="section-title">${route.params.edit ? "编辑计划" : "新增计划"}</h2><div class="field"><label>计划名称</label><input id="planName" value="${plan.name}" placeholder="例如 旅行基金" /></div><div class="field"><label>图标</label><input id="planIcon" value="${plan.icon}" /></div><div class="field"><label>目标金额</label><input id="planTarget" inputmode="decimal" value="${plan.target}" /></div><div class="field"><label>已存金额</label><input id="planSaved" inputmode="decimal" value="${plan.saved}" /></div><div class="field"><label>目标日</label><input id="planDue" type="date" value="${plan.dueDate}" /></div></section>`, { bottomAction: `<button class="primary-button" data-save-plan="${plan.id}">保存计划</button>` });
}

function renderCategoriesManage() {
  const type = route.params.type || "expense";
  const category = store.state.categories.find((item) => item.id === route.params.edit) || { id: "", type, name: "", color: type === "expense" ? "#ff9d1b" : "#009b8f", icon: type === "expense" ? "类" : "收" };
  return detailShell("分类管理", `<section class="card"><div class="segmented"><button class="${type === "expense" ? "active" : ""}" data-category-tab="expense">支出</button><button class="${type === "income" ? "active" : ""}" data-category-tab="income">收入</button></div><div class="bar-list" style="margin-top:14px">${store.state.categories.filter((item) => item.type === type).map((item) => `<button class="select-card" data-edit-category="${item.id}"><span class="icon-bubble" style="background:${item.color}">${item.icon}</span><strong>${item.name}</strong></button>`).join("")}</div></section><section class="card"><h2 class="section-title">${category.id ? "编辑分类" : "新增分类"}</h2><div class="field"><label>分类名称</label><input id="categoryName" value="${category.name}" /></div><div class="field"><label>图标</label><input id="categoryIcon" value="${category.icon}" /></div><div class="field"><label>颜色</label><input id="categoryColor" value="${category.color}" /></div></section>`, { bottomAction: category.id ? `<button class="primary-button" data-save-category="${category.id}">保存分类</button><button class="secondary-button" data-delete-category="${category.id}">删除</button>` : `<button class="primary-button" data-save-category="">保存分类</button>`, bottomActionClass: category.id ? "split" : "" });
}

function renderExport() {
  return detailShell("数据导出", `<section class="card"><h2 class="section-title">导出范围</h2><div class="field"><label>开始日期</label><input id="exportStart" type="date" value="${selectedMonth()}-01" /></div><div class="field"><label>结束日期</label><input id="exportEnd" type="date" value="${selectedMonth()}-${String(monthInfo().days).padStart(2, "0")}" /></div><p class="muted">会在浏览器中生成当前账号数据 CSV。</p></section>`, { bottomAction: `<button class="primary-button" data-export-csv>导出 CSV</button>` });
}

function renderTheme() {
  const themes = [{ id: "teal", name: "青绿", color: "#009b8f" }, { id: "blue", name: "蓝色", color: "#3478f6" }, { id: "pink", name: "粉色", color: "#ec5b86" }];
  return detailShell("主题设置", `<section class="card"><div class="theme-row">${themes.map((theme) => `<button class="theme-card ${store.state.theme === theme.id ? "active" : ""}" data-theme="${theme.id}"><span class="swatch" style="background:${theme.color}"></span><strong>${theme.name}</strong></button>`).join("")}</div></section>`);
}

function renderProfile() {
  const { profile } = store.state;
  return detailShell("个人资料", `<section class="card"><div class="field"><label>头像</label><input id="profileAvatar" value="${profile.avatar}" /></div><div class="field"><label>昵称</label><input id="profileName" value="${profile.name}" /></div><div class="field"><label>签名</label><textarea id="profileBio" rows="3">${profile.bio}</textarea></div></section>`, { bottomAction: `<button class="primary-button" data-save-profile>保存资料</button>` });
}

function detailShell(title, body, options = {}) {
  return shell(`${backHead(title)}${body}`, "", { hideNav: true, ...options });
}

const renderers = {
  boot: renderBoot,
  configMissing: renderConfigMissing,
  login: renderLogin,
  home: renderHome,
  ledger: renderLedger,
  stats: renderStats,
  mine: renderMine,
  entry: renderEntry,
  calendar: renderCalendar,
  period: renderPeriod,
  transactions: renderTransactions,
  transactionDetail: renderTransactionDetail,
  categoriesAll: renderCategoriesAll,
  categoryDetail: renderCategoryDetail,
  budget: renderBudget,
  accounts: renderAccounts,
  savingPlans: renderSavingPlans,
  categoriesManage: renderCategoriesManage,
  export: renderExport,
  theme: renderTheme,
  profile: renderProfile
};

function navigate(name, params = {}) {
  route = { name, params };
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function goBack() {
  if (route.name === "period") return navigate(route.params.returnTo || "home");
  if (route.name === "transactionDetail") return navigate("transactions");
  if (["budget", "accounts", "savingPlans"].includes(route.name)) return navigate("ledger");
  if (["categoriesManage", "export", "theme", "profile"].includes(route.name)) return navigate("mine");
  return navigate("home");
}

function applyTheme() {
  document.body.classList.toggle("theme-blue", store.state.theme === "blue");
  document.body.classList.toggle("theme-pink", store.state.theme === "pink");
}

function render() {
  applyTheme();
  app.innerHTML = (renderers[route.name] || renderHome)();
}

async function safeAction(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    showToast(translateError(error));
  }
}

function bindEvents() {
  app.addEventListener("click", (event) => {
    safeAction(async () => {
      const categoryDetail = event.target.closest("[data-category-detail]");
      if (categoryDetail) return navigate("categoryDetail", { id: categoryDetail.dataset.categoryDetail });
      const transactionDetail = event.target.closest("[data-transaction-detail]");
      if (transactionDetail) return navigate("transactionDetail", { id: transactionDetail.dataset.transactionDetail });
      const routeButton = event.target.closest("[data-route]");
      if (routeButton) {
        const params = {};
        if (routeButton.dataset.returnTo) params.returnTo = routeButton.dataset.returnTo;
        return navigate(routeButton.dataset.route, params);
      }
      if (event.target.closest("[data-back]")) return goBack();
      const dayButton = event.target.closest("[data-calendar-day]");
      if (dayButton) return navigate("calendar", { day: Number(dayButton.dataset.calendarDay) });
      const monthNav = event.target.closest("[data-month-nav]");
      if (monthNav) {
        await setSelectedMonth(shiftMonth(selectedMonth(), Number(monthNav.dataset.monthNav)));
        return navigate("calendar");
      }
      if (event.target.closest("[data-toggle-month-picker]")) return navigate("period", { expanded: route.params.expanded === "1" ? "0" : "1", month: route.params.month || selectedMonth(), returnTo: route.params.returnTo || "home" });
      const quickMonth = event.target.closest("[data-quick-month]");
      if (quickMonth) return navigate("period", { expanded: "0", month: quickMonth.dataset.quickMonth, returnTo: route.params.returnTo || "home" });
      const entryType = event.target.closest("[data-entry-type]");
      if (entryType) {
        draft.type = entryType.dataset.entryType;
        draft.categoryId = store.state.categories.find((item) => item.type === draft.type)?.id || "";
        return render();
      }
      const accountSelect = event.target.closest("[data-select-account]");
      if (accountSelect) {
        draft.accountId = accountSelect.dataset.selectAccount;
        return render();
      }
      const categorySelect = event.target.closest("[data-select-category]");
      if (categorySelect) {
        draft.categoryId = categorySelect.dataset.selectCategory;
        return render();
      }
      if (event.target.closest("[data-auth-login]")) return authLogin(false);
      if (event.target.closest("[data-auth-signup]")) return authLogin(true);
      if (event.target.closest("[data-auth-offline]")) return authOffline();
      if (event.target.closest("[data-auth-logout]")) return authLogout();
      const deleteTx = event.target.closest("[data-delete-transaction]");
      if (deleteTx) return deleteTransaction(deleteTx.dataset.deleteTransaction);
      if (event.target.closest("[data-save-entry]")) return saveEntry();
      if (event.target.closest("[data-save-budget]")) return saveBudget();
      const savePeriodButton = event.target.closest("[data-save-period]");
      if (savePeriodButton) return savePeriod(savePeriodButton.dataset.returnTo);
      const editAccount = event.target.closest("[data-edit-account]");
      if (editAccount) return navigate("accounts", { edit: editAccount.dataset.editAccount });
      if (event.target.closest("[data-add-account]")) return navigate("accounts");
      const saveAccount = event.target.closest("[data-save-account]");
      if (saveAccount) return saveAccountData(saveAccount.dataset.saveAccount);
      const savePlan = event.target.closest("[data-save-plan]");
      if (savePlan) return savePlanData(savePlan.dataset.savePlan);
      const editPlan = event.target.closest("[data-edit-plan]");
      if (editPlan) return navigate("savingPlans", { edit: editPlan.dataset.editPlan });
      const categoryTab = event.target.closest("[data-category-tab]");
      if (categoryTab) return navigate("categoriesManage", { type: categoryTab.dataset.categoryTab });
      const editCategory = event.target.closest("[data-edit-category]");
      if (editCategory) {
        const category = store.state.categories.find((item) => item.id === editCategory.dataset.editCategory);
        return navigate("categoriesManage", { type: category.type, edit: category.id });
      }
      const saveCategory = event.target.closest("[data-save-category]");
      if (saveCategory) return saveCategoryData(saveCategory.dataset.saveCategory);
      const deleteCategory = event.target.closest("[data-delete-category]");
      if (deleteCategory) return deleteCategoryData(deleteCategory.dataset.deleteCategory);
      if (event.target.closest("[data-export-csv]")) return exportCsv();
      const theme = event.target.closest("[data-theme]");
      if (theme) {
        await store.saveTheme(theme.dataset.theme);
        showToast("主题已切换");
        return render();
      }
      if (event.target.closest("[data-save-profile]")) return saveProfile();
      const statsMode = event.target.closest("[data-stats-mode]");
      if (statsMode) return navigate("stats", { mode: statsMode.dataset.statsMode });
      const filterType = event.target.closest("[data-filter-type]");
      if (filterType) return navigate("transactions", { type: filterType.dataset.filterType, category: "all", query: textValue("#searchTx") });
      const filterCategory = event.target.closest("[data-filter-category]");
      if (filterCategory) return navigate("transactions", { type: route.params.type || "all", category: filterCategory.dataset.filterCategory, query: textValue("#searchTx") });
    });
  });

  app.addEventListener("keydown", (event) => {
    if (event.target.id === "searchTx" && event.key === "Enter") {
      navigate("transactions", { type: route.params.type || "all", category: route.params.category || "all", query: textValue("#searchTx") });
    }
  });
}

async function authLogin(isSignup) {
  const email = textValue("#authEmail");
  const password = textValue("#authPassword");
  if (!email || !password) return showToast("请输入邮箱和密码");
  if (!supabaseClient) {
    const normalizedEmail = email.toLowerCase();
    const users = readLocalUsers();
    if (isSignup) {
      if (users[normalizedEmail]) return showToast("这个邮箱已经注册过");
      users[normalizedEmail] = { password };
      writeLocalUsers(users);
    } else if (!users[normalizedEmail] || users[normalizedEmail].password !== password) {
      return showToast("邮箱或密码不正确");
    }
    session = localSessionFromEmail(normalizedEmail);
    localStorage.setItem(LOCAL_SESSION_KEY, normalizedEmail);
    await store.load();
    showToast(isSignup ? "注册成功" : "登录成功");
    navigate("home");
    return;
  }
  let result;
  try {
    result = await withTimeout(
      isSignup
        ? supabaseClient.auth.signUp({ email, password })
        : supabaseClient.auth.signInWithPassword({ email, password }),
      8000,
      "连接 Supabase 超时，已切换到本地模式"
    );
  } catch (error) {
    console.error(error);
    showToast("云端登录请求超时，请稍后重试");
    return;
  }
  if (result.error) throw result.error;
  if (isSignup && !result.data.session) {
    showToast("注册成功，请先完成邮箱验证");
    return;
  }
  session = result.data.session;
  if (session?.user?.email) localStorage.setItem(LOCAL_SESSION_KEY, session.user.email.toLowerCase());
  backupSupabaseSession(session);
  await store.load();
  navigate("home");
}

async function authLogout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  localStorage.removeItem(LOCAL_SESSION_KEY);
  clearSupabaseSessionBackup();
  session = null;
  localStorage.removeItem(CACHE_KEY);
  store.state = fallbackState;
  navigate("login");
}

async function authOffline() {
  enterOfflineMode("已进入本地模式");
}

async function deleteTransaction(id) {
  if (!window.confirm("确定删除这条记录吗？删除后账户余额会同步调整。")) return;
  const deleted = await store.deleteTransaction(id);
  if (!deleted) return showToast("记录不存在或已删除");
  showToast("记录已删除");
  navigate("transactions");
}

async function cleanupDemoData() {
  const message = isLocalMode()
    ? "确定清空本机测试数据吗？会删除全部流水，并把余额、预算、存钱计划归零。"
    : "确定清空当前登录账号的云端测试数据吗？会删除全部流水，并把余额、预算、存钱计划归零。";
  if (!window.confirm(message)) return;
  try {
    await store.cleanupDemoData();
    syncStatus = {
      mode: isLocalMode() ? "local" : "cloud",
      lastSyncedAt: new Date().toLocaleString("zh-CN"),
      error: "",
      counts: {
        accounts: store.state.accounts.length,
        categories: store.state.categories.length,
        transactions: 0,
        savingPlans: 0
      }
    };
    showToast(isLocalMode() ? "本机测试数据已清空" : "云端测试数据已清空");
    navigate("mine");
  } catch (error) {
    console.error(error);
    syncStatus = { mode: "error", lastSyncedAt: syncStatus.lastSyncedAt, error: translateError(error), counts: syncStatus.counts };
    store.state = resetUserLedgerState(store.state);
    store.cache();
    showToast(`清理失败：${translateError(error)}`);
    render();
  }
}

async function saveEntry() {
  const amount = numberValue("#entryAmount");
  if (!amount) return showToast("请输入金额");
  const category = store.state.categories.find((item) => item.id === draft.categoryId);
  await store.addTransaction({
    type: draft.type,
    amount,
    title: textValue("#entryNote") || category?.name || "记账",
    categoryId: draft.categoryId,
    accountId: draft.accountId,
    date: document.querySelector("#entryDate").value || `${selectedMonth()}-${String(monthInfo().days).padStart(2, "0")}`,
    time: document.querySelector("#entryTime").value || currentTimeValue(),
    note: textValue("#entryNote")
  });
  showToast("已保存一笔");
  navigate("home");
}

async function savePeriod(returnTo = "home") {
  const month = document.querySelector("[data-selected-month]")?.dataset.selectedMonth || selectedMonth();
  await setSelectedMonth(month);
  showToast("月份已切换");
  navigate(returnTo || "home");
}

async function saveBudget() {
  const categoryBudgets = {};
  document.querySelectorAll(".categoryBudget").forEach((input) => {
    categoryBudgets[input.dataset.id] = Number(input.value || 0);
  });
  await store.saveBudget(numberValue("#totalBudget"), categoryBudgets);
  showToast("预算已保存");
  navigate("ledger");
}

async function saveAccountData(id) {
  await store.upsertAccount({
    id: id || `a${Date.now()}`,
    name: textValue("#accountName") || "新账户",
    balance: numberValue("#accountBalance"),
    color: textValue("#accountColor") || "#009b8f",
    icon: textValue("#accountIcon") || "账",
    isDefault: document.querySelector("#accountDefault").checked
  });
  showToast("账户已保存");
  navigate("accounts");
}

async function savePlanData(id) {
  await store.upsertSavingPlan({
    id: id || `sp${Date.now()}`,
    name: textValue("#planName") || "新计划",
    icon: textValue("#planIcon") || "标",
    target: numberValue("#planTarget"),
    saved: numberValue("#planSaved"),
    dueDate: document.querySelector("#planDue").value || "2026-12-31"
  });
  showToast("计划已保存");
  navigate("savingPlans");
}

async function saveCategoryData(id) {
  const type = route.params.type || "expense";
  await store.upsertCategory({
    id: id || `c${Date.now()}`,
    type,
    name: textValue("#categoryName") || "新分类",
    color: textValue("#categoryColor") || (type === "expense" ? "#ff9d1b" : "#009b8f"),
    icon: textValue("#categoryIcon") || "类"
  });
  showToast("分类已保存");
  navigate("categoriesManage", { type });
}

async function deleteCategoryData(id) {
  if (await store.deleteCategory(id)) {
    showToast("分类已删除");
    navigate("categoriesManage");
  } else {
    showToast("已有流水使用该分类，不能删除");
  }
}

async function saveProfile() {
  await store.saveProfile({
    avatar: textValue("#profileAvatar") || "人",
    name: textValue("#profileName") || "小明",
    bio: textValue("#profileBio") || "记录每一笔，掌控每一天"
  });
  showToast("资料已保存");
  navigate("mine");
}

function exportCsv() {
  const start = document.querySelector("#exportStart").value;
  const end = document.querySelector("#exportEnd").value;
  const rows = store.state.transactions
    .filter((tx) => tx.date >= start && tx.date <= end)
    .map((tx) => [tx.date, tx.time || "09:41", tx.type, tx.title, txCategory(tx).name, txAccount(tx).name, tx.amount, tx.note]);
  const csv = [["日期", "时间", "类型", "标题", "分类", "账户", "金额", "备注"], ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `轻账本-${start}-${end}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV 已生成");
}

async function boot() {
  bindEvents();
  render();
  diagnoseSupabase()
    .then(setBootDiagnostics)
    .catch((error) => setBootDiagnostics([translateError(error)]));
  if (isLocalMode()) {
    const localEmail = localStorage.getItem(LOCAL_SESSION_KEY);
    if (localEmail && readLocalUsers()[localEmail]) {
      session = localSessionFromEmail(localEmail);
      await store.load();
      navigate("home");
    } else {
      navigate("login");
    }
    return;
  }
  let authResult;
  try {
    authResult = await withTimeout(restoreSupabaseSession(), 6000, "连接 Supabase 超时，请重新登录");
  } catch (error) {
    console.error(error);
    if (hasCachedLedgerData() || localStorage.getItem(LOCAL_SESSION_KEY) || localStorage.getItem(OFFLINE_EMAIL_KEY)) {
      enterOfflineMode("已使用本地缓存打开");
      return;
    }
    showToast(translateError(error));
    navigate("login");
    return;
  }
  const { data, error } = authResult;
  if (error) {
    if (hasCachedLedgerData() || localStorage.getItem(LOCAL_SESSION_KEY) || localStorage.getItem(OFFLINE_EMAIL_KEY)) {
      enterOfflineMode("连接 Supabase 失败，已进入本地模式");
      return;
    }
    showToast(translateError(error));
    navigate("login");
    return;
  }
  session = data.session;
  if (!session) {
    if (hasCachedLedgerData() || localStorage.getItem(LOCAL_SESSION_KEY) || localStorage.getItem(OFFLINE_EMAIL_KEY)) {
      enterOfflineMode("已使用本地缓存打开");
      return;
    }
    navigate("login");
    return;
  }
  navigate("home");
  store.load()
    .then(() => {
      if (route.name !== "login") render();
    })
    .catch((error) => {
      console.error(error);
      syncStatus = { mode: "error", lastSyncedAt: syncStatus.lastSyncedAt, error: translateError(error) };
      showToast(translateError(error));
    });
}

async function restoreSupabaseSession() {
  const stored = readSupabaseStoredSession();
  if (stored?.access_token && stored?.refresh_token) {
    const restored = await supabaseClient.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token
    });
    if (restored.data?.session) {
      backupSupabaseSession(restored.data.session);
      return restored;
    }
  }
  const first = await supabaseClient.auth.getSession();
  if (first.error || first.data.session) return first;
  const backup = readSupabaseSessionBackup();
  if (backup?.access_token && backup?.refresh_token) {
    const restored = await supabaseClient.auth.setSession({
      access_token: backup.access_token,
      refresh_token: backup.refresh_token
    });
    if (restored.data?.session) {
      backupSupabaseSession(restored.data.session);
      return restored;
    }
    if (restored.error) clearSupabaseSessionBackup();
  }
  return new Promise((resolve) => {
    let settled = false;
    let subscription = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      subscription?.unsubscribe();
      resolve(result);
    };
    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, restoredSession) => {
      if (restoredSession) finish({ data: { session: restoredSession }, error: null });
    });
    subscription = listener.subscription;
    setTimeout(async () => {
      const second = await supabaseClient.auth.getSession();
      finish(second);
    }, 500);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`).then((registration) => {
      registration.update();
      if (registration.waiting) registration.waiting.postMessage("skipWaiting");
    }).catch(() => {});
  });
}

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange(async (event, nextSession) => {
    try {
      if (event === "SIGNED_OUT") {
        session = null;
        localStorage.removeItem(LOCAL_SESSION_KEY);
        clearSupabaseSessionBackup();
        navigate("login");
        return;
      }
      if (!nextSession || session?.access_token === nextSession.access_token) return;
      session = nextSession;
      if (session.user?.email) localStorage.setItem(LOCAL_SESSION_KEY, session.user.email.toLowerCase());
      backupSupabaseSession(session);
      await store.load();
      if (route.name === "login" || route.name === "boot") navigate("home");
    } catch (error) {
      console.error(error);
      syncStatus = { mode: "error", lastSyncedAt: syncStatus.lastSyncedAt, error: translateError(error) };
      showToast(translateError(error));
      if (route.name === "boot") navigate("login");
    }
  });
}

boot().catch((error) => {
  console.error(error);
  showToast(translateError(error) || "启动失败");
  navigate("login");
});
