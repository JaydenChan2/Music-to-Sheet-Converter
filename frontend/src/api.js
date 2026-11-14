// In development requests go through the Vite proxy (see vite.config.js). In
// production set VITE_API_URL to the backend's address, e.g.
// https://you-guitar-tab-ai.hf.space (no trailing slash).
export const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API = `${BACKEND}/api`;

// Result file links come back as /api/jobs/...; point them at the backend.
function absolutize(job) {
  if (job?.result?.files && BACKEND) {
    job.result.files = Object.fromEntries(
      Object.entries(job.result.files).map(([k, v]) => [k, v.startsWith('/') ? BACKEND + v : v]),
    );
  }
  return job;
}

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

// options: { videoType, separate, tuning, capo, customTuning, start, end }
function jobOptions({ videoType, separate, tuning, capo, customTuning, start, end }) {
  return {
    video_type: videoType || 'song', separate, tuning, capo,
    custom_tuning: tuning === 'custom' ? customTuning : '',
    start: start || '', end: end || '',
  };
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
  return absolutize(await parse(await fetch(`${API}/jobs/${id}`)));
}

/** Precomputed example songs shipped with the website (see backend/make_examples.py). */
export async function getExamples() {
  const r = await fetch('/examples/index.json');
  return r.ok ? r.json() : { examples: [] };
}

export async function getExample(id) {
  const r = await fetch(`/examples/${id}/result.json`);
  if (!r.ok) throw new Error('That example could not be loaded.');
  return r.json();
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
