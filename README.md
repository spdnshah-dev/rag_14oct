# Document Q&A

Upload PDF, TXT, Markdown or Word (.docx) files, then ask questions that are answered only
from those files, with the source file and page shown under every answer.

Gemini's File Search tool does the chunking, embedding, storage and retrieval. Files go
browser → Vercel Blob (temporary) → server → Gemini, because Vercel functions reject request
bodies over 4.5 MB. The Gemini API key is only read on the server.

This is an open app: there is no login. Anyone with the URL can upload, ask, and remove files.

## Deploy on Vercel (one time)

1. Vercel dashboard → **Add New → Project** → import this GitHub repo. Framework preset:
   Next.js. Leave build settings at their defaults.
2. In the project → **Storage** → create a **Blob** store and connect it to the project. This
   adds `BLOB_READ_WRITE_TOKEN` automatically. Choose **Private** access if offered. If you
   choose Public, also add `NEXT_PUBLIC_BLOB_ACCESS=public` in step 3.
3. **Settings → Environment Variables** → add `GEMINI_API_KEY` (from Google AI Studio) for
   Production and Preview.
4. **Deployments → Redeploy** so the variables load.
5. Open `<your-url>/api/health`. Expect `{"ok":true,"store":false,"model":"gemini-3.8-flash"}`.
   `store` turns `true` after the first upload, which creates the Gemini File Search store.

## Environment variables

See `.env.example`. Only `GEMINI_API_KEY` and `BLOB_READ_WRITE_TOKEN` are required.

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Server only |
| `BLOB_READ_WRITE_TOKEN` | yes | Added by Vercel when a Blob store is connected |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.8-flash`; must support File Search |
| `GEMINI_FILE_SEARCH_STORE` | no | Pins a store; otherwise the app finds or creates `document-qa-app` |
| `NEXT_PUBLIC_BLOB_ACCESS` | no | `private` (default) or `public`; must match the Blob store |
| `NEXT_PUBLIC_APP_NAME` | no | Defaults to "Document Q&A" |

## Run locally

```bash
cp .env.example .env.local   # then fill in GEMINI_API_KEY and BLOB_READ_WRITE_TOKEN
npm install
npm run dev
```

Local and deployed copies share the same Gemini store when they use the same API key.

## Known limits

- Hobby plan functions stop after 300 seconds. If a large file's processing takes longer, the
  row shows Failed, but Gemini may still finish the import; the file then appears after a
  reload.
- If the tab is closed after the browser upload but before processing starts, the temporary
  blob is not deleted. Delete it by hand in Vercel → Storage → Blob.
- Gemini free tier: Google may use submitted content to improve its products, and total
  storage is capped at 1 GB (stored size is about 3× the file size).
