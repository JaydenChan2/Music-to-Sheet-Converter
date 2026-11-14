# Deploying Guitar Tab AI (free)

- **Website** → [Vercel](https://vercel.com) (free Hobby plan)
- **Transcription server** → [Hugging Face Spaces](https://huggingface.co/spaces) (free "CPU basic" Docker Space)

The Studio's **Try an example** songs are part of the website, so they work even
while the free server is asleep. Live transcription uses the Space.

Free plans change; check each site's current limits.

---

## 0. Before you start

1. Commit and push everything to GitHub (`main`). Vercel deploys from there.
2. Create free accounts on **Hugging Face** and **Vercel** (signing in to Vercel with
   GitHub is easiest).
3. Have `git` and `rsync` available (both come with macOS).

---

## 1. Put the backend on Hugging Face Spaces

1. **Create the Space.** Go to huggingface.co → your avatar → **New Space**.
   - Name: e.g. `guitar-tab-ai-api`
   - SDK: **Docker** → *Blank*
   - Hardware: **CPU basic (free)**
   - Visibility: **Public** (the website must be able to call it without a login)
2. **Make a write token** for pushing code: avatar → **Settings → Access Tokens →
   Create new token** → type *Write*. Copy it.
3. **Push the backend** from the project folder:

   ```bash
   deploy/push_backend_to_space.sh https://huggingface.co/spaces/<your-username>/guitar-tab-ai-api
   ```

   When git asks for a username and password, enter your Hugging Face username and
   **the token** as the password.

   The script copies `backend/` (without the virtualenv, jobs or benchmark data) into
   the Space, adds the Space's settings header, and pushes it.
4. **Wait for the build.** Open the Space page → **Logs**. The first build takes a while
   (roughly 10–20 minutes): it installs PyTorch and downloads the AI models into the
   image. The status turns **Running** when it's done.
5. **Find the server's address.** It is `https://<your-username>-guitar-tab-ai-api.hf.space`.
   You can also find it on the Space page under **⋮ → Embed this Space → Direct URL**.
6. **Check it.** Open `https://<your-username>-guitar-tab-ai-api.hf.space/api/health` in a
   browser. You should see JSON starting with `{"ok":true,...`.

---

## 2. Put the website on Vercel

1. vercel.com → **Add New… → Project** → import your GitHub repo.
2. Set **Root Directory** to `frontend`. The framework is detected as **Vite**; keep the
   defaults (build `npm run build`, output `dist`).
3. Under **Environment Variables** add:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-username>-guitar-tab-ai-api.hf.space` (no trailing slash) |

4. Click **Deploy**. You get a URL like `https://guitar-tab-ai.vercel.app`.

---

## 3. Lock the server to your website

So that only your site can use your free server:

1. Space page → **Settings → Variables and secrets → New variable**:

   | Name | Value |
   |---|---|
   | `ALLOWED_ORIGINS` | `https://guitar-tab-ai.vercel.app` (your exact Vercel URL; add a custom domain after a comma) |

2. The Space restarts by itself. If it doesn't, use **Settings → Restart this Space**.

---

## 4. Check it end to end

- [ ] The home page loads, and refreshing on `/studio` doesn't give a 404.
- [ ] **Studio → Try an example** opens all four examples instantly.
- [ ] The Studio header says **Backend online** (or **Waking up the server** for a minute
      first, then online).
- [ ] Uploading a short clip (under 3 minutes) produces a tab.

---

## 5. Updating later

- **Website:** push to `main`; Vercel redeploys automatically.
- **Server:** run `deploy/push_backend_to_space.sh <space url>` again; the Space rebuilds.
- **Example songs:** after changing the pipeline, run `cd backend && .venv/bin/python make_examples.py`
  (needs the GuitarSet benchmark data, see the README), then commit `frontend/public/examples`.

---

## How the free server behaves

| Behaviour | What visitors see |
|---|---|
| Sleeps after a couple of days without visitors | The first visit wakes it; the Studio shows **Waking up the server** for a minute or two. Examples work meanwhile. |
| Slow CPU (2 cores) | A 1-minute song takes roughly a minute or two; guitar isolation adds more. |
| YouTube links are usually blocked from cloud servers | "Couldn't download that link"; uploads and examples still work. |
| Files are wiped when the Space restarts | Old results disappear; that's fine for a demo. |

Limits are set in `backend/Dockerfile` and can be changed in the Space's **Variables**
without touching code:

| Variable | Default on the Space | Meaning |
|---|---|---|
| `MAX_DURATION_S` | `180` | Longest part of a song transcribed per job (seconds) |
| `MAX_UPLOAD_MB` | `60` | Largest upload |
| `RATE_LIMIT_PER_HOUR` | `12` | Songs per visitor per hour |
| `MAX_QUEUED` | `3` | New songs are turned away while this many are in progress |
| `JOB_TTL_HOURS` | `6` | Results are deleted after this long |
| `WHISPER_MODEL` | `base` | Speech model for tutorial mode (`small` is more accurate, slower) |
| `ALLOWED_ORIGINS` | `*` until you set it | Websites allowed to call the server |

Links to private network addresses (localhost, `169.254.169.254`, `192.168.x.x`, …) are
always refused, so visitors can't make the server fetch from its own network.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Space build fails | Read the **Logs** tab; the last error lines say which step failed. |
| Website says "Can't reach the transcription server" | Check `/api/health` on the Space URL; check `VITE_API_URL` on Vercel, then **Redeploy** (the variable is baked in at build time). |
| Browser console shows a CORS error | `ALLOWED_ORIGINS` must match the site exactly: `https://`, no trailing slash. |
| `/studio` gives 404 on refresh | Vercel's Root Directory must be `frontend` so `frontend/vercel.json` is used. |
| "That's 12 songs this hour" | The rate limit; raise `RATE_LIMIT_PER_HOUR`. |
