const DEFAULT_TIMEOUT_MS = 15000;

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.result)) return payload.result;
  return payload;
}

async function postJson(url, body, headers, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = data && data.error ? data.error : `${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function connectProject(siteId, options = {}) {
  if (!siteId) throw new Error("SITE_ID is required");
  if (!options.apiKey) throw new Error("API_KEY is required");
  if (!options.dbmsUrl) throw new Error("DBMS_URL is required");

  const dbmsUrl = options.dbmsUrl.replace(/\/+$/, "");
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const headers = {
    "content-type": "application/json",
    "x-site-id": siteId,
    "x-api-key": options.apiKey
  };

  async function call(path, body) {
    return postJson(`${dbmsUrl}${path}`, body, headers, timeoutMs);
  }

  async function query(sql, params = []) {
    const payload = { siteId, sql, params };
    const paths = [
      `/api/projects/${encodeURIComponent(siteId)}/query`,
      `/projects/${encodeURIComponent(siteId)}/query`,
      "/api/query",
      "/query"
    ];

    let lastError;
    for (const path of paths) {
      try {
        return normalizeRows(await call(path, payload));
      } catch (error) {
        lastError = error;
        if (!/404|Cannot|not found/i.test(error.message)) break;
      }
    }

    throw lastError;
  }

  async function execute(sql, params = []) {
    return query(sql, params);
  }

  async function status() {
    const paths = [
      `/api/projects/${encodeURIComponent(siteId)}/status`,
      `/projects/${encodeURIComponent(siteId)}/status`,
      "/api/status",
      "/status"
    ];

    let lastError;
    for (const path of paths) {
      try {
        return await call(path, { siteId });
      } catch (error) {
        lastError = error;
        if (!/404|Cannot|not found/i.test(error.message)) break;
      }
    }

    throw lastError;
  }

  return { query, execute, status };
}

module.exports = { connectProject };
