// All requests go through the Vite dev proxy (see vite.config.js).
const API = '/api';

async function parse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    // non-JSON body (e.g. proxy error page)
  }
  if (!response.ok) {
    throw new Error(data?.error || `Server error (${response.status}). Is the backend running?`);
  }
  return data;
}

export async function getHealth() {
  return parse(await fetch(`${API}/health`));
}

// options: { separate, tuning, capo, customTuning }
function jobOptions({ separate, tuning, capo, customTuning }) {
  return { separate, tuning, capo, custom_tuning: tuning === 'custom' ? customTuning : '' };
}

export async function createJobFromFile(file, options) {
  const form = new FormData();
  form.append('file', file);
  Object.entries(jobOptions(options)).forEach(([k, v]) => form.append(k, String(v)));
  return parse(await fetch(`${API}/jobs`, { method: 'POST', body: form }));
}

export async function createJobFromUrl(url, options) {
  return parse(await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...jobOptions(options) }),
  }));
}

export async function getJob(id) {
  return parse(await fetch(`${API}/jobs/${id}`));
}

export async function waitForJob(id, onUpdate, intervalMs = 800) {
  for (;;) {
    const job = await getJob(id);
    onUpdate(job);
    if (job.status === 'done') return job;
    if (job.status === 'error') throw new Error(job.error || 'Processing failed.');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
