"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, Check, Copy, Download, ExternalLink, Eye, FileSpreadsheet,
  Gauge, Hash, Image as ImageIcon, Layers3, Lightbulb, Moon, Search, Sparkles,
  Sun, Trash2, TrendingUp, Users, WandSparkles, Youtube, X, FileText, RefreshCw
} from "lucide-react";
import * as XLSX from "xlsx";

type Video = {
  id: string; url: string; title: string; description: string; tags: string[];
  channelTitle: string; channelId: string; publishedAt: string; categoryId: string;
  defaultLanguage: string; defaultAudioLanguage: string; thumbnail: string; duration: string;
  durationIso: string; definition: string; captionsAvailable: boolean;
  views: number; likes: number; comments: number;
};

type Tab = "overview" | "videos" | "keywords" | "competitors" | "create";
type Similarity = "close" | "balanced" | "fresh";

type SeoResult = { score: number; label: string; strengths: string[]; issues: string[] };
type IdeaPack = {
  conceptSummary: string;
  mainTitle: string;
  alternativeTitles: string[];
  visualPrompts: { label: string; prompt: string }[];
  shortDescription: string;
  longDescription: string;
  metaKeywords: string[];
  hashtags: string[];
};

const fmt = new Intl.NumberFormat("en-US");
const pct = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","in","is","it","of","on","or","the","to","with",
  "your","you","this","that","these","those","my","our","any","video","youtube","music","official","hours","hour",
  "mix","playlist","best","new","2024","2025","2026","live"
]);
const INTENT_WORDS = ["study","work","focus","relax","sleep","healing","meditation","reading","coding","chill","calm"];
const CONTEXT_WORDS = ["rain","night","morning","evening","tokyo","cafe","room","bedroom","city","window","rooftop","balcony","ambient","ambience","cozy","lofi","jazz","piano","beats"];
const PLACES = ["tokyo","shibuya","city","street","apartment","bedroom","room","balcony","rooftop","cafe","coffee shop","cabin","forest","lakeside","seaside","ocean","station","metro","ramen shop"];
const TIMES = ["late night","night","early morning","morning","dawn","evening","golden hour","afternoon"];
const WEATHER = ["after the rain","rainy","rain","cloudy","snowy","misty","foggy","stormy"];
const NICHES = ["lofi hiphop","lofi","chillbeats","lofi beats","jazz","bossa nova","piano","acoustic guitar","deep house","tibetan flute","lullaby"];

function copyText(value: string) { navigator.clipboard.writeText(value); }
function ageDays(publishedAt: string) {
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return 1;
  return Math.max(1, (Date.now() - t) / 86_400_000);
}
function viewsPerDay(v: Video) { return v.views / ageDays(v.publishedAt); }
function engagementRate(v: Video) { return v.views > 0 ? ((v.likes + v.comments) / v.views) * 100 : 0; }
function tokenize(value: string) {
  return value.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
    .map(s => s.replace(/^-+|-+$/g, "")).filter(s => s.length >= 3 && !STOPWORDS.has(s));
}
function videoKeywords(v: Video) { return new Set([...tokenize(v.title), ...v.tags.flatMap(tokenize)]); }
function titleCase(value: string) { return value.replace(/\b\w/g, c => c.toUpperCase()); }
function slugHashtag(value: string) { return "#" + value.replace(/[^a-zA-Z0-9]/g, ""); }
function unique<T>(arr: T[]) { return [...new Set(arr)]; }
function safeSentence(value: string) { return value.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim(); }

function seoAnalysis(title: string): SeoResult {
  let score = 35; const strengths: string[] = []; const issues: string[] = [];
  const len = title.trim().length; const words = tokenize(title); const lower = title.toLowerCase();
  if (len >= 45 && len <= 75) { score += 22; strengths.push("Strong mobile-friendly title length"); }
  else if (len >= 35 && len <= 90) { score += 12; strengths.push("Acceptable title length"); }
  else issues.push(len < 35 ? "Title may be too short to communicate context" : "Title may truncate heavily on mobile");
  if (words.length >= 6 && words.length <= 16) { score += 10; strengths.push("Good information density"); }
  else issues.push("Word count could be more balanced");
  if (INTENT_WORDS.some(w => lower.includes(w))) { score += 12; strengths.push("Clear viewer intent/use case"); }
  else issues.push("No obvious viewer intent such as study, relax, work or sleep");
  if (CONTEXT_WORDS.some(w => lower.includes(w))) { score += 10; strengths.push("Contains a recognizable niche or atmosphere cue"); }
  else issues.push("Could use a clearer niche, place, mood or atmosphere cue");
  if (/[|•—:+]/.test(title)) { score += 5; strengths.push("Uses a readable title separator"); }
  const caps = (title.match(/[A-Z]/g) || []).length; const letters = (title.match(/[A-Za-z]/g) || []).length;
  if (letters && caps / letters > .55 && title.length > 15) { score -= 12; issues.push("Excessive capitalization may reduce readability"); }
  const normalized = words.map(w => w.replace(/s$/, ""));
  const repeats = normalized.filter((w, i) => normalized.indexOf(w) !== i);
  if (new Set(repeats).size >= 2) { score -= 8; issues.push("Several keywords are repeated in the title"); }
  if (/!{2,}|\?{2,}/.test(title)) { score -= 5; issues.push("Repeated punctuation can look spammy"); }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: score >= 85 ? "Excellent" : score >= 70 ? "Strong" : score >= 55 ? "Fair" : "Needs work", strengths, issues };
}

function phraseFromCorpus(corpus: string, candidates: string[], fallback: string) {
  const lower = corpus.toLowerCase();
  return candidates.find(c => lower.includes(c)) || fallback;
}

function hasAny(corpus: string, words: string[]) { return words.some(w => corpus.includes(w)); }

