#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const videosDir = join(root, "videos");
const buildDir = join(videosDir, ".build");
const audioDir = join(buildDir, "audio");
const frameDir = join(buildDir, "frames");
const segmentDir = join(buildDir, "segments");
const posterDir = join(videosDir, "posters");
const subtitleDir = join(videosDir, "subtitles");

const firstAvailable = (paths, fallback) => paths.find(existsSync) || fallback;
const ffmpeg = process.env.FFMPEG || firstAvailable([
  "/tmp/japan-video-tools/node_modules/@ffmpeg-installer/linux-x64/ffmpeg",
], "ffmpeg");
const ffprobe = process.env.FFPROBE || firstAvailable([
  "/tmp/japan-video-tools/node_modules/@ffprobe-installer/linux-x64/ffprobe",
], "ffprobe");
const edgeTts = process.env.EDGE_TTS || firstAvailable([
  "/tmp/japan-video-tools/venv/bin/edge-tts",
], "edge-tts");
const magick = process.env.MAGICK || firstAvailable([
  "/home/linuxbrew/.linuxbrew/bin/magick",
], "magick");
const chrome = process.env.CHROME || "google-chrome";
const args = new Set(process.argv.slice(2));
const clean = args.has("--clean");
const framesOnly = args.has("--frames-only");
const selected = [...args].find((arg) => arg.startsWith("--lesson="))?.split("=")[1];

if (clean) rmSync(buildDir, { recursive: true, force: true });
for (const dir of [audioDir, frameDir, segmentDir, posterDir, subtitleDir]) {
  mkdirSync(dir, { recursive: true });
}

const lessons = JSON.parse(readFileSync(join(videosDir, "lessons.json"), "utf8"));
const activeLessons = selected
  ? lessons.filter((lesson) => lesson.lesson === selected || lesson.id === selected)
  : lessons;

if (!activeLessons.length) {
  throw new Error(`No lesson matched: ${selected}`);
}

const mascotFiles = {
  intro: join(videosDir, "assets", "mascot-dance-sticker.png"),
  ja: join(videosDir, "assets", "mascot-cheer-sticker.png"),
  ko: join(videosDir, "assets", "mascot-nyamnyam-sticker.png"),
  outro: join(videosDir, "assets", "mascot-giggle-sticker.png"),
};

const run = (bin, commandArgs, options = {}) => {
  const result = spawnSync(bin, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit",
    timeout: options.timeout || 180_000,
  });
  if (result.status !== 0 || (result.error && result.status == null)) {
    const detail = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n");
    throw new Error(`${bin} failed (${result.status ?? "spawn"})\n${detail}`);
  }
  return result.stdout || "";
};

const xml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const wrap = (text, limit) => {
  const chars = [...String(text)];
  if (chars.length <= limit) return [text];
  const lines = [];
  while (chars.length) lines.push(chars.splice(0, limit).join(""));
  return lines.slice(0, 2);
};

const tspans = (lines, x, y, lineHeight) => lines
  .map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}">${xml(line)}</tspan>`)
  .join("");

const flowers = `
  <g opacity=".72">
    <g transform="translate(1135 92) scale(1.15)" fill="#F3A9C4">
      <ellipse rx="17" ry="28" transform="rotate(0) translate(0 -22)"/>
      <ellipse rx="17" ry="28" transform="rotate(72) translate(0 -22)"/>
      <ellipse rx="17" ry="28" transform="rotate(144) translate(0 -22)"/>
      <ellipse rx="17" ry="28" transform="rotate(216) translate(0 -22)"/>
      <ellipse rx="17" ry="28" transform="rotate(288) translate(0 -22)"/>
      <circle r="8" fill="#F4C24A"/>
    </g>
    <g transform="translate(1190 155) scale(.52)" fill="#F7CBDE">
      <ellipse rx="17" ry="28" transform="rotate(0) translate(0 -22)"/>
      <ellipse rx="17" ry="28" transform="rotate(72) translate(0 -22)"/>
      <ellipse rx="17" ry="28" transform="rotate(144) translate(0 -22)"/>
      <ellipse rx="17" ry="28" transform="rotate(216) translate(0 -22)"/>
      <ellipse rx="17" ry="28" transform="rotate(288) translate(0 -22)"/>
    </g>
  </g>`;

