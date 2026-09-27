# Enyukado — React frontend (work in progress)

This is a React (Vite) port of `frontend/index.html` + `index.js`. It talks to your
**existing, unchanged** Express backend in `backend/`.

## What's converted so far
- Login / Signup page (`src/pages/Login.jsx`) — full parity with the old `index.html` + `index.js`:
  intro animation, card toggle, password show/hide, client-side validation, privacy consent modal,
  toast notifications, login/register API calls, and the "pending approval" notice.

## What's not converted yet
`dashboard.html`, `profile.html`, `admin-dashboard.html`, `admin-login.html` — these are stubbed
as placeholder routes in `src/App.jsx`. Convert them the same way: read the old `<page>-api.js`
file for its `fetch` calls (those become functions in `src/api/`), and turn the HTML structure
into a component in `src/pages/`.

## Running it

**Terminal 1 — backend (unchanged):**
```bash
cd backend
npm install
npm start          # runs on http://localhost:5000
```

**Terminal 2 — this React app:**
```bash
npm install
npm run dev         # runs on http://localhost:5173
```

Vite proxies any `/api/...` request to `http://localhost:5000` (see `vite.config.js`), so
`src/api/client.js` just calls `fetch('/api/...')` — no CORS config or hardcoded backend URL
needed in dev.

## Folder structure
```
src/
  api/          fetch wrappers, one file per backend route group (userRoutes -> authApi.js, etc.)
  context/      AuthContext — replaces the scattered localStorage.setItem calls
  hooks/        useToast — replaces the old showToast()/toastTimeout globals
  components/   reusable pieces (PasswordInput, PrivacyModal, Toast)
  pages/        one component per old HTML page
  index.css     ported from frontend/index.css — all shared visual language
```

## Conversion pattern used for Login
| Old (vanilla JS)                          | New (React)                                |
|--------------------------------------------|---------------------------------------------|
| `document.getElementById(...)`             | `useState` + controlled `<input value=.../>`|
| `classList.add('hidden-card')` toggle       | `mode === 'login' ? ... : ...` conditional  |
| Global `showToast()` function               | `useToast()` hook                          |
| `localStorage.setItem` scattered in index.js| `AuthContext.signIn()`                     |
| `fetch(`${API_URL}/login`)`                 | `api/authApi.js` → `login()`               |
| Inline `<style>` block for privacy modal    | `components/PrivacyModal.css`              |

Next page to convert: `dashboard.html` is the biggest one (uses `dashboard-api.js`, ~52KB) —
worth breaking into several smaller components (listing grid, category filter, wishlist, etc.)
rather than one big `Dashboard.jsx`.