function makeIdeaPack(refs: Video[], similarity: Similarity, useCase: string, visualStyle: string, sceneRule: string, aspectRatio: string, titleCycle = 0): IdeaPack {
  const ranked = [...refs].sort((a,b) => viewsPerDay(b) - viewsPerDay(a));
  const corpus = refs.map(v => `${v.title} ${v.description.slice(0,1600)} ${v.tags.join(" ")}`).join(" ");
  const lower = corpus.toLowerCase();
  const allPhrases = refs.flatMap(v => [...tokenize(v.title), ...v.tags.flatMap(tokenize)]);
  const freq = new Map<string, number>(); allPhrases.forEach(k => freq.set(k, (freq.get(k) || 0) + 1));
  const top = [...freq.entries()].sort((a,b)=>b[1]-a[1]).map(([k])=>k).slice(0,30);

  // Semantic anchors are deliberately stronger than generic place/time fallbacks.
  const babyAudience = hasAny(lower, ["baby","babies","infant","newborn","toddler"]);
  const sleepIntent = hasAny(lower, ["sleep","asleep","insomnia","bedtime","nap","napping","deep sleep"]);
  const lullabyCue = hasAny(lower, ["lullaby","lullabies","music box","nursery"]);
  const rainSound = hasAny(lower, ["gentle rain","rain sounds","rain sound","rainfall","raining","rain"]);
  const whiteNoise = hasAny(lower, ["white noise","brown noise","pink noise"]);
  const meditation = hasAny(lower, ["meditation","meditate","mindfulness"]);
  const study = hasAny(lower, ["study","studying","focus","coding","work"]);
  const isBabySleep = babyAudience && (sleepIntent || lullabyCue);
  const isSleepAudio = sleepIntent && !hasAny(lower, ["lofi","jazz","bossa nova"]);

  const detectedUseCase = isBabySleep || sleepIntent ? "Sleep" : meditation ? "Meditation" : study ? "Study & Focus" : "Relax";
  const intent = useCase === "Auto" ? detectedUseCase : useCase;
  const explicitPlace = PLACES.find(c => lower.includes(c));
  const explicitTime = TIMES.find(c => lower.includes(c));
  const explicitWeather = WEATHER.find(c => lower.includes(c));
  const mood = lower.includes("peaceful") ? "peaceful" : lower.includes("soothing") ? "soothing" : lower.includes("gentle") ? "gentle" : lower.includes("cozy") ? "cozy" : lower.includes("calm") ? "calm" : "peaceful";

  let niche = phraseFromCorpus(corpus, NICHES, top.includes("lofi") ? "lofi" : "relaxing music");
  if (isBabySleep) niche = lullabyCue ? "baby lullaby" : "baby sleep music";
  else if (isSleepAudio && rainSound) niche = "sleep music";
  else if (whiteNoise) niche = "sleep sounds";

  const soundElements = unique([
    rainSound ? "gentle rain sounds" : "",
    whiteNoise ? "soft white noise" : "",
    lower.includes("piano") ? "soft piano" : "",
    lower.includes("music box") ? "gentle music box" : "",
    lower.includes("ocean") || lower.includes("waves") ? "ocean waves" : "",
    lower.includes("thunder") ? "distant thunder" : ""
  ].filter(Boolean));
  const soundHook = soundElements[0] || (isBabySleep ? "soft soothing ambience" : "gentle ambient sound");

  let atmosphere = lower.includes("stars") || lower.includes("starry") ? "soft starry night" : lower.includes("moon") ? "gentle moonlit ambience" : lower.includes("window") ? "quiet window ambience" : "peaceful night ambience";
  let visualScenario: string;
  let baseScenario: string;

  if (isBabySleep) {
    baseScenario = `${mood} baby bedtime with ${soundHook}`;
    visualScenario = rainSound
      ? "a peaceful baby nursery at night with a simple empty crib, soft moonlight, a rain-streaked window, gentle clouds and tiny warm night-light details"
      : "a peaceful baby nursery at night with a simple empty crib, soft moonlight, subtle stars and a warm dim night-light";
    atmosphere = rainSound ? "gentle rain and bedtime ambience" : "soft bedtime ambience";
  } else if (isSleepAudio) {
    baseScenario = `${mood} sleep atmosphere${rainSound ? " with gentle rain" : ""}`;
    visualScenario = rainSound
      ? "a quiet dark bedroom at night, soft rain outside the window, low warm bedside light, uncluttered restful composition"
      : "a quiet dark bedroom at night, soft low lighting, uncluttered restful composition";
    atmosphere = rainSound ? "gentle rain sleep ambience" : "quiet sleep ambience";
  } else {
    const place = explicitPlace || "calm setting";
    const time = explicitTime || (lower.includes("night") ? "night" : "evening");
    const weather = explicitWeather || (rainSound ? "rain" : "soft atmosphere");
    baseScenario = similarity === "fresh" ? `${mood} ${time} ${place}` : `${weather} ${place} ${time}`;
    visualScenario = `${mood} ${place} at ${time}, ${weather}`;
  }

  const nicheTitle = titleCase(niche);
  let mainTitle: string;
  let alternatives: string[];

  if (isBabySleep) {
    mainTitle = safeSentence(`Baby Sleep Music with ${titleCase(soundHook)} 🌙 | Soothing ${lullabyCue ? "Lullaby" : "Music"} for Deep Sleep & Bedtime`);
    alternatives = unique([
      `Gentle Rain Lullaby for Babies 🌧️ | Peaceful Sleep Music for Bedtime & Deep Sleep`,
      `Baby Sleep Music 🌙 ${titleCase(soundHook)} for Falling Asleep Fast & Sleeping Peacefully`,
      `Soothing Baby Lullaby with ${titleCase(soundHook)} | Calm Bedtime Music for Deep Sleep`,
      `${titleCase(soundHook)} for Baby Sleep 😴 | Gentle Bedtime Music for a Peaceful Night`,
      `Peaceful Baby Sleep Music | ${titleCase(soundHook)} + Soft Lullaby for Bedtime`
    ]).filter(t => t !== mainTitle).slice(0,5);
  } else if (isSleepAudio) {
    mainTitle = safeSentence(`${rainSound ? "Gentle Rain" : "Peaceful Night"} Sleep Music 😴 | Calm Sounds for Deep Sleep & Insomnia Relief`);
    alternatives = unique([
      `Deep Sleep Music with ${titleCase(soundHook)} | Relax, Unwind & Fall Asleep Peacefully`,
      `${titleCase(soundHook)} for Sleep 🌙 | Calm Night Music for Deep Rest`,
      `Peaceful Sleep Sounds | ${titleCase(soundHook)} for Bedtime & Insomnia Relief`,
      `Fall Asleep Peacefully 😴 | Gentle Sleep Music + ${titleCase(soundHook)}`,
      `Calm Night Sleep Music | Soft ${titleCase(soundHook)} for Restful Sleep`
    ]).filter(t => t !== mainTitle).slice(0,5);
  } else {
    const scenario = titleCase(baseScenario.replace(/\s+/g," "));
    const intentLabel = intent === "Study & Focus" ? "Study & Focus" : intent;
    mainTitle = safeSentence(`${scenario} ${nicheTitle} | ${titleCase(mood)} Music for ${intentLabel} + ${titleCase(atmosphere)}`);
    alternatives = unique([
      `${scenario} ${nicheTitle} | Gentle Music for ${intentLabel} + ${titleCase(atmosphere)}`,
      `${titleCase(mood)} ${nicheTitle} | Soft Music for ${intentLabel} + ${titleCase(atmosphere)}`,
      `${nicheTitle} for ${intentLabel} | ${scenario} + Peaceful Ambience`,
      `${scenario} | ${titleCase(mood)} ${nicheTitle} for ${intentLabel}`,
      `${titleCase(mood)} Escape ${nicheTitle} | Music for ${intentLabel} + ${titleCase(atmosphere)}`
    ]).filter(t => t !== mainTitle).slice(0,5);
  }

  // Regeneration rotates through hook/phrase banks while preserving semantic anchors.
  const cycle = ((titleCycle % 4) + 4) % 4;
  if (cycle > 0) {
    if (isBabySleep) {
      const packs = [
        [
          `Soothing Baby Sleep Music 🌙 | ${titleCase(soundHook)} for Bedtime & Deep Sleep`,
          `Baby Bedtime Lullaby with ${titleCase(soundHook)} | Gentle Music for Peaceful Sleep`,
          `Help Your Baby Sleep Peacefully 😴 | Soft Lullaby + ${titleCase(soundHook)}`,
          `Gentle Sleep Music for Babies 🌙 | Calm Bedtime Sounds + ${titleCase(soundHook)}`,
          `Peaceful Baby Lullaby | ${titleCase(soundHook)} for Naps, Bedtime & Deep Sleep`,
          `${titleCase(soundHook)} + Baby Sleep Music | Soft Nighttime Lullaby for Restful Sleep`
        ],
        [
          `Baby Lullaby for Deep Sleep 😴 | Gentle ${titleCase(soundHook)} + Peaceful Bedtime Music`,
          `Soft Baby Sleep Music with ${titleCase(soundHook)} | Calm Night Routine for Better Sleep`,
          `Bedtime Music for Babies 🌙 | Gentle Lullaby + ${titleCase(soundHook)}`,
          `Calm Baby Sleep Sounds | ${titleCase(soundHook)} for a Peaceful Bedtime`,
          `Gentle Lullaby for Babies 😴 | Soothing Music for Naps & Night Sleep`,
          `Baby Sleep Music Tonight 🌙 | Soft ${titleCase(soundHook)} for Deep, Peaceful Rest`
        ],
        [
          `Drift Into Sleep, Little One 🌙 | Gentle Baby Lullaby + ${titleCase(soundHook)}`,
          `Peaceful Bedtime for Babies | Soft Sleep Music with ${titleCase(soundHook)}`,
          `Gentle Night Lullaby 😴 | Baby Sleep Music + ${titleCase(soundHook)}`,
          `Baby Sleep Music for a Calm Night | Soothing Lullaby + ${titleCase(soundHook)}`,
          `Soft Bedtime Lullaby for Babies 🌙 | ${titleCase(soundHook)} & Deep Sleep Music`,
          `Calm Baby Bedtime Music | Gentle ${titleCase(soundHook)} for Restful Sleep`
        ]
      ];
      const pack = packs[(cycle - 1) % packs.length];
      mainTitle = safeSentence(pack[0]);
      alternatives = unique(pack.slice(1).map(safeSentence)).slice(0,5);
    } else if (isSleepAudio) {
      const packs = [
        [
          `Fall Asleep Faster 😴 | ${titleCase(soundHook)} + Calm Music for Deep Sleep`,
          `Peaceful Night Sleep Music 🌙 | ${titleCase(soundHook)} for Deep Rest`,
          `Deep Sleep Sounds with ${titleCase(soundHook)} | Relax & Unwind at Bedtime`,
          `Calm Sleep Music for Insomnia Relief | Soft ${titleCase(soundHook)}`,
          `Restful Night Music 😴 | ${titleCase(soundHook)} for Better Sleep`,
          `Bedtime Sleep Music | Gentle ${titleCase(soundHook)} + Quiet Night Ambience`
        ],
        [
          `Deep Rest Tonight 🌙 | Gentle ${titleCase(soundHook)} for Peaceful Sleep`,
          `Sleep Music for a Quiet Mind | ${titleCase(soundHook)} + Soft Night Ambience`,
          `Gentle Night Sounds 😴 | Deep Sleep Music with ${titleCase(soundHook)}`,
          `Relax Into Deep Sleep | Calm Music + ${titleCase(soundHook)}`,
          `Peaceful Bedtime Sounds 🌙 | ${titleCase(soundHook)} for Restful Sleep`,
          `Soft Sleep Music for Insomnia | Gentle ${titleCase(soundHook)} at Night`
        ],
        [
          `Let the Night Slow Down 🌙 | ${titleCase(soundHook)} for Deep Sleep`,
          `Quiet Sleep Music 😴 | Gentle ${titleCase(soundHook)} for a Restful Night`,
          `Calm Night Ambience | Deep Sleep Music + ${titleCase(soundHook)}`,
          `Drift Off Peacefully | Soft ${titleCase(soundHook)} & Bedtime Music`,
          `Deep Sleep Tonight 🌙 | Calm ${titleCase(soundHook)} for Better Rest`,
          `Peaceful Sleep Sounds | Gentle ${titleCase(soundHook)} for Nighttime Relaxation`
        ]
      ];
      const pack = packs[(cycle - 1) % packs.length];
      mainTitle = safeSentence(pack[0]);
      alternatives = unique(pack.slice(1).map(safeSentence)).slice(0,5);
    } else {
      const scenario = titleCase(baseScenario.replace(/\s+/g," "));
      const intentLabel = intent === "Study & Focus" ? "Study & Focus" : intent;
      const packs = [
        [
          `${scenario} ${nicheTitle} | ${titleCase(mood)} Sounds for ${intentLabel} + ${titleCase(atmosphere)}`,
          `${titleCase(mood)} ${scenario} | ${nicheTitle} for ${intentLabel}`,
          `${nicheTitle} in a ${scenario} | Soft Music for ${intentLabel}`,
          `${scenario} | Gentle ${nicheTitle} + ${titleCase(atmosphere)}`,
          `${titleCase(mood)} ${nicheTitle} Escape | ${scenario} for ${intentLabel}`,
          `${scenario} ${nicheTitle} | Slow, ${titleCase(mood)} Music for ${intentLabel}`
        ],
        [
          `${titleCase(mood)} ${nicheTitle} for ${intentLabel} | ${scenario} + ${titleCase(atmosphere)}`,
          `${scenario} | ${nicheTitle} to ${intentLabel === "Sleep" ? "Wind Down & Sleep" : `Stay ${intentLabel}`}`,
          `A ${titleCase(mood)} ${scenario} | Soft ${nicheTitle} for ${intentLabel}`,
          `${nicheTitle} Mood | ${scenario} + ${titleCase(atmosphere)}`,
          `${scenario} ${nicheTitle} Session | Music for ${intentLabel}`,
          `Slow ${nicheTitle} | ${scenario} for a ${titleCase(mood)} ${intentLabel} Session`
        ],
        [
          `Step Into a ${titleCase(mood)} ${scenario} | ${nicheTitle} for ${intentLabel}`,
          `${scenario} ${nicheTitle} | A Soft Soundtrack for ${intentLabel}`,
          `${titleCase(mood)} Hours in a ${scenario} | ${nicheTitle} + ${titleCase(atmosphere)}`,
          `${nicheTitle} for ${intentLabel} | A ${scenario} Soundscape`,
          `${scenario} | ${titleCase(mood)} ${nicheTitle} and Soft Ambience`,
          `Stay in the Moment | ${scenario} ${nicheTitle} for ${intentLabel}`
        ]
      ];
      const pack = packs[(cycle - 1) % packs.length];
      mainTitle = safeSentence(pack[0]);
      alternatives = unique(pack.slice(1).map(safeSentence)).slice(0,5);
    }
  }

  const referenceCue = similarity === "close"
    ? "keep the same core audience, use case, sound theme and emotional promise as the reference while changing the exact composition, props and wording"
    : similarity === "balanced"
      ? "preserve the reference's core audience, use case and sound theme, but create a clearly original scene, composition and wording"
      : "keep only the strongest semantic anchors from the reference and reinterpret them in a fresh but still relevant visual direction";
  const noPeople = sceneRule === "no people" ? "no people, peaceful empty scene" : sceneRule;
  const primaryPrompt = `${visualStyle}, ${visualScenario}, ${noPeople}, ${mood} emotional tone, visual concept aligned with ${niche} and ${intent.toLowerCase()}, ${soundHook} represented visually through the environment, soft low-distraction lighting, one clear primary focal point, strong foreground-midground-background separation, clean thumbnail-friendly composition, rule of thirds, no text, ${referenceCue}, original composition, aspect ratio ${aspectRatio}`;
  const variationPrompt = `${visualStyle}, alternative original scene for ${niche}, ${isBabySleep ? "baby bedtime and deep sleep" : intent.toLowerCase()}, ${soundHook}, ${mood} atmosphere, ${noPeople}, different camera angle and object placement, simple soothing environment, low visual distraction, atmospheric depth, no text, aspect ratio ${aspectRatio}`;
  const thumbPrompt = `${visualStyle}, YouTube music thumbnail for ${niche}, strong visual hook communicating ${isBabySleep ? "baby bedtime, peaceful sleep" : intent.toLowerCase()}, ${soundHook}, ${mood} mood, ${noPeople}, one unmistakable focal subject, simple silhouette, clean negative space, high readability at mobile size, no text, original scene, aspect ratio ${aspectRatio}`;

  const audiencePhrase = isBabySleep ? "babies and bedtime routines" : `${intent.toLowerCase()} sessions`;
  const shortDescription = isBabySleep
    ? `Create a peaceful bedtime atmosphere with soothing baby sleep music and ${soundHook}. The gentle soundscape is designed to help little ones settle down, relax, and drift into deeper sleep while the visual stays soft, calm, and low-distraction.`
    : `Settle into a ${mood} atmosphere shaped around ${niche} and ${soundHook}. This concept is designed for ${audiencePhrase}, keeping the strongest theme from the reference while presenting it with an original visual direction.`;
  const longDescription = `${shortDescription}\n\nThe visual concept uses ${visualScenario}, with soft lighting and a simple composition that supports the listening experience instead of competing with it. The strongest reference anchors—${isBabySleep ? "baby sleep, bedtime, soothing music" : niche}, ${soundHook}, and ${intent.toLowerCase()}—are intentionally preserved, while the exact layout, visual storytelling and wording remain original.\n\nUse this video during ${isBabySleep ? "bedtime, naps, or quiet nighttime routines" : intent.toLowerCase()}, or whenever a calm background atmosphere is needed. The goal is a familiar audience promise with a fresh execution.`;

  const coreTags = refs.flatMap(v => v.tags).map(t => t.toLowerCase().trim()).filter(Boolean);
  const semanticTags = isBabySleep ? [
    "baby sleep music","sleep music for babies","baby lullaby","gentle rain sounds","baby bedtime music","deep sleep for babies","soothing baby music","bedtime lullaby","calming music for babies","rain sounds for sleep"
  ] : isSleepAudio ? [
    "sleep music","deep sleep music","gentle rain sounds","rain sounds for sleep","insomnia relief","bedtime music","calm sleep sounds","relaxing sleep music"
  ] : [
    `${niche} for ${intent.toLowerCase()}`, `${mood} ${niche}`, `${soundHook}`, `${intent.toLowerCase()} music`
  ];
  const metaKeywords = unique([
    ...semanticTags,
    ...coreTags.sort((a,b) => a.length-b.length).filter(t => t.length <= 45).slice(0,16),
    ...top.slice(0,10)
  ]).filter(k => k.length >= 3 && k.length <= 50).slice(0,25);

  const hashtags = unique((isBabySleep ? [
    "#BabySleepMusic","#BabyLullaby","#SleepMusicForBabies","#BedtimeMusic","#GentleRain","#RainSounds","#DeepSleep","#SoothingMusic","#BabySleep","#Lullaby"
  ] : isSleepAudio ? [
    "#SleepMusic","#DeepSleep","#RainSounds","#GentleRain","#InsomniaRelief","#BedtimeMusic","#RelaxingMusic","#SleepSounds"
  ] : [
    slugHashtag(niche), slugHashtag(`${mood}${niche}`), slugHashtag(`${intent}music`), ...metaKeywords.slice(0,10).map(slugHashtag)
  ])).filter(h => h.length > 1).slice(0,15);

  const anchors = isBabySleep
    ? `Baby Sleep · ${rainSound ? "Gentle Rain" : "Bedtime"} · ${lullabyCue ? "Lullaby" : "Soothing Music"} · Deep Sleep`
    : `${titleCase(niche)} · ${titleCase(soundHook)} · ${intent} · ${titleCase(mood)} mood`;

  return {
    conceptSummary: `Reference anchors: ${anchors}. Similarity: ${titleCase(similarity)}. ${useCase === "Auto" ? "Use case detected automatically from the selected reference." : `Use case override: ${intent}.`}`,
    mainTitle,
    alternativeTitles: alternatives,
    visualPrompts: [
      { label: "Primary Prompt", prompt: safeSentence(primaryPrompt) },
      { label: "Alternative Prompt", prompt: safeSentence(variationPrompt) },
      { label: "Thumbnail Prompt", prompt: safeSentence(thumbPrompt) }
    ],
    shortDescription,
    longDescription,
    metaKeywords,
    hashtags
  };
}