function frameSvg(lesson, state) {
  const accent = lesson.accent;
  const label = `LESSON ${lesson.lesson}  ·  ${lesson.scene}`;
  let content = "";

  if (state.kind === "intro") {
    const titleSize = [...lesson.title].length > 11 ? 56 : 64;
    content = `
      <text x="84" y="190" class="eyebrow" fill="${accent}">${xml(label)}</text>
      <text x="82" y="284" class="title" font-size="${titleSize}">${xml(lesson.title)}</text>
      <text x="84" y="352" class="jp" font-size="42" fill="#C2527E">${xml(lesson.titleJa)}</text>
      <g transform="translate(82 408)">
        ${lesson.focus.map((focus, index) => {
          const x = index * 230;
          return `<rect x="${x}" y="0" width="210" height="54" rx="27" fill="#FFFFFF" stroke="#F6C9DC" stroke-width="2"/>
            <text x="${x + 105}" y="35" text-anchor="middle" class="chip">${xml(focus)}</text>`;
        }).join("")}
      </g>
      <text x="84" y="548" class="body" fill="#8B6175">일본어를 먼저 듣고, 한국어 뜻으로 확인해요.</text>
      <text x="84" y="607" class="brand">初級日本語  ·  SITUATION LISTENING</text>`;
  } else if (state.kind === "outro") {
    content = `
      <text x="84" y="210" class="eyebrow" fill="${accent}">${xml(label)}</text>
      <text x="82" y="325" class="title" font-size="70">잘했어요!</text>
      <text x="84" y="410" class="jp" font-size="43" fill="#C2527E">もう一度、聞いてみましょう。</text>
      <text x="84" y="485" class="body" fill="#8B6175">문형 화면과 퀴즈에서 바로 복습할 수 있어요.</text>
      <text x="84" y="607" class="brand">初級日本語  ·  LESSON ${lesson.lesson}</text>`;
  } else {
    const line = lesson.lines[state.index];
    const jaLength = [...line.ja].length;
    const jaLines = jaLength <= 20 ? [line.ja] : wrap(line.ja, 16);
    const koText = state.phase === "ja" ? "뜻을 떠올린 다음 한국어로 확인해 보세요." : line.ko;
    const koLines = wrap(koText, 26);
    const jaSize = jaLines.length > 1
      ? 40
      : Math.max(34, Math.min(58, Math.floor(650 / Math.max(1, jaLength))));
    const koSize = [...koText].length > 30 ? 25 : 29;
    const speaker = line.speaker === "A" ? "A · 질문" : line.speaker === "B" ? "B · 대답" : "발음 · 예문";
    content = `
      <text x="84" y="105" class="eyebrow" fill="${accent}">${xml(label)}</text>
      <rect x="92" y="148" width="762" height="442" rx="34" fill="#F3A9C4" opacity=".22"/>
      <rect x="82" y="136" width="762" height="442" rx="34" fill="#FFFFFF" stroke="#F6C9DC" stroke-width="2"/>
      <rect x="116" y="170" width="150" height="43" rx="21.5" fill="${accent}"/>
      <text x="191" y="198" text-anchor="middle" class="speaker" fill="#FFFFFF">${xml(speaker)}</text>
      <text x="790" y="199" text-anchor="end" class="counter">${state.index + 1} / ${lesson.lines.length}</text>
      <text class="jp" font-size="${jaSize}" fill="#6E3A54">${tspans(jaLines, 116, 308, 72)}</text>
      <line x1="116" y1="410" x2="808" y2="410" stroke="#F7CBDE" stroke-width="2" stroke-dasharray="7 9"/>
      <text class="ko" font-size="${koSize}" fill="${state.phase === "ja" ? "#C69AAD" : "#543344"}">${tspans(koLines, 116, 466, 42)}</text>
      <text x="84" y="637" class="brand">初級日本語  ·  ${state.phase === "ja" ? "LISTEN" : "MEANING"}</text>
      <g transform="translate(574 615)">
        ${lesson.lines.map((_, index) => `<rect x="${index * 58}" y="0" width="44" height="8" rx="4" fill="${index === state.index ? accent : "#F7CBDE"}"/>`).join("")}
      </g>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <style>
        text{font-family:'Noto Sans KR','Malgun Gothic','Noto Sans JP',sans-serif;letter-spacing:0}
        .title{font-weight:800;fill:#543344}
        .jp{font-weight:700}
        .ko{font-weight:600}
        .body{font-size:27px;font-weight:500}
        .eyebrow{font-size:21px;font-weight:800}
        .chip{font-size:20px;font-weight:700;fill:#6E3A54}
        .speaker{font-size:18px;font-weight:800}
        .counter{font-size:18px;font-weight:800;fill:#C69AAD}
        .brand{font-size:17px;font-weight:800;fill:#C2527E}
      </style>
    </defs>
    <rect width="1280" height="720" fill="#FFF6FA"/>
    <path d="M0 640 C220 590 350 700 560 655 C760 612 880 690 1030 648 C1140 618 1215 625 1280 600 L1280 720 L0 720Z" fill="#FCE6EF"/>
    <path d="M0 0 H1280 V15 H0Z" fill="${accent}"/>
    ${flowers}
    <g opacity=".7" fill="#F3A9C4">
      <path d="M40 82 l9 18 20 3-15 14 4 20-18-10-18 10 4-20-15-14 20-3z"/>
      <path d="M1018 575 l6 12 14 2-10 10 2 14-12-7-13 7 3-14-11-10 15-2z"/>
    </g>
    ${content}
  </svg>`;
}

function renderFrame(lesson, state, output) {
  const suffix = state.kind === "line" ? `-${state.index + 1}-${state.phase}` : `-${state.kind}`;
  const svgPath = join(frameDir, `${lesson.id}${suffix}.svg`);
  const rawPath = `${output}.raw.png`;
  writeFileSync(svgPath, frameSvg(lesson, state));
  run(chrome, [
    "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--allow-file-access-from-files", "--force-device-scale-factor=1",
    "--window-size=1280,807", `--screenshot=${rawPath}`, `file://${svgPath}`,
  ], { quiet: true });
  run(magick, [
    rawPath, "-crop", "1280x720+0+0", "+repage",
    "-background", "#FFF6FA", "-alpha", "remove", "-alpha", "off", output,
  ], { quiet: true });
  rmSync(rawPath, { force: true });
}

function speak(text, voice, output, rate = "-8%") {
  if (existsSync(output) && statSync(output).size > 1024) return;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      run(edgeTts, ["--voice", voice, `--rate=${rate}`, "--text", text, "--write-media", output], {
        quiet: true,
        timeout: 360_000,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function duration(file) {
  const value = run(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ], { quiet: true });
  return Number(value.trim());
}

function encodeSegment(frame, mascot, audio, output, seconds) {
  const input = [
    "-y",
    "-loop", "1", "-framerate", "24", "-i", frame,
    "-loop", "1", "-framerate", "24", "-i", mascot,
  ];
  if (audio) input.push("-i", audio);
  else input.push("-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=24000");

  run(ffmpeg, [
    ...input,
    "-filter_complex",
    `[1:v]scale=270:-1,format=rgba[mascot];` +
      `[0:v][mascot]overlay=x='W-w-38+5*sin(2*PI*t/1.9)':y='H-h-20+7*sin(2*PI*t/1.25)':shortest=1,format=yuv420p[v];` +
      `[2:a]apad[a]`,
    "-map", "[v]", "-map", "[a]",
    "-t", seconds.toFixed(3),
    "-r", "24",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
    "-c:a", "aac", "-b:a", "64k", "-ar", "24000", "-ac", "1",
    "-pix_fmt", "yuv420p",
    output,
  ], { quiet: true, timeout: 300_000 });
}

const timestamp = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
};

function writeCatalog(catalog) {
  const merged = lessons.map((lesson) => {
    const generated = catalog.find((entry) => entry.id === lesson.id);
    if (generated) return generated;
    const output = join(videosDir, `${lesson.id}.mp4`);
    return {
      ...lesson,
      video: `videos/${lesson.id}.mp4`,
      poster: `videos/posters/${lesson.id}.png`,
      subtitles: `videos/subtitles/${lesson.id}.vtt`,
      duration: existsSync(output) ? Math.round(duration(output)) : 0,
      bytes: existsSync(output) ? statSync(output).size : 0,
    };
  });
  writeFileSync(
    join(videosDir, "catalog.js"),
    `window.VIDEO_LESSONS = ${JSON.stringify(merged, null, 2)};\n`,
  );
}

const catalog = [];
for (const lesson of activeLessons) {
  const lessonFrames = join(frameDir, lesson.id);
  const lessonSegments = join(segmentDir, lesson.id);
  mkdirSync(lessonFrames, { recursive: true });
  mkdirSync(lessonSegments, { recursive: true });

  const introFrame = join(lessonFrames, "intro.png");
  const outroFrame = join(lessonFrames, "outro.png");
  renderFrame(lesson, { kind: "intro" }, introFrame);
  renderFrame(lesson, { kind: "outro" }, outroFrame);
  lesson.lines.forEach((_, index) => {
    renderFrame(lesson, { kind: "line", index, phase: "ja" }, join(lessonFrames, `${index + 1}-ja.png`));
    renderFrame(lesson, { kind: "line", index, phase: "ko" }, join(lessonFrames, `${index + 1}-ko.png`));
  });

  if (framesOnly) {
    copyFileSync(introFrame, join(posterDir, `${lesson.id}.png`));
    continue;
  }

  const segments = [];
  const cues = [];
  let clock = 0;
  const introDuration = 2.4;
  const introSegment = join(lessonSegments, "000-intro.mp4");
  encodeSegment(introFrame, mascotFiles.intro, null, introSegment, introDuration);
  segments.push(introSegment);
  clock += introDuration;

  lesson.lines.forEach((line, index) => {
    const speakerVoice = line.speaker === "A" ? "ja-JP-KeitaNeural" : "ja-JP-NanamiNeural";
    const jaAudio = join(audioDir, `${lesson.id}-${index + 1}-ja.mp3`);
    const koAudio = join(audioDir, `${lesson.id}-${index + 1}-ko.mp3`);
    speak(line.ja, speakerVoice, jaAudio, "-10%");
    speak(line.ko, "ko-KR-SunHiNeural", koAudio, "-4%");

    const jaSpeech = duration(jaAudio);
    const jaDuration = jaSpeech + 0.65;
    const jaSegment = join(lessonSegments, `${String(index * 2 + 1).padStart(3, "0")}-ja.mp4`);
    encodeSegment(
      join(lessonFrames, `${index + 1}-ja.png`),
      mascotFiles.ja,
      jaAudio,
      jaSegment,
      jaDuration,
    );
    cues.push({ start: clock, end: clock + jaSpeech, text: line.ja });
    segments.push(jaSegment);
    clock += jaDuration;

    const koSpeech = duration(koAudio);
    const koDuration = koSpeech + 0.75;
    const koSegment = join(lessonSegments, `${String(index * 2 + 2).padStart(3, "0")}-ko.mp4`);
    encodeSegment(
      join(lessonFrames, `${index + 1}-ko.png`),
      mascotFiles.ko,
      koAudio,
      koSegment,
      koDuration,
    );
    cues.push({ start: clock, end: clock + koSpeech, text: line.ko });
    segments.push(koSegment);
    clock += koDuration;
  });

  const outroDuration = 1.9;
  const outroSegment = join(lessonSegments, "999-outro.mp4");
  encodeSegment(outroFrame, mascotFiles.outro, null, outroSegment, outroDuration);
  segments.push(outroSegment);
  clock += outroDuration;

  const concatFile = join(lessonSegments, "concat.txt");
  writeFileSync(concatFile, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
  const output = join(videosDir, `${lesson.id}.mp4`);
  run(ffmpeg, [
    "-y", "-f", "concat", "-safe", "0", "-i", concatFile,
    "-c", "copy", "-movflags", "+faststart", output,
  ], { quiet: true, timeout: 300_000 });

  const poster = join(posterDir, `${lesson.id}.png`);
  run(ffmpeg, ["-y", "-ss", "0.8", "-i", introSegment, "-frames:v", "1", poster], { quiet: true });

  const vtt = ["WEBVTT", ""];
  cues.forEach((cue, index) => {
    vtt.push(String(index + 1), `${timestamp(cue.start)} --> ${timestamp(cue.end)}`, cue.text, "");
  });
  writeFileSync(join(subtitleDir, `${lesson.id}.vtt`), vtt.join("\n"));

  catalog.push({
    ...lesson,
    video: `videos/${lesson.id}.mp4`,
    poster: `videos/posters/${lesson.id}.png`,
    subtitles: `videos/subtitles/${lesson.id}.vtt`,
    duration: Math.round(duration(output)),
    bytes: statSync(output).size,
  });
  process.stdout.write(`generated ${lesson.id} (${Math.round(clock)}s)\n`);
}

writeCatalog(catalog);
