import { arcadeRequest } from "./arcade-api";

interface QueryResult { data: unknown; error: { message: string; code?: string } | null; count?: number }
interface QueryState {
  table: string; operation: string; filters: { column: string; op: string; value: unknown }[];
  orders: { column: string; ascending: boolean }[];
  limit?: number; single?: "required" | "optional"; head?: boolean; values?: unknown;
}
// A narrow compatibility boundary for the existing UI. The Worker accepts only
// named models, allowlisted filters and explicit mutations, never client SQL.
class CommunityQuery implements PromiseLike<QueryResult> {
  private state: QueryState;
  constructor(table: string) { this.state = { table, operation: "select", filters: [], orders: [] }; }
  select(_columns = "*", options?: { head?: boolean }) { this.state.head = options?.head; return this; }
  eq(column: string, value: unknown) { this.state.filters.push({ column, op: "eq", value }); return this; }
  ilike(column: string, value: string) { this.state.filters.push({ column, op: "ilike", value }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.state.orders.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(limit: number) { this.state.limit = limit; return this; }
  single() { this.state.single = "required"; return this; }
  maybeSingle() { this.state.single = "optional"; return this; }
  insert(values: unknown) { this.state.operation = "insert"; this.state.values = values; return this; }
  upsert(values: unknown) { this.state.operation = "upsert"; this.state.values = values; return this; }
  update(values: unknown) { this.state.operation = "update"; this.state.values = values; return this; }
  delete() { this.state.operation = "delete"; return this; }
  private async execute(): Promise<QueryResult> {
    try { return { ...await arcadeRequest<{ data: unknown; count?: number }>("/community/query", { method: "POST", body: JSON.stringify(this.state) }), error: null }; }
    catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "This request failed." } }; }
  }
  then<TResult1 = QueryResult, TResult2 = never>(onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
export const cloudflareCommunity = {
  from: (table: string) => new CommunityQuery(table),
  rpc: async (name: string, args: unknown) => {
    try { return { ...await arcadeRequest<{ data: unknown }>("/community/rpc", { method: "POST", body: JSON.stringify({ name, args }) }), error: null }; }
    catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "This request failed." } }; }
  },
  storage: {
    from: (bucket: string) => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: "/api/storage/games/" + path.split("/").map(encodeURIComponent).join("/") } }),
      upload: async (path: string, file: File, options?: { contentType?: string }) => {
        try {
          if (bucket !== "games") throw new Error("This storage bucket is not supported.");
          const created = await arcadeRequest<{ data: { id: string; chunkBytes: number } }>("/storage/files", {
            method: "POST", body: JSON.stringify({ path, contentType: options?.contentType ?? file.type, size: file.size }),
          });
          const { id, chunkBytes } = created.data;
          for (let offset = 0; offset < file.size; offset += chunkBytes) {
            await arcadeRequest(`/storage/files/${id}/chunks/${offset / chunkBytes}`, { method: "POST",
              headers: { "Content-Type": "application/octet-stream" }, body: file.slice(offset, offset + chunkBytes) });
          }
          await arcadeRequest(`/storage/files/${id}/complete`, { method: "POST", body: "{}" });
          return { data: { path }, error: null };
        } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "The file could not upload." } }; }
      },
    }),
  },
};