export default function Home() {
  const [input, setInput] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dark, setDark] = useState(true);
  const [selected, setSelected] = useState<Video | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [similarity, setSimilarity] = useState<Similarity>("balanced");
  const [useCase, setUseCase] = useState("Auto");
  const [visualStyle, setVisualStyle] = useState("cinematic HD anime style");
  const [sceneRule, setSceneRule] = useState("no people");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [ideaPack, setIdeaPack] = useState<IdeaPack | null>(null);
  const [titleCycle, setTitleCycle] = useState(0);
  const [showPwaSplash, setShowPwaSplash] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("tubescout-theme"); setDark(saved !== "light");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let splashTimer: ReturnType<typeof setTimeout> | undefined;
    if (standalone) {
      setShowPwaSplash(true);
      splashTimer = setTimeout(() => setShowPwaSplash(false), 1250);
    }
    return () => { if (splashTimer) clearTimeout(splashTimer); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("tubescout-theme", dark ? "dark" : "light"); }, [dark]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase(); if (!q) return videos;
    return videos.filter(v => [v.title, v.channelTitle, v.description, v.tags.join(" ")].join(" ").toLowerCase().includes(q));
  }, [videos, query]);
  const analyzed = useMemo(() => videos.map(v => ({ ...v, seo: seoAnalysis(v.title), viewsPerDay: viewsPerDay(v), engagement: engagementRate(v) })), [videos]);
  const selectedRefs = useMemo(() => videos.filter(v => selectedIds.includes(v.id)), [videos, selectedIds]);
  const keywordStats = useMemo(() => {
    const map = new Map<string, { count:number; videos:Set<string>; sources:Set<string> }>();
    videos.forEach(v => { const seen = new Set<string>(); v.tags.forEach(tag => { const key=tag.trim().toLowerCase(); if(!key||seen.has(key)) return; seen.add(key); const x=map.get(key)||{count:0,videos:new Set<string>(),sources:new Set<string>()}; x.count++; x.videos.add(v.id); x.sources.add(v.channelTitle); map.set(key,x); }); });
    return [...map.entries()].map(([keyword,x])=>({keyword,count:x.count,videoCoverage:videos.length?x.videos.size/videos.length*100:0,channels:x.sources.size})).sort((a,b)=>b.count-a.count||b.videoCoverage-a.videoCoverage).slice(0,50);
  }, [videos]);
  const overlapStats = useMemo(() => {
    const sets=videos.map(v=>({v,set:videoKeywords(v)})); const rows:{a:Video;b:Video;score:number;common:string[]}[]=[];
    for(let i=0;i<sets.length;i++) for(let j=i+1;j<sets.length;j++){const common=[...sets[i].set].filter(k=>sets[j].set.has(k));const union=new Set([...sets[i].set,...sets[j].set]);rows.push({a:sets[i].v,b:sets[j].v,score:union.size?common.length/union.size*100:0,common:common.slice(0,8)});} return rows.sort((a,b)=>b.score-a.score).slice(0,20);
  }, [videos]);
  const competitors = useMemo(() => {
    const groups=new Map<string,Video[]>(); videos.forEach(v=>groups.set(v.channelId||v.channelTitle,[...(groups.get(v.channelId||v.channelTitle)||[]),v]));
    return [...groups.entries()].map(([id,list])=>{const avg=(fn:(v:Video)=>number)=>list.reduce((s,v)=>s+fn(v),0)/Math.max(1,list.length);return{id,channel:list[0]?.channelTitle||"Unknown channel",videos:list.length,totalViews:list.reduce((s,v)=>s+v.views,0),avgViews:avg(v=>v.views),avgViewsDay:avg(viewsPerDay),avgEngagement:avg(engagementRate),avgSeo:avg(v=>seoAnalysis(v.title).score),uniqueTags:new Set(list.flatMap(v=>v.tags.map(t=>t.toLowerCase()))).size};}).sort((a,b)=>b.avgViewsDay-a.avgViewsDay);
  }, [videos]);
  const summary = useMemo(() => {
    if(!analyzed.length) return null; const avg=(x:number[])=>x.reduce((a,b)=>a+b,0)/x.length;
    return{videos:analyzed.length,channels:new Set(analyzed.map(v=>v.channelId||v.channelTitle)).size,avgViewsDay:avg(analyzed.map(v=>v.viewsPerDay)),avgEngagement:avg(analyzed.map(v=>v.engagement)),avgSeo:avg(analyzed.map(v=>v.seo.score)),totalTags:new Set(analyzed.flatMap(v=>v.tags.map(t=>t.toLowerCase()))).size};
  }, [analyzed]);

  async function extract() {
    setError(""); setNotice(""); const inputs=input.split(/\n|,/).map(s=>s.trim()).filter(Boolean);
    if(!inputs.length) return setError("Paste at least one YouTube URL or video ID.");
    if(inputs.length>50) return setError("Maximum 50 video URLs / IDs per batch.");
    setLoading(true);
    try { const res=await fetch("/api/videos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({inputs})}); const data=await res.json(); if(!res.ok) throw new Error(data.error||"Unable to extract metadata."); setVideos(data.videos||[]); setSelectedIds([]); setIdeaPack(null); setTitleCycle(0); setTab("overview"); const warnings=[]; if(data.invalidInputs?.length)warnings.push(`${data.invalidInputs.length} invalid input(s)`); if(data.unavailableIds?.length)warnings.push(`${data.unavailableIds.length} unavailable/private video(s)`); setNotice(warnings.length?`Loaded ${data.videos.length} video(s). ${warnings.join(" · ")}.`:`Loaded ${data.videos.length} video(s).`); }
    catch(e){setError(e instanceof Error?e.message:"Something went wrong.");} finally{setLoading(false);}
  }
  function toggleReference(id:string){ setSelectedIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):ids.length>=5?ids:[...ids,id]); setIdeaPack(null); setTitleCycle(0); }
  function generateIdea(){ if(!selectedRefs.length){setError("Select 1–5 reference videos first.");setTab("videos");return;} setError(""); setTitleCycle(0); setIdeaPack(makeIdeaPack(selectedRefs,similarity,useCase,visualStyle,sceneRule,aspectRatio,0)); setTab("create"); }
  function regenerateTitle(){ if(!selectedRefs.length||!ideaPack)return; const next=titleCycle+1; const regenerated=makeIdeaPack(selectedRefs,similarity,useCase,visualStyle,sceneRule,aspectRatio,next); setTitleCycle(next); setIdeaPack(prev=>prev?{...prev,mainTitle:regenerated.mainTitle,alternativeTitles:regenerated.alternativeTitles}:regenerated); setNotice("Title variations regenerated from the same semantic reference anchors."); }

  function exportRows(){return filtered.map((v,i)=>({No:i+1,"Video Title":v.title,"Video URL":v.url,"Video ID":v.id,Channel:v.channelTitle,"Channel ID":v.channelId,Published:v.publishedAt,Duration:v.duration,Views:v.views,"Views / Day":Math.round(viewsPerDay(v)),Likes:v.likes,Comments:v.comments,"Engagement Rate %":Number(engagementRate(v).toFixed(3)),"SEO Title Score":seoAnalysis(v.title).score,Tags:v.tags.join(", "),Description:v.description,CategoryID:v.categoryId,Definition:v.definition,Captions:v.captionsAvailable?"Yes":"No"}));}
  function exportXlsx(){const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(exportRows());ws["!cols"]=[{wch:5},{wch:48},{wch:42},{wch:14},{wch:28},{wch:28},{wch:24},{wch:12},{wch:14},{wch:14},{wch:12},{wch:12},{wch:18},{wch:16},{wch:60},{wch:80},{wch:12},{wch:12},{wch:10}];XLSX.utils.book_append_sheet(wb,ws,"Video Research");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(keywordStats.map((k,i)=>({Rank:i+1,Tag:k.keyword,"Video Count":k.count,"Coverage %":Number(k.videoCoverage.toFixed(1)),Channels:k.channels}))),"Tag Frequency");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(competitors.map((c,i)=>({Rank:i+1,Channel:c.channel,Videos:c.videos,"Total Views":c.totalViews,"Avg Views":Math.round(c.avgViews),"Avg Views Day":Math.round(c.avgViewsDay),"Engagement %":Number(c.avgEngagement.toFixed(3)),"Avg SEO":Math.round(c.avgSeo),"Unique Tags":c.uniqueTags}))),"Competitors");XLSX.writeFile(wb,`tubescout-research-${new Date().toISOString().slice(0,10)}.xlsx`);}
  function exportIdeaPack(){if(!ideaPack)return;const content=["TUBESCOUT — SCOUT TO CREATE","",ideaPack.conceptSummary,"","MAIN TITLE",ideaPack.mainTitle,"","ALTERNATIVE TITLES",...ideaPack.alternativeTitles.map((t,i)=>`${i+1}. ${t}`),"","VISUAL PROMPTS",...ideaPack.visualPrompts.flatMap(p=>[p.label,p.prompt,""]),"SHORT DESCRIPTION",ideaPack.shortDescription,"","FULL DESCRIPTION",ideaPack.longDescription,"","META KEYWORDS",ideaPack.metaKeywords.join(", "),"","HASHTAGS",ideaPack.hashtags.join(" ")].join("\n");const blob=new Blob([content],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`tubescout-idea-pack-${new Date().toISOString().slice(0,10)}.txt`;a.click();URL.revokeObjectURL(url);}
  function copyAll(){copyText(filtered.map(v=>`${v.title}\n${v.url}\nChannel: ${v.channelTitle}\nViews: ${v.views}\nViews/day: ${Math.round(viewsPerDay(v))}\nEngagement: ${engagementRate(v).toFixed(2)}%\nSEO score: ${seoAnalysis(v.title).score}/100\nTags: ${v.tags.join(", ")}\n\n${v.description}`).join("\n\n----------------\n\n"));setNotice("Metadata and analysis copied to clipboard.");}

  return <main className="shell">
    {showPwaSplash&&<div className="pwaSplash" aria-hidden="true"><img src="/splash-screen.png" alt=""/></div>}
    <header className="topbar">
      <div className="brand"><img src="/tubescout-mark.png" alt="TubeScout"/><div><h1>TubeScout</h1><span>YouTube Competitor Research Tool</span></div></div>
      <div className="topActions"><span className="versionPill">v1.3.5</span><button className="iconBtn" onClick={()=>setDark(v=>!v)} aria-label="Toggle theme">{dark?<Sun size={18}/>:<Moon size={18}/>}</button></div>
    </header>

    <section className="hero">
      <div className="eyebrow"><Eye size={15}/> COMPETITOR INTELLIGENCE → CONTENT CREATION</div>
      <div className="heroTitle"><div><h2>Scout the pattern.<br/><em>Create your own angle.</em></h2><p>Research public YouTube metadata, discover repeatable competitor patterns, then turn selected references into an original title, visual concept, description, keywords and hashtags.</p></div></div>
    </section>

    <section className="inputCard">
      <div className="cardHead"><div><h2>Video Research</h2><p>Paste up to 50 YouTube URLs or video IDs, one per line.</p></div><span className="limit">BULK · 50 MAX</span></div>
      <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder={'https://youtube.com/watch?v=...\nhttps://youtu.be/...\nVIDEO_ID'} />
      <div className="actions"><button className="primary" onClick={extract} disabled={loading}>{loading?<span className="spinner"/>:<Search size={18}/>} {loading?"Scouting videos...":"Scout & Analyze"}</button><button className="secondary" onClick={()=>{setInput("");setVideos([]);setError("");setNotice("");setQuery("");setSelectedIds([]);setIdeaPack(null);}}><Trash2 size={17}/> Clear</button></div>
      {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
    </section>

    <section className="results">
      <div className="resultsTop"><div><h2>Research Workspace <span>{videos.length}</span></h2><p>Metadata + TubeScout intelligence calculated from the selected videos.</p></div>{videos.length>0&&<div className="toolbar"><label className="searchBox"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search results"/></label><button onClick={copyAll}><Copy size={16}/> Copy</button><button onClick={exportXlsx}><FileSpreadsheet size={16}/> XLSX</button></div>}</div>

      {videos.length===0?<div className="empty"><div className="radar"><Search size={26}/></div><h3>No research data yet</h3><p>Paste YouTube video URLs above to start competitor analysis.</p></div>:<>
        <nav className="tabs" aria-label="Research views">
          <button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}><BarChart3 size={16}/> Overview</button>
          <button className={tab==="videos"?"active":""} onClick={()=>setTab("videos")}><Youtube size={16}/> Videos</button>
          <button className={tab==="keywords"?"active":""} onClick={()=>setTab("keywords")}><Hash size={16}/> Keywords</button>
          <button className={tab==="competitors"?"active":""} onClick={()=>setTab("competitors")}><Users size={16}/> Competitors</button>
          <button className={tab==="create"?"active createTab":"createTab"} onClick={()=>setTab("create")}><WandSparkles size={16}/> Create <span>{selectedIds.length}</span></button>
        </nav>

        {tab==="overview"&&summary&&<div className="tabPanel">
          <div className="kpiGrid"><div className="kpi"><span><Youtube size={17}/></span><small>Videos analyzed</small><b>{summary.videos}</b><em>{summary.channels} channel{summary.channels===1?"":"s"}</em></div><div className="kpi"><span><TrendingUp size={17}/></span><small>Avg views / day</small><b>{compact.format(summary.avgViewsDay)}</b><em>Velocity benchmark</em></div><div className="kpi"><span><Activity size={17}/></span><small>Avg engagement</small><b>{pct.format(summary.avgEngagement)}%</b><em>Likes + comments / views</em></div><div className="kpi"><span><Gauge size={17}/></span><small>Avg title SEO</small><b>{Math.round(summary.avgSeo)}/100</b><em>TubeScout structural score</em></div><div className="kpi"><span><Hash size={17}/></span><small>Unique public tags</small><b>{summary.totalTags}</b><em>Across this research set</em></div></div>
          <div className="overviewGrid"><section className="insightCard"><div className="sectionHead"><div><h3>Top Performing Videos</h3><p>Ranked by current views-per-day velocity.</p></div><TrendingUp size={18}/></div><div className="rankList">{[...analyzed].sort((a,b)=>b.viewsPerDay-a.viewsPerDay).slice(0,5).map((v,i)=><button key={v.id} onClick={()=>setSelected(v)}><span className="rank">#{i+1}</span><div><strong>{v.title}</strong><small>{v.channelTitle}</small></div><b>{compact.format(v.viewsPerDay)}/day</b></button>)}</div></section><section className="insightCard"><div className="sectionHead"><div><h3>Most Repeated Tags</h3><p>Public tags used across multiple researched videos.</p></div><Hash size={18}/></div><div className="frequencyList">{keywordStats.length?keywordStats.slice(0,8).map(k=><div key={k.keyword}><div><strong>{k.keyword}</strong><small>{k.count} video{k.count===1?"":"s"}</small></div><div className="bar"><i style={{width:`${Math.max(5,k.videoCoverage)}%`}}/></div><b>{Math.round(k.videoCoverage)}%</b></div>):<p className="mutedText">No public tags were returned for these videos.</p>}</div></section></div>
          {overlapStats.length>0&&<section className="insightCard full"><div className="sectionHead"><div><h3>Highest Keyword Overlap</h3><p>Title + tag similarity. High overlap can reveal repeated competitor topic patterns.</p></div><Layers3 size={18}/></div><div className="overlapGrid">{overlapStats.slice(0,4).map(o=><div className="overlapCard" key={`${o.a.id}-${o.b.id}`}><div className="overlapScore">{Math.round(o.score)}%</div><strong>{o.a.title}</strong><span>↕</span><strong>{o.b.title}</strong><div className="miniTags">{o.common.length?o.common.map(k=><em key={k}>{k}</em>):<em>No shared keywords</em>}</div></div>)}</div></section>}
        </div>}

        {tab==="videos"&&<div className="tabPanel"><div className="selectionBar"><div><strong>{selectedIds.length}/5 references selected</strong><span>Select videos you want TubeScout to use as concept references.</span></div><button className="primary compactBtn" onClick={generateIdea} disabled={!selectedIds.length}><WandSparkles size={16}/> Generate Similar Concept</button></div><div className="grid">{filtered.map(v=>{const seo=seoAnalysis(v.title);const isRef=selectedIds.includes(v.id);return <article className={`videoCard ${isRef?"selectedRef":""}`} key={v.id}><button className={`referenceToggle ${isRef?"on":""}`} onClick={()=>toggleReference(v.id)}>{isRef?<Check size={15}/>:<Sparkles size={15}/>} {isRef?"Reference selected":"Use as reference"}</button><div className="thumb"><img src={v.thumbnail} alt=""/><span>{v.duration}</span><div className={`seoBadge ${seo.score>=70?"good":seo.score>=55?"fair":"low"}`}>SEO {seo.score}</div></div><div className="videoBody"><div className="channel">{v.channelTitle}</div><h3>{v.title}</h3><div className="metricStrip"><div><b>{compact.format(v.views)}</b><small>Views</small></div><div><b>{compact.format(viewsPerDay(v))}</b><small>Views/day</small></div><div><b>{pct.format(engagementRate(v))}%</b><small>Engagement</small></div></div><div className="tags">{v.tags.length?v.tags.slice(0,4).map(t=><span key={t}>{t}</span>):<span>No public tags</span>}</div><div className="cardActions"><button onClick={()=>setSelected(v)}>View analysis</button><a href={v.url} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a></div></div></article>})}</div></div>}

        {tab==="keywords"&&<div className="tabPanel analyticsGrid"><section className="insightCard"><div className="sectionHead"><div><h3>Tag Frequency</h3><p>Exact public-tag reuse across the selected videos.</p></div><Hash size={18}/></div>{keywordStats.length?<div className="dataTable"><div className="tr th"><span>Tag</span><span>Videos</span><span>Coverage</span></div>{keywordStats.map(k=><div className="tr" key={k.keyword}><span><strong>{k.keyword}</strong><small>{k.channels} channel{k.channels===1?"":"s"}</small></span><span>{k.count}</span><span>{pct.format(k.videoCoverage)}%</span></div>)}</div>:<p className="mutedText">No public tags available.</p>}</section><section className="insightCard"><div className="sectionHead"><div><h3>Keyword Overlap</h3><p>Jaccard similarity from normalized title words + public tags.</p></div><Layers3 size={18}/></div><div className="overlapList">{overlapStats.length?overlapStats.map(o=><div key={`${o.a.id}-${o.b.id}`}><b>{Math.round(o.score)}%</b><div><strong>{o.a.title}</strong><span>{o.b.title}</span><small>{o.common.length?`Shared: ${o.common.join(", ")}`:"No meaningful shared keyword"}</small></div></div>):<p className="mutedText">Add at least two videos to calculate overlap.</p>}</div></section></div>}

        {tab==="competitors"&&<div className="tabPanel"><section className="insightCard full"><div className="sectionHead"><div><h3>Competitor Comparison</h3><p>Channel-level aggregates from the videos in your current research batch.</p></div><Users size={18}/></div><div className="competitorTable"><div className="compRow compHead"><span>Channel</span><span>Videos</span><span>Avg views</span><span>Views/day</span><span>Engagement</span><span>SEO</span><span>Tags</span></div>{competitors.map((c,i)=><div className="compRow" key={c.id}><span><i>#{i+1}</i><strong>{c.channel}</strong></span><span>{c.videos}</span><span>{compact.format(c.avgViews)}</span><span className="positive">{compact.format(c.avgViewsDay)}</span><span>{pct.format(c.avgEngagement)}%</span><span>{Math.round(c.avgSeo)}</span><span>{c.uniqueTags}</span></div>)}</div></section></div>}

        {tab==="create"&&<div className="tabPanel createWorkspace">
          <section className="createSetup"><div className="sectionHead"><div><h3>Scout to Create</h3><p>Turn 1–5 researched videos into a new original content direction.</p></div><WandSparkles size={19}/></div>
            <div className="referenceChips">{selectedRefs.length?selectedRefs.map(v=><div key={v.id}><img src={v.thumbnail} alt=""/><span>{v.title}</span><button onClick={()=>toggleReference(v.id)}><X size={14}/></button></div>):<div className="noRefs"><Lightbulb size={20}/><span>Select reference videos from the <button onClick={()=>setTab("videos")}>Videos</button> tab first.</span></div>}</div>
            <div className="formGrid"><label><span>Similarity Level</span><select value={similarity} onChange={e=>setSimilarity(e.target.value as Similarity)}><option value="close">Close — familiar pattern</option><option value="balanced">Balanced — recommended</option><option value="fresh">Fresh — wider reinterpretation</option></select></label><label><span>Use Case</span><select value={useCase} onChange={e=>setUseCase(e.target.value)}><option value="Auto">Auto from reference</option><option>Study</option><option>Work</option><option>Relax</option><option>Focus</option><option>Sleep</option><option>Meditation</option></select></label><label><span>Visual Style</span><select value={visualStyle} onChange={e=>setVisualStyle(e.target.value)}><option>cinematic HD anime style</option><option>Ghibli-inspired anime style</option><option>3D Pixar style</option><option>Story book art style</option><option>2D cartoon style</option><option>hyper realistic cinematic photography</option><option>cozy digital illustration</option><option>dark cinematic anime style</option></select></label><label><span>Scene Rule</span><select value={sceneRule} onChange={e=>setSceneRule(e.target.value)}><option value="no people">No people</option><option value="indoor scene, no people">Indoor only</option><option value="outdoor scene, no people">Outdoor only</option><option value="rainy atmosphere, no people">Rainy atmosphere</option><option value="after-rain atmosphere, no people">After rain</option></select></label><label><span>Aspect Ratio</span><select value={aspectRatio} onChange={e=>setAspectRatio(e.target.value)}><option>16:9</option><option>1:1</option><option>9:16</option></select></label></div>
            <button className="primary wideGenerate" onClick={generateIdea} disabled={!selectedRefs.length}><WandSparkles size={18}/> Generate Idea Pack</button>
            <div className="originalityNote"><Sparkles size={16}/><p>TubeScout extracts patterns, not copies. The generated direction intentionally changes composition, props and visual storytelling to help you create a distinct new video.</p></div>
          </section>

          {ideaPack?<section className="ideaResults"><div className="ideaHeader"><div><span>GENERATED IDEA PACK</span><h2>Ready for production</h2><p>{ideaPack.conceptSummary}</p></div><button onClick={exportIdeaPack}><Download size={16}/> Export Idea Pack</button></div>
            <div className="ideaBlock titleBlock"><div className="ideaBlockHead"><div><Sparkles size={18}/><h3>Title Ideas</h3></div><div className="ideaHeadActions"><button onClick={regenerateTitle}><RefreshCw size={15}/> Regenerate Title</button><button onClick={()=>copyText([ideaPack.mainTitle,...ideaPack.alternativeTitles].join("\n"))}><Copy size={15}/> Copy Titles</button></div></div><div className="mainIdeaTitle"><span>MAIN TITLE · SEO {seoAnalysis(ideaPack.mainTitle).score}/100</span><strong>{ideaPack.mainTitle}</strong></div><div className="altTitles">{ideaPack.alternativeTitles.map((t,i)=><div key={t}><span>0{i+1}</span><p>{t}</p><button onClick={()=>copyText(t)}><Copy size={14}/></button></div>)}</div></div>
            <div className="ideaBlock"><div className="ideaBlockHead"><div><ImageIcon size={18}/><h3>Visual Prompts</h3></div><button onClick={()=>copyText(ideaPack.visualPrompts.map(p=>`${p.label}\n${p.prompt}`).join("\n\n"))}><Copy size={15}/> Copy Prompts</button></div><div className="promptGrid">{ideaPack.visualPrompts.map(p=><article key={p.label}><span>{p.label}</span><p>{p.prompt}</p><button onClick={()=>copyText(p.prompt)}><Copy size={14}/> Copy</button></article>)}</div></div>
            <div className="ideaBlock"><div className="ideaBlockHead"><div><FileText size={18}/><h3>Video Description</h3></div><button onClick={()=>copyText(ideaPack.longDescription)}><Copy size={15}/> Copy Full</button></div><div className="descriptionGrid"><article><span>SHORT HOOK</span><p>{ideaPack.shortDescription}</p></article><article><span>FULL SEO DESCRIPTION</span><p>{ideaPack.longDescription}</p></article></div></div>
            <div className="ideaSplit"><div className="ideaBlock"><div className="ideaBlockHead"><div><Hash size={18}/><h3>Meta Tag Keywords</h3></div><button onClick={()=>copyText(ideaPack.metaKeywords.join(", "))}><Copy size={15}/> Copy</button></div><div className="keywordCloud">{ideaPack.metaKeywords.map(k=><span key={k}>{k}</span>)}</div></div><div className="ideaBlock"><div className="ideaBlockHead"><div><Hash size={18}/><h3>Hashtags</h3></div><button onClick={()=>copyText(ideaPack.hashtags.join(" "))}><Copy size={15}/> Copy</button></div><div className="keywordCloud hashtags">{ideaPack.hashtags.map(k=><span key={k}>{k}</span>)}</div></div></div>
          </section>:<div className="createEmpty"><WandSparkles size={28}/><h3>Your Idea Pack will appear here</h3><p>Select reference videos, tune the controls, then generate a new production-ready concept.</p></div>}
        </div>}
      </>}
    </section>

    {selected&&(()=>{const seo=seoAnalysis(selected.title);return <div className="modalBackdrop" onMouseDown={()=>setSelected(null)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modalHead"><div><div className="channel">{selected.channelTitle}</div><h2>{selected.title}</h2></div><button onClick={()=>setSelected(null)}><X size={20}/></button></div><div className="scoreHero"><div className="scoreRing"><b>{seo.score}</b><small>/100</small></div><div><span>TubeScout Title Analysis</span><h3>{seo.label}</h3><p>Heuristic structural score — not an official YouTube ranking metric.</p></div></div><div className="seoNotes"><div><h4><Check size={15}/> Strengths</h4>{seo.strengths.length?seo.strengths.map(x=><p key={x}>• {x}</p>):<p>No major structural strength detected.</p>}</div><div><h4><Lightbulb size={15}/> Opportunities</h4>{seo.issues.length?seo.issues.map(x=><p key={x}>• {x}</p>):<p>No major issue detected.</p>}</div></div><div className="metaGrid"><div><small>Views</small><b>{fmt.format(selected.views)}</b></div><div><small>Views / day</small><b>{fmt.format(Math.round(viewsPerDay(selected)))}</b></div><div><small>Engagement</small><b>{pct.format(engagementRate(selected))}%</b></div><div><small>Published</small><b>{selected.publishedAt?new Date(selected.publishedAt).toLocaleDateString():"—"}</b></div></div><div className="detail"><div className="detailTitle"><h3>Public Tags <span>({selected.tags.length})</span></h3><button onClick={()=>copyText(selected.tags.join(", "))}>Copy tags</button></div><div className="allTags">{selected.tags.length?selected.tags.map(t=><span key={t}>{t}</span>):<span className="mutedText">No public tags.</span>}</div></div><div className="detail"><div className="detailTitle"><h3>Description</h3><button onClick={()=>copyText(selected.description)}>Copy description</button></div><pre>{selected.description||"No public description."}</pre></div></div></div>})()}

    <footer><span>© {new Date().getFullYear()} Created by Santanu Saputra</span></footer>
  </main>;
}
