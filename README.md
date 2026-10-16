# Document Q&A

Upload PDF, TXT, Markdown or Word (.docx) files, then ask questions that are answered only
from those files, with the source file and page shown under every answer.

## How it works

- **Upload:** browser → Vercel Blob (temporary, because Vercel functions reject request bodies
  over 4.5 MB) → server.
- **Indexing:** the server reads the text (PDF page by page, so answers can cite pages), splits
  it into overlapping passages of about 1,200 characters, and stores them in an
  **Upstash Vector** index. The index creates the embeddings itself with its built-in model.
  A hybrid index (dense + sparse/BM25) matches both meaning and exact words, names and numbers.
  The file appears as Ready only after all its passages are searchable.
- **Answering:** the server finds the 8 best-matching passages and sends them, numbered, to a
  **Groq** model, which answers only from them and cites passage numbers. Those citations
  become the sources shown under the answer. Follow-up questions send the last 3 exchanges.

API keys are only read on the server. This is an open app: there is no login. Anyone with the
URL can upload, ask, and remove files.

## Deploy on Vercel (one time)

1. Vercel dashboard → **Add New → Project** → import this GitHub repo. Framework preset:
   Next.js. Leave build settings at their defaults.
2. **Storage** → create a **Blob** store and connect it to the project. Vercel adds the
   store's credentials automatically: `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` on newer
   projects, `BLOB_READ_WRITE_TOKEN` on older ones. The app works with either. Choose
   **Private** access if offered. If you choose Public, also add
   `NEXT_PUBLIC_BLOB_ACCESS=public`.
3. **Storage** → create an **Upstash Vector** index and connect it to the project. Choose an
   Upstash-hosted **embedding model** (recommended: hybrid, dense `BGE-M3` + sparse `BM25`).
   This adds `UPSTASH_VECTOR_REST_URL` and `UPSTASH_VECTOR_REST_TOKEN`.
4. **Settings → Environment Variables** → add `GROQ_API_KEY` for Production and Preview.
5. **Deployments → Redeploy** so the variables load.
6. Open `<your-url>/api/health`. Expect `"ok":true` and the index's embedding models under
   `search`. Any problem is listed under `errors` by service.

## Environment variables

See `.env.example`.

| Variable | Required | Notes |
| --- | --- | --- |
| `GROQ_API_KEY` | yes | Server only |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b` |
| `UPSTASH_VECTOR_REST_URL` + `UPSTASH_VECTOR_REST_TOKEN` | yes | Added by Vercel when the index is connected |
| `BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY` | yes* | Added by Vercel when a Blob store is connected; auth uses Vercel's OIDC token |
| `BLOB_READ_WRITE_TOKEN` | yes* | Older alternative to `BLOB_STORE_ID`; also needed for local testing |
| `NEXT_PUBLIC_BLOB_ACCESS` | no | `private` (default) or `public`; must match the Blob store |
| `NEXT_PUBLIC_APP_NAME` | no | Defaults to "Document Q&A" |

## Run locally

```bash
cp .env.example .env.local   # then fill in the keys above
npm install
npm run dev
```

Local and deployed copies share the same files when they use the same Upstash index.

## Known limits

- Scanned PDFs (photos of pages) have no text layer, so they show a Failed message.
- A file can produce at most 3,000 passages (about 3.6 million characters of text).
- Upstash and Groq free tiers have daily and per-minute limits. When a limit is hit, the
  error is shown under the failed row or answer.
- Hobby plan functions stop after 300 seconds; very large files may time out while indexing.
- If the tab is closed after the browser upload but before processing starts, the temporary
  blob is not deleted. Delete it by hand in Vercel → Storage → Blob.
