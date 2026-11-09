export interface GameComment {
  id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
}

interface CommentPageQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  order(column: string, options: { ascending: boolean }): CommentPageQuery;
  range(from: number, to: number): CommentPageQuery;
  abortSignal(signal: AbortSignal): CommentPageQuery;
}

interface CommentsClient {
  from(table: "comments"): {
    select(columns: string): {
      eq(column: string, value: string): CommentPageQuery;
    };
  };
}

const PAGE_SIZE = 200;
const COMMENT_COLUMNS = "id, user_id, parent_id, body, created_at, profiles(username, display_name, avatar_url, role)";

// Keep complete threads, including replies whose parents are on earlier pages.
// The ID tiebreaker prevents equal timestamps from reshuffling page boundaries.
export async function loadGameComments(
  client: CommentsClient,
  gameId: string,
  signal?: AbortSignal,
): Promise<GameComment[]> {
  const comments: GameComment[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    signal?.throwIfAborted();
    let query = client.from("comments").select(COMMENT_COLUMNS)
      .eq("game_id", gameId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    signal?.throwIfAborted();
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("The comment thread could not be loaded.");
    comments.push(...data as GameComment[]);
    if (data.length < PAGE_SIZE) return comments;
  }
}
