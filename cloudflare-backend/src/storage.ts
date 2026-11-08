import { ApiError, json, requireOrigin, type Bindings } from "./auth";
import { player } from "./community";
import { body } from "./request";

export const CHUNK_BYTES = 128 * 1024;
const STORAGE_BYTES = 400 * 1024 * 1024;
interface StoredFile { id: string; path: string; user_id: string; content_type: string; size: number; complete: number }
const accepted: Record<string, string[]> = { "text/html": ["html"], "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"], "image/webp": ["webp"] };

export async function storageRoute(request: Request, env: Bindings): Promise<Response> {
  const url = new URL(request.url);
  const publicChunk = /^\/api\/storage\/public\/([0-9a-f-]{36})\/([0-9]{1,2})$/.exec(url.pathname);
  const publicHeaders = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if (request.method === "GET" && publicChunk) {
    const row = await env.ARCADE_DB.prepare(`SELECT hex(c.data) AS hex FROM storage_chunks c JOIN storage_files f ON f.id = c.file_id
      WHERE c.file_id = ? AND c.position = ? AND f.complete = 1`).bind(publicChunk[1], Number(publicChunk[2])).first<{ hex: string }>();
    if (!row) throw new ApiError(404, "This file chunk was not found.");
    const decoder = Uint8Array as unknown as { fromHex: (hex: string) => Uint8Array };
    if (typeof decoder.fromHex !== "function") throw new ApiError(503, "This runtime cannot serve stored files within its budget.");
    return new Response(decoder.fromHex(row.hex), { headers: { ...publicHeaders, "Content-Type": "application/octet-stream" } });
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/storage/games/")) {
    let path: string;
    try { path = decodeURIComponent(url.pathname.slice("/api/storage/games/".length)); }
    catch { throw new ApiError(400, "This file path is invalid."); }
    const file = await env.ARCADE_DB.prepare("SELECT * FROM storage_files WHERE path = ? AND complete = 1").bind(path).first<StoredFile>();
    if (!file) throw new ApiError(404, "This file was not found.");
    const manifest = { id: file.id, size: file.size, contentType: file.content_type, chunks: Math.ceil(file.size / CHUNK_BYTES),
      chunkBase: url.origin + "/api/storage/public/" + file.id + "/" };
    if (url.searchParams.get("manifest") === "1") return new Response(JSON.stringify(manifest), { headers: { ...publicHeaders, "Content-Type": "application/json" } });
    // Assemble bytes in the browser. A full 5 MB D1 response exceeded Workers
    // Free's CPU budget locally. Each immutable chunk is a bounded invocation.
    // The trusted loader and the game retain an opaque origin even top-level.
    const document = `<!doctype html><meta charset="utf-8"><title>Arcade file</title><style>body{margin:0;background:#F6F1E7;color:#2B241D;font:16px system-ui}p{padding:24px}img{max-width:100%;height:auto}</style><p role="status">Loading arcade file…</p><script>
(async()=>{const m=${JSON.stringify(manifest)};const pieces=new Array(m.chunks);let next=0;await Promise.all(Array.from({length:Math.min(4,m.chunks)},async()=>{while(next<m.chunks){const n=next++;const r=await fetch(m.chunkBase+n,{credentials:'omit'});if(!r.ok)throw Error('File unavailable');pieces[n]=await r.arrayBuffer();}}));const b=new Blob(pieces,{type:m.contentType});if(b.size!==m.size)throw Error('Incomplete file');const u=URL.createObjectURL(b);if(m.contentType==='text/html')location.replace(u);else{document.body.replaceChildren(Object.assign(document.createElement('img'),{src:u,alt:'Uploaded artwork'}));}})().catch(()=>{document.querySelector('p').textContent='This file could not load. Reload to try again.'});
</script>`;
    return new Response(document, { headers: { ...publicHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `sandbox allow-scripts; base-uri 'none'; object-src 'none'; frame-ancestors 'self' ${new URL(env.APP_ORIGIN).origin}`,
    } });
  }
  if (request.method !== "POST") throw new ApiError(404, "This storage route was not found.");
  requireOrigin(request, env);
  const user = await player(request, env);
  if (user.isGuest || !user.emailVerified) throw new ApiError(403, "Use an optional verified account to upload games. Guest play stays available.");
  if (url.pathname === "/api/storage/files") {
    const input = await body(request);
    if (Object.keys(input).some(k => !["path", "contentType", "size"].includes(k))) throw new ApiError(400, "Send supported file metadata.");
    const path = input.path, contentType = input.contentType;
    if (typeof path !== "string" || !path.startsWith(user.id + "/") || !/^[A-Za-z0-9_-]+\/[a-z0-9][a-z0-9._-]{0,180}\.(html|png|jpg|jpeg|webp)$/.test(path)) throw new ApiError(400, "Upload an immutable file in your own player folder.");
    if (typeof contentType !== "string" || !Object.hasOwn(accepted, contentType) || !accepted[contentType].includes(path.split(".").at(-1)!)) throw new ApiError(400, "Use HTML, PNG, JPEG or WebP files.");
    const max = contentType === "text/html" ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
    if (!Number.isSafeInteger(input.size) || Number(input.size) < 1 || Number(input.size) > max) throw new ApiError(413, "HTML files may be up to 5 MB; artwork up to 2 MB.");
    const existing = await env.ARCADE_DB.prepare("SELECT id,user_id,size,content_type FROM storage_files WHERE path = ?").bind(path).first<StoredFile>();
    if (existing) {
      if (existing.user_id !== user.id || existing.size !== input.size || existing.content_type !== contentType) throw new ApiError(409, "This immutable path already belongs to a different file.");
      return json({ data: { id: existing.id, chunkBytes: CHUNK_BYTES, resumed: true } });
    }
    const pending = await env.ARCADE_DB.prepare("SELECT count(*) AS n FROM game_submissions WHERE user_id = ? AND status = 'pending'").bind(user.id).first<{ n: number }>();
    if ((pending?.n ?? 0) >= 3) throw new ApiError(429, "You already have three games awaiting review.");
    // Bound abandoned uploads too, rather than allowing unlimited reserved
    // payloads outside the submission queue. Never delete player files here.
    const recent = await env.ARCADE_DB.prepare("SELECT count(*) AS n FROM storage_files WHERE user_id = ? AND created_at >= ?").bind(user.id, new Date(Date.now() - 86400000).toISOString()).first<{ n: number }>();
    if ((recent?.n ?? 0) >= 12) throw new ApiError(429, "Your daily upload allowance is full. Try again tomorrow.");
    const id = crypto.randomUUID();
    const result = await env.ARCADE_DB.batch([
      env.ARCADE_DB.prepare(`INSERT INTO storage_files (id,path,user_id,content_type,size,created_at)
        SELECT ?,?,?,?,?,? WHERE (SELECT reserved_bytes FROM storage_budget WHERE id = 1) + ? <= ?`)
        .bind(id, path, user.id, contentType, input.size, new Date().toISOString(), input.size, STORAGE_BYTES),
      env.ARCADE_DB.prepare("UPDATE storage_budget SET reserved_bytes = reserved_bytes + ? WHERE id = 1 AND EXISTS (SELECT 1 FROM storage_files WHERE id = ?)").bind(input.size, id),
    ]);
    if (!result[0].meta.changes) throw new ApiError(507, "Arcade's free file storage is full. No paid storage was enabled.");
    return json({ data: { id, chunkBytes: CHUNK_BYTES } }, 201);
  }
  const match = /^\/api\/storage\/files\/([0-9a-f-]{36})\/(chunks\/([0-9]{1,2})|complete)$/.exec(url.pathname);
  if (!match) throw new ApiError(404, "This storage route was not found.");
  const file = await env.ARCADE_DB.prepare("SELECT * FROM storage_files WHERE id = ?").bind(match[1]).first<StoredFile>();
  if (!file) throw new ApiError(404, "This file was not found.");
  if (file.user_id !== user.id) throw new ApiError(403, "You can only upload to your own files.");
  if (match[2] === "complete") {
    const result = await env.ARCADE_DB.prepare(`UPDATE storage_files SET complete = 1 WHERE id = ? AND
      (SELECT count(*) FROM storage_chunks WHERE file_id = ?) = ? AND (SELECT sum(length(data)) FROM storage_chunks WHERE file_id = ?) = size RETURNING path`)
      .bind(file.id, file.id, Math.ceil(file.size / CHUNK_BYTES), file.id).first<{ path: string }>();
    if (!result) throw new ApiError(409, "Finish all file chunks before completing this upload.");
    return json({ data: { path: result.path } });
  }
  const position = Number(match[3]);
  if (position >= Math.ceil(file.size / CHUNK_BYTES)) throw new ApiError(400, "This chunk position is invalid.");
  if (request.headers.get("content-type")?.split(";")[0] !== "application/octet-stream") throw new ApiError(415, "Send binary file data.");
  const expected = Math.min(CHUNK_BYTES, file.size - position * CHUNK_BYTES);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Send this file chunk.");
  const bytes = new Uint8Array(expected);
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > expected) { await reader.cancel(); throw new ApiError(413, "This file chunk is too large."); }
    bytes.set(value, size - value.length);
  }
  if (size !== expected) throw new ApiError(400, "This file chunk has the wrong size.");
  const encoder = bytes as unknown as { toHex: () => string };
  if (typeof encoder.toHex !== "function") throw new ApiError(503, "This runtime cannot store files within its budget.");
  const hex = encoder.toHex();
  // Bind compact text, not D1's expensive JSON byte-array representation.
  // SQLite decodes inside the database; bytes and file paths remain immutable.
  const saved = await env.ARCADE_DB.prepare(`INSERT INTO storage_chunks (file_id,position,data)
    SELECT ?,?,unhex(?) WHERE EXISTS (SELECT 1 FROM storage_files WHERE id = ? AND user_id = ? AND complete = 0)
    ON CONFLICT(file_id,position) DO NOTHING RETURNING position`).bind(file.id, position, hex, file.id, user.id).first();
  if (saved) return json({ data: { position, replayed: false } }, 201);
  const existing = await env.ARCADE_DB.prepare("SELECT data = unhex(?) AS matches FROM storage_chunks WHERE file_id = ? AND position = ?")
    .bind(hex, file.id, position).first<{ matches: number }>();
  if (!existing?.matches) throw new ApiError(409, "An immutable chunk already exists with different data.");
  return json({ data: { position, replayed: true } });
}
