import { useEffect, useState, type ImgHTMLAttributes } from "react";

// Shipped art stays on its normal static URL. Uploaded artwork is assembled
// from bounded, public immutable chunks to fit the free Worker's CPU budget.
const ArcadeImage = ({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => {
  const stored = typeof src === "string" && src.startsWith("/api/storage/games/");
  const [image, setImage] = useState<{ source: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!stored || !src) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setFailed(false);
    void (async () => {
      const response = await fetch(src + "?manifest=1", { signal: controller.signal, credentials: "omit" });
      if (!response.ok) throw new Error();
      const manifest = await response.json() as { contentType: string; chunks: number; size: number; chunkBase: string };
      if (!["image/png", "image/jpeg", "image/webp"].includes(manifest.contentType) || !Number.isSafeInteger(manifest.chunks) ||
        manifest.chunks < 1 || manifest.chunks > 16 || manifest.size > 2 * 1024 * 1024) throw new Error();
      const pieces: ArrayBuffer[] = new Array(manifest.chunks);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, manifest.chunks) }, async () => {
        while (next < manifest.chunks) {
          const n = next++;
          const chunk = await fetch(manifest.chunkBase + n, { signal: controller.signal, credentials: "omit" });
          if (!chunk.ok) throw new Error();
          pieces[n] = await chunk.arrayBuffer();
        }
      }));
      const blob = new Blob(pieces, { type: manifest.contentType });
      if (blob.size !== manifest.size) throw new Error();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({ source: src, url: objectUrl });
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, stored]);
  const resolved = stored ? image?.source === src ? image.url : "/placeholder.svg" : src;
  return <img {...props} src={failed ? "/placeholder.svg" : resolved} alt={alt ?? ""} />;
};
export default ArcadeImage;
