import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type YouTubeVideo = {
  id: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    title?: string;
    description?: string;
    thumbnails?: Record<string, { url: string; width?: number; height?: number }>;
    channelTitle?: string;
    tags?: string[];
    categoryId?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  contentDetails?: { duration?: string; caption?: string; definition?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function extractVideoId(raw: string): string | null {
  const value = raw.trim();
  if (VIDEO_ID_RE.test(value)) return value;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const watchId = url.searchParams.get("v");
      if (watchId && VIDEO_ID_RE.test(watchId)) return watchId;
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0]) && parts[1] && VIDEO_ID_RE.test(parts[1])) return parts[1];
    }
  } catch {}
  return null;
}

function parseDuration(iso = "PT0S") {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = Number(m?.[1] || 0);
  const min = Number(m?.[2] || 0);
  const s = Number(m?.[3] || 0);
  return [h, min, s]
    .filter((_, i) => h > 0 || i > 0)
    .map((v, i) => (i === 0 && h === 0 ? String(v) : String(v).padStart(2, "0")))
    .join(":");
}

export async function POST(req: NextRequest) {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured on the server." }, { status: 500 });

    const body: unknown = await req.json();
    const inputs: unknown[] =
      typeof body === "object" && body !== null && "inputs" in body && Array.isArray((body as { inputs?: unknown[] }).inputs)
        ? (body as { inputs: unknown[] }).inputs
        : [];
    const parsed = inputs.map((raw: unknown) => ({ raw: String(raw ?? "").trim(), id: extractVideoId(String(raw ?? "")) }));
    const validIds = [...new Set(parsed.map((x) => x.id).filter(Boolean) as string[])].slice(0, 50);
    const invalidInputs = parsed.filter((x) => x.raw && !x.id).map((x) => x.raw);

    if (!validIds.length) return NextResponse.json({ error: "No valid YouTube video URL or video ID was found.", invalidInputs }, { status: 400 });

    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status",
      id: validIds.join(","),
      key,
    });
    const upstream = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { cache: "no-store" });
    const data = await upstream.json();
    if (!upstream.ok) {
      const message = data?.error?.message || "YouTube API request failed.";
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    const items: YouTubeVideo[] = data.items || [];
    const found = new Set(items.map((v) => v.id));
    const unavailableIds = validIds.filter((id) => !found.has(id));

    const videos = items.map((v) => {
      const thumbs = v.snippet?.thumbnails || {};
      const thumbnail = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || "";
      return {
        id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.snippet?.title || "Untitled",
        description: v.snippet?.description || "",
        tags: v.snippet?.tags || [],
        channelTitle: v.snippet?.channelTitle || "",
        channelId: v.snippet?.channelId || "",
        publishedAt: v.snippet?.publishedAt || "",
        categoryId: v.snippet?.categoryId || "",
        defaultLanguage: v.snippet?.defaultLanguage || "",
        defaultAudioLanguage: v.snippet?.defaultAudioLanguage || "",
        thumbnail,
        duration: parseDuration(v.contentDetails?.duration),
        durationIso: v.contentDetails?.duration || "",
        definition: v.contentDetails?.definition || "",
        captionsAvailable: v.contentDetails?.caption === "true",
        views: Number(v.statistics?.viewCount || 0),
        likes: Number(v.statistics?.likeCount || 0),
        comments: Number(v.statistics?.commentCount || 0),
      };
    });

    return NextResponse.json({ videos, invalidInputs, unavailableIds });
  } catch {
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
