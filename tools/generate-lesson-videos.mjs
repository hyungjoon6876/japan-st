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
const mascotBuildDir = join(buildDir, "mascots");
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
for (const dir of [audioDir, frameDir, segmentDir, mascotBuildDir, posterDir, subtitleDir]) {
  mkdirSync(dir, { recursive: true });
}

const lessons = JSON.parse(readFileSync(join(videosDir, "lessons.json"), "utf8"));
const activeLessons = selected
  ? lessons.filter((lesson) => lesson.lesson === selected || lesson.id === selected)
  : lessons;

if (!activeLessons.length) throw new Error(`No lesson matched: ${selected}`);
if (activeLessons.some((lesson) => !lesson.story?.beats?.length)) {
  throw new Error("Every lesson must include story beats.");
}

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

function wrap(text, limit, maxLines = 2) {
  let remaining = String(text).trim();
  const lines = [];
  while (remaining && lines.length < maxLines) {
    const chars = [...remaining];
    if (chars.length <= limit || lines.length === maxLines - 1) {
      lines.push(remaining);
      break;
    }
    const candidate = chars.slice(0, limit + 1).join("");
    const space = candidate.lastIndexOf(" ");
    const cut = space > Math.floor(limit * 0.55) ? [...candidate.slice(0, space)].length : limit;
    lines.push(chars.slice(0, cut).join("").trim());
    remaining = chars.slice(cut).join("").trim();
  }
  return lines;
}

const tspans = (lines, x, y, lineHeight) => lines
  .map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}">${xml(line)}</tspan>`)
  .join("");

const flower = (x, y, scale = 1, color = "#F078A8") => `
  <g transform="translate(${x} ${y}) scale(${scale})" fill="${color}">
    <ellipse rx="11" ry="18" transform="rotate(0) translate(0 -14)"/>
    <ellipse rx="11" ry="18" transform="rotate(72) translate(0 -14)"/>
    <ellipse rx="11" ry="18" transform="rotate(144) translate(0 -14)"/>
    <ellipse rx="11" ry="18" transform="rotate(216) translate(0 -14)"/>
    <ellipse rx="11" ry="18" transform="rotate(288) translate(0 -14)"/>
    <circle r="5" fill="#FFE59B"/>
  </g>`;

function sceneArt(key, accent) {
  const art = {
    station: `
      <rect width="1280" height="720" fill="#DFF3FF"/>
      <circle cx="1080" cy="110" r="58" fill="#FFE5A7"/>
      <path d="M0 390 Q180 280 360 390 T720 390 T1080 390 T1440 390 V560 H0Z" fill="#B9D9C2"/>
      <rect y="480" width="1280" height="240" fill="#E9E3E5"/>
      <rect y="606" width="1280" height="24" fill="#7D737C"/>
      <rect y="650" width="1280" height="12" fill="#7D737C"/>
      <path d="M0 638H1280M0 680H1280" stroke="#FFFFFF" stroke-width="8" stroke-dasharray="35 28"/>
      <rect x="90" y="205" width="310" height="112" rx="10" fill="#FFFFFF" stroke="${accent}" stroke-width="8"/>
      <text x="245" y="260" text-anchor="middle" class="sign">さくら駅</text>
      <text x="245" y="294" text-anchor="middle" class="signSub">SAKURA STATION</text>
      <path d="M0 115H1280M82 115V480M1198 115V480" stroke="#725E69" stroke-width="22"/>
      <path d="M0 115L130 38H1150L1280 115Z" fill="#EF9AB9"/>`,
    classroom: `
      <rect width="1280" height="720" fill="#FFF6DF"/>
      <rect y="560" width="1280" height="160" fill="#D9B38C"/>
      <path d="M0 600H1280M0 650H1280" stroke="#C49C74" stroke-width="3"/>
      <rect x="95" y="120" width="610" height="292" rx="12" fill="#477565" stroke="#825E44" stroke-width="20"/>
      <path d="M145 220Q230 175 310 220T480 220" stroke="#FFF1B8" stroke-width="7" fill="none"/>
      <text x="400" y="315" text-anchor="middle" class="boardText">はじめまして</text>
      <rect x="865" y="95" width="315" height="310" fill="#DDF4FF" stroke="#FFFFFF" stroke-width="16"/>
      <path d="M1022 95V405M865 250H1180" stroke="#FFFFFF" stroke-width="10"/>
      <rect x="170" y="490" width="260" height="38" rx="8" fill="#B77959"/>
      <path d="M205 528V650M395 528V650" stroke="#80533F" stroke-width="18"/>
      ${flower(1120, 485, 1.2, "#F6A2BD")}`,
    market: `
      <rect width="1280" height="720" fill="#E9F8FF"/>
      <rect y="520" width="1280" height="200" fill="#E8D5BD"/>
      <path d="M0 120H1280V238H0Z" fill="#FFF7ED"/>
      <path d="M0 120h128v118H0zm256 0h128v118H256zm256 0h128v118H512zm256 0h128v118H768zm256 0h128v118h-128z" fill="#F47C9E"/>
      <path d="M128 120h128v118H128zm256 0h128v118H384zm256 0h128v118H640zm256 0h128v118H896zm256 0h128v118h-128z" fill="#FFE5EC"/>
      <rect x="70" y="265" width="420" height="255" rx="14" fill="#BE8660"/>
      <rect x="92" y="288" width="376" height="96" rx="8" fill="#EACCA6"/>
      <g fill="#ED5F68">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${135 + i * 66}" cy="335" r="29"/>`).join("")}</g>
      <rect x="92" y="402" width="376" height="96" rx="8" fill="#EACCA6"/>
      <g fill="#F2B635">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${135 + i * 66}" cy="449" r="29"/>`).join("")}</g>
      <text x="280" y="96" text-anchor="middle" class="marketSign">あさひ りんご</text>`,
    library: `
      <rect width="1280" height="720" fill="#F3F0E5"/>
      <rect y="590" width="1280" height="130" fill="#C9A77C"/>
      <g fill="#795D4D">
        <rect x="50" y="95" width="420" height="470" rx="8"/>
        <rect x="810" y="95" width="420" height="470" rx="8"/>
      </g>
      <g>${[130, 240, 350, 460].map((y, row) => `<rect x="75" y="${y}" width="370" height="12" fill="#D8B387"/><rect x="835" y="${y}" width="370" height="12" fill="#D8B387"/>${[0,1,2,3,4,5,6].map((i) => `<rect x="${88 + i * 48}" y="${y - 58}" width="32" height="56" rx="3" fill="${["#E97883", "#72A98F", "#F1BD56", "#719CC7"][ (i + row) % 4 ]}"/>`).join("")}${[0,1,2,3,4,5,6].map((i) => `<rect x="${848 + i * 48}" y="${y - 58}" width="32" height="56" rx="3" fill="${["#719CC7", "#F1BD56", "#E97883", "#72A98F"][ (i + row) % 4 ]}"/>`).join("")}`).join("")}</g>
      <circle cx="640" cy="126" r="58" fill="#FFF9D8" stroke="#CDAE6A" stroke-width="8"/>
      <path d="M640 126L640 88M640 126L673 142" stroke="#715B52" stroke-width="8" stroke-linecap="round"/>
      <text x="640" y="220" text-anchor="middle" class="quiet">しーっ</text>`,
    cinema: `
      <rect width="1280" height="720" fill="#35263C"/>
      <path d="M0 0H230Q170 220 245 720H0ZM1280 0H1050Q1110 220 1035 720H1280Z" fill="#B84F70"/>
      <path d="M42 0H175Q135 250 185 720H42ZM1238 0H1105Q1145 250 1095 720H1238Z" fill="#E27896"/>
      <rect x="255" y="82" width="770" height="170" rx="20" fill="#FFF6D9" stroke="#F4C24A" stroke-width="12"/>
      <text x="640" y="170" text-anchor="middle" class="cinemaSign">SAKURA CINEMA</text>
      <g fill="#F4C24A">${[290, 360, 430, 500, 780, 850, 920, 990].map((x) => `<circle cx="${x}" cy="218" r="8"/>`).join("")}</g>
      <rect x="440" y="320" width="400" height="270" rx="8" fill="#FFFDF7"/>
      <path d="M640 340L690 445L805 460L720 540L740 655L640 600L540 655L560 540L475 460L590 445Z" fill="#F5B6C9" opacity=".65"/>`,
    platform: `
      <rect width="1280" height="720" fill="#D9ECF5"/>
      <rect y="430" width="1280" height="290" fill="#D5D0CB"/>
      <rect y="565" width="1280" height="18" fill="#F1C74D"/>
      <path d="M0 635H1280" stroke="#6F737A" stroke-width="18"/>
      <path d="M0 682H1280" stroke="#6F737A" stroke-width="18"/>
      <rect x="64" y="86" width="470" height="245" rx="14" fill="#FFFFFF" stroke="#6EA5C2" stroke-width="9"/>
      <path d="M115 142H485M115 200H430M115 258H465" stroke="#85B8D2" stroke-width="16" stroke-linecap="round"/>
      <circle cx="950" cy="160" r="72" fill="#FFF" stroke="#6E5962" stroke-width="10"/>
      <path d="M950 160V105M950 160L995 180" stroke="#6E5962" stroke-width="9" stroke-linecap="round"/>
      <rect x="760" y="270" width="380" height="80" rx="12" fill="#4D6E89"/>
      <text x="950" y="324" text-anchor="middle" class="platformText">2 番 のりば</text>`,
    kyoto: `
      <rect width="1280" height="720" fill="#E5F5FF"/>
      <circle cx="1070" cy="120" r="62" fill="#FFF0B4"/>
      <path d="M0 380Q180 230 360 380Q540 210 720 380Q900 250 1080 380Q1200 285 1280 350V560H0Z" fill="#A9C8A6"/>
      <rect y="545" width="1280" height="175" fill="#C9A47E"/>
      <path d="M0 690L510 510H770L1280 690" fill="#DCC4A8"/>
      <g transform="translate(155 160)">
        <rect x="85" y="90" width="135" height="330" fill="#C7564F"/>
        <path d="M45 95H260L215 50H90ZM25 180H280L225 135H80ZM5 275H300L235 225H70Z" fill="#5D4243"/>
        <rect x="125" y="320" width="58" height="100" fill="#463338"/>
      </g>
      ${flower(1040, 395, 1.5, "#F1A4BA")}${flower(1140, 330, 1.1, "#F7BDD0")}`,
    museum: `
      <rect width="1280" height="720" fill="#F6F1E8"/>
      <rect y="600" width="1280" height="120" fill="#D9C5A7"/>
      <rect x="70" y="105" width="330" height="330" rx="6" fill="#B98758"/>
      <rect x="92" y="127" width="286" height="286" fill="#FBE5C5"/>
      <circle cx="235" cy="255" r="72" fill="#E77982"/>
      ${flower(235, 250, 1.8, "#F7BDD0")}
      <rect x="830" y="115" width="340" height="310" rx="6" fill="#7A665D"/>
      <rect x="852" y="137" width="296" height="266" fill="#DCE9E2"/>
      <path d="M870 370L955 245L1015 320L1085 220L1130 370Z" fill="#769A85"/>
      <path d="M170 520H1110" stroke="#B64D58" stroke-width="12"/>
      <circle cx="170" cy="520" r="24" fill="#5C4C4B"/><circle cx="1110" cy="520" r="24" fill="#5C4C4B"/>
      <path d="M170 520V620M1110 520V620" stroke="#5C4C4B" stroke-width="15"/>`,
    gift: `
      <rect width="1280" height="720" fill="#FFF1F4"/>
      <rect y="575" width="1280" height="145" fill="#DAB691"/>
      <rect x="65" y="100" width="410" height="430" rx="12" fill="#FFFFFF" stroke="#E8A0B5" stroke-width="8"/>
      <path d="M85 210H455M85 330H455M85 450H455" stroke="#E9C7D0" stroke-width="10"/>
      <g>${[[145,170,"#ED718A"],[250,170,"#F0B84D"],[355,170,"#7FC8A0"],[145,285,"#8AAED4"],[250,285,"#ED718A"],[355,285,"#F0B84D"]].map(([x,y,c]) => `<rect x="${x-38}" y="${y-36}" width="76" height="72" rx="8" fill="${c}"/><path d="M${x} ${y-36}V${y+36}M${x-38} ${y}H${x+38}" stroke="#FFF" stroke-width="7"/>`).join("")}</g>
      <g transform="translate(965 355)">
        <path d="M0 170Q80 15 160 170Z" fill="#7BB891"/>
        ${flower(45, 80, 1.3, "#EF789B")}${flower(95, 55, 1.2, "#F4C24A")}${flower(125, 100, 1.1, "#8AB2DB")}
        <path d="M30 135L130 135L110 245H50Z" fill="#F4B5C8"/>
      </g>
      <text x="930" y="125" text-anchor="middle" class="giftSign">こころ GIFT</text>`,
    kitchen: `
      <rect width="1280" height="720" fill="#E8F4EA"/>
      <rect y="500" width="1280" height="220" fill="#E3C6A0"/>
      <rect x="65" y="100" width="390" height="290" rx="12" fill="#FFFFFF" stroke="#8DC2A1" stroke-width="9"/>
      <path d="M195 100V390M325 100V390M65 245H455" stroke="#C6E3D1" stroke-width="8"/>
      <g transform="translate(850 95)" stroke="#6F7D73" stroke-width="12" fill="none" stroke-linecap="round">
        <path d="M0 0V120Q0 170 50 170Q100 170 100 120V0"/>
        <path d="M160 0V170M130 0V70M190 0V70"/>
      </g>
      <rect x="125" y="430" width="1030" height="120" rx="18" fill="#F8EEE0" stroke="#B88A64" stroke-width="10"/>
      <circle cx="365" cy="475" r="38" fill="#E86E70"/><circle cx="455" cy="487" r="32" fill="#72B78D"/>
      <path d="M610 475Q680 410 750 475Q680 540 610 475Z" fill="#FFF" stroke="#B7A08B" stroke-width="5"/>
      ${flower(680, 475, .7, "#F078A8")}`,
    hotel: `
      <rect width="1280" height="720" fill="#E7F0F4"/>
      <rect y="565" width="1280" height="155" fill="#C8A783"/>
      <rect x="75" y="75" width="400" height="385" rx="10" fill="#B7D8E7" stroke="#FFFFFF" stroke-width="16"/>
      <path d="M275 75V460M75 265H475" stroke="#FFFFFF" stroke-width="12"/>
      <g stroke="#75A6BD" stroke-width="6" stroke-linecap="round">${[125,180,235,290,345,400].map((x, i) => `<path d="M${x} ${120 + (i%2)*45}l-18 48"/>`).join("")}</g>
      <rect x="700" y="365" width="500" height="190" rx="20" fill="#895E61"/>
      <rect x="730" y="395" width="440" height="130" rx="10" fill="#F4E6D7"/>
      <path d="M990 365V555" stroke="#6C494C" stroke-width="8"/>
      <g transform="translate(555 405)"><path d="M0 150V0Q70 -60 140 0V150" stroke="#F078A8" stroke-width="16" fill="none"/><path d="M0 0Q70 -65 140 0" fill="#F5B3C8"/></g>
      <text x="950" y="155" text-anchor="middle" class="hotelSign">SAKURA HOTEL</text>
      ${flower(950, 235, 1.35, "#F078A8")}`,
  };
  return art[key] || art.station;
}

function progressDots(lesson, activeBeat = null) {
  const current = Number(lesson.lesson) - 1;
  const episodeDots = Array.from({ length: 11 }, (_, index) => {
    const fill = index <= current ? lesson.accent : "#E7D8DF";
    return `<circle cx="${48 + index * 28}" cy="676" r="7" fill="${fill}"/>`;
  }).join("");
  const beatDots = activeBeat == null ? "" : lesson.story.beats.map((_, index) =>
    `<rect x="${1020 + index * 48}" y="670" width="36" height="9" rx="4.5" fill="${index <= activeBeat ? lesson.accent : "#E7D8DF"}"/>`,
  ).join("");
  return `${episodeDots}${beatDots}`;
}

function frameSvg(lesson, state) {
  const story = lesson.story;
  const accent = lesson.accent;
  const art = sceneArt(story.locationKey, accent);
  let content = "";

  if (state.kind === "intro") {
    const titleLines = wrap(story.episodeTitle, 12, 2);
    const summaryLines = wrap(story.summary, 29, 3);
    content = `
      <rect x="44" y="42" width="630" height="590" rx="28" fill="#FFFDFC" fill-opacity=".94" stroke="#FFFFFF" stroke-width="2" filter="url(#shadow)"/>
      <rect x="72" y="72" width="148" height="40" rx="20" fill="${accent}"/>
      <text x="146" y="99" text-anchor="middle" class="episodeChip">EPISODE ${lesson.lesson}</text>
      <text x="238" y="99" class="locationChip">${xml(story.locationLabel)}</text>
      <text class="storyTitle">${tspans(titleLines, 72, 188, 70)}</text>
      <text x="74" y="${titleLines.length > 1 ? 340 : 278}" class="seriesTitle">${xml(story.series)}</text>
      <text class="summary">${tspans(summaryLines, 74, titleLines.length > 1 ? 397 : 345, 42)}</text>
      <g transform="translate(74 ${titleLines.length > 1 ? 520 : 485})">
        ${lesson.focus.map((focus, index) => `<rect x="0" y="${index * 42}" width="250" height="32" rx="16" fill="#FFF" stroke="${accent}" stroke-opacity=".45"/><text x="125" y="${22 + index * 42}" text-anchor="middle" class="focus">${xml(focus)}</text>`).join("")}
      </g>
      <g transform="translate(1015 98)">${flower(0, 0, 1.05, accent)}<text x="0" y="56" text-anchor="middle" class="stampName">${xml(story.stamp)}</text></g>
      ${progressDots(lesson)}`;
  } else if (state.kind === "outro") {
    const outroLines = wrap(story.outro, 28, 3);
    const nextLines = wrap(story.next, 34, 2);
    content = `
      <rect x="52" y="50" width="700" height="575" rx="30" fill="#FFFDFC" fill-opacity=".95" filter="url(#shadow)"/>
      <text x="84" y="100" class="complete">STORY COMPLETE · EPISODE ${lesson.lesson}</text>
      <g transform="translate(185 215)">
        <circle r="92" fill="#FFF4F7" stroke="${accent}" stroke-width="8" stroke-dasharray="12 8"/>
        ${flower(0, -10, 2.2, accent)}
        <text x="0" y="70" text-anchor="middle" class="stampName">${xml(story.stamp)}</text>
      </g>
      <text x="312" y="182" class="stampGot">도장 획득!</text>
      <text class="outroText">${tspans(outroLines, 312, 238, 45)}</text>
      <rect x="84" y="440" width="620" height="120" rx="18" fill="#FFF3F7" stroke="${accent}" stroke-opacity=".35"/>
      <text x="110" y="475" class="nextLabel">NEXT STORY</text>
      <text class="nextText">${tspans(nextLines, 110, 515, 34)}</text>
      ${progressDots(lesson)}`;
  } else {
    const beat = story.beats[state.index];
    const line = lesson.lines[beat.line];
    const characterOnRight = beat.side !== "left";
    const bubbleX = characterOnRight ? 54 : 546;
    const bubbleWidth = 680;
    const pointer = characterOnRight
      ? `<path d="M${bubbleX + bubbleWidth - 2} 365l42 24-42 25Z" fill="#FFFDFC"/>`
      : `<path d="M${bubbleX + 2} 365l-42 24 42 25Z" fill="#FFFDFC"/>`;
    const jaCharacters = [...line.ja];
    const jaBreak = Math.ceil(jaCharacters.length / 2);
    const jaLines = jaCharacters.length <= 16
      ? [line.ja]
      : [jaCharacters.slice(0, jaBreak).join(""), jaCharacters.slice(jaBreak).join("")];
    const koLines = wrap(line.ko, 29, 2);
    const narrationLines = wrap(beat.narration, 43, 2);
    const longestJaLine = Math.max(...jaLines.map((text) => [...text].length));
    const jaSize = Math.max(35, Math.min(jaLines.length > 1 ? 44 : 48, Math.floor(590 / longestJaLine)));
    content = `
      <rect x="42" y="30" width="1196" height="62" rx="20" fill="#FFFDFC" fill-opacity=".92" filter="url(#softShadow)"/>
      <rect x="58" y="43" width="122" height="36" rx="18" fill="${accent}"/>
      <text x="119" y="68" text-anchor="middle" class="episodeChip">EP. ${lesson.lesson}</text>
      <text x="198" y="68" class="locationChip">${xml(story.episodeTitle)} · ${xml(story.locationLabel)}</text>
      <rect x="42" y="108" width="1196" height="94" rx="22" fill="#3E3238" fill-opacity=".86"/>
      <rect x="59" y="125" width="118" height="34" rx="17" fill="#FFE7A8"/>
      <text x="118" y="149" text-anchor="middle" class="beatLabel">${xml(beat.label)}</text>
      <text class="narration">${tspans(narrationLines, 198, narrationLines.length > 1 ? 145 : 160, 32)}</text>
      <rect x="${bubbleX}" y="232" width="${bubbleWidth}" height="310" rx="28" fill="#FFFDFC" stroke="${accent}" stroke-width="4" filter="url(#shadow)"/>
      ${pointer}
      <rect x="${bubbleX + 28}" y="258" width="152" height="40" rx="20" fill="${accent}"/>
      <text x="${bubbleX + 104}" y="285" text-anchor="middle" class="speaker">${xml(beat.speaker)}</text>
      <text class="japanese" font-size="${jaSize}">${tspans(jaLines, bubbleX + 32, 365, 58)}</text>
      <line x1="${bubbleX + 32}" y1="450" x2="${bubbleX + bubbleWidth - 32}" y2="450" stroke="#EED7E0" stroke-width="2" stroke-dasharray="7 8"/>
      <text class="translation">${tspans(koLines, bubbleX + 32, 490, 34)}</text>
      <rect x="42" y="622" width="390" height="30" rx="15" fill="#FFFDFC" fill-opacity=".9"/>
      <text x="237" y="644" text-anchor="middle" class="stampTrail">벚꽃 도장 ${lesson.lesson} / 11 · ${xml(story.stamp)}</text>
      ${progressDots(lesson, state.index)}`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#49333C" flood-opacity=".2"/></filter>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#49333C" flood-opacity=".16"/></filter>
      <style>
        text{font-family:'Noto Sans KR','Malgun Gothic','Noto Sans JP',sans-serif;letter-spacing:0}
        .sign{font-size:34px;font-weight:900;fill:#51434A}.signSub{font-size:15px;font-weight:800;fill:#8B7580}
        .boardText{font-size:42px;font-weight:800;fill:#FFF1B8}.marketSign{font-size:38px;font-weight:900;fill:#7B3D4D}
        .quiet{font-size:38px;font-weight:900;fill:#715B52}.cinemaSign{font-size:45px;font-weight:900;fill:#713D4D}
        .platformText{font-size:36px;font-weight:800;fill:#FFF}.giftSign,.hotelSign{font-size:40px;font-weight:900;fill:#8A4B60}
        .episodeChip{font-size:16px;font-weight:900;fill:#FFF}.locationChip{font-size:18px;font-weight:800;fill:#57464E}
        .storyTitle{font-size:58px;font-weight:900;fill:#49333E}.seriesTitle{font-size:20px;font-weight:900;fill:${accent}}
        .summary{font-size:25px;font-weight:650;fill:#6B535E}.focus{font-size:16px;font-weight:750;fill:#6B4A59}
        .stampName{font-size:17px;font-weight:900;fill:#764A5D}.complete{font-size:18px;font-weight:900;fill:${accent}}
        .stampGot{font-size:42px;font-weight:900;fill:#49333E}.outroText{font-size:25px;font-weight:700;fill:#654D58}
        .nextLabel{font-size:15px;font-weight:900;fill:${accent}}.nextText{font-size:21px;font-weight:700;fill:#624B56}
        .beatLabel{font-size:15px;font-weight:900;fill:#6C5260}.narration{font-size:23px;font-weight:700;fill:#FFF}
        .speaker{font-size:18px;font-weight:900;fill:#FFF}.japanese{font-weight:900;fill:#51303F}
        .translation{font-size:24px;font-weight:700;fill:#725B65}.stampTrail{font-size:14px;font-weight:850;fill:#765866}
      </style>
    </defs>
    ${art}
    <g opacity=".6">${flower(1190, 52, .75, accent)}${flower(742, 650, .48, "#F5B4C8")}</g>
    ${content}
  </svg>`;
}

function renderFrame(lesson, state, output) {
  const suffix = state.kind === "beat" ? `-${state.index + 1}` : `-${state.kind}`;
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

const mascotSources = {
  intro: join(videosDir, "assets", "og-mascot.png"),
  hero: join(videosDir, "assets", "og-mascot.png"),
  nyamnyam: join(videosDir, "assets", "mascot-nyamnyam.png"),
  dance: join(videosDir, "assets", "mascot-dance.png"),
  cheer: join(videosDir, "assets", "mascot-cheer.png"),
  giggle: join(videosDir, "assets", "mascot-giggle.png"),
  peek: join(videosDir, "assets", "villain-1-peek.png"),
  hack: join(videosDir, "assets", "villain-2-hack.png"),
  bag: join(videosDir, "assets", "villain-3-steal.png"),
  hug: join(videosDir, "assets", "villain-4-hug.png"),
};

function prepareMascot(name, source) {
  if (!existsSync(source)) throw new Error(`Missing mascot pose: ${source}`);
  const dimensions = run(magick, ["identify", "-format", "%w %h", source], { quiet: true })
    .trim().split(/\s+/).map(Number);
  const [width, height] = dimensions;
  const output = join(mascotBuildDir, `${name}.png`);
  if (!existsSync(output)) {
    run(magick, [
      source, "-alpha", "set",
      "(", "-size", `${width}x${height}`, "xc:black", "-fill", "white",
      "-draw", `roundrectangle 0,0 ${width - 1},${height - 1} 24,24`, ")",
      "-compose", "CopyOpacity", "-composite", output,
    ], { quiet: true });
  }
  return { file: output, width, height };
}

const mascots = Object.fromEntries(
  Object.entries(mascotSources).map(([name, source]) => [name, prepareMascot(name, source)]),
);

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
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { quiet: true });
  return Number(value.trim());
}

function writeMusicWav(output) {
  if (existsSync(output) && statSync(output).size > 1024) return;
  const sampleRate = 24_000;
  const beat = 0.4;
  const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46, 523.25, 659.25, 783.99, 987.77, 880, 783.99, 659.25, 587.33, 523.25, 659.25, 698.46, 783.99];
  const seconds = notes.length * beat;
  const sampleCount = Math.floor(sampleRate * seconds);
  const pcm = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const noteIndex = Math.floor(time / beat);
    const local = time - noteIndex * beat;
    const attack = Math.min(1, local / 0.025);
    const envelope = attack * Math.exp(-5.1 * local / beat);
    const frequency = notes[noteIndex];
    const bell = Math.sin(2 * Math.PI * frequency * time) + 0.32 * Math.sin(2 * Math.PI * frequency * 2.01 * time);
    const bassFrequency = notes[Math.floor(noteIndex / 4) * 4] / 2;
    const bassLocal = time - Math.floor(time / (beat * 4)) * beat * 4;
    const bass = 0.32 * Math.sin(2 * Math.PI * bassFrequency * time) * Math.exp(-2.4 * bassLocal);
    const value = Math.max(-1, Math.min(1, (bell * envelope * 0.24) + bass * 0.18));
    pcm.writeInt16LE(Math.round(value * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(output, Buffer.concat([header, pcm]));
}

const musicFile = join(audioDir, "yomi-story-theme.wav");
writeMusicWav(musicFile);

function composeBeatAudio(lesson, beat, index) {
  const line = lesson.lines[beat.line];
  const narration = join(audioDir, `${lesson.id}-${index + 1}-narration.mp3`);
  const japanese = join(audioDir, `${lesson.id}-${index + 1}-dialogue.mp3`);
  const output = join(audioDir, `${lesson.id}-${index + 1}-story.m4a`);
  speak(beat.narration, "ko-KR-SunHiNeural", narration, "-7%");
  const voice = line.speaker === "A" ? "ja-JP-KeitaNeural" : "ja-JP-NanamiNeural";
  speak(line.ja, voice, japanese, "-11%");
  const narrationSeconds = duration(narration);
  const japaneseSeconds = duration(japanese);
  const gap = 0.32;
  if (!existsSync(output) || statSync(output).size < 1024) {
    run(ffmpeg, [
      "-y", "-i", narration,
      "-f", "lavfi", "-t", gap.toFixed(2), "-i", "anullsrc=channel_layout=mono:sample_rate=24000",
      "-i", japanese,
      "-filter_complex",
      "[0:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[n];" +
        "[1:a]aformat=sample_fmts=fltp:channel_layouts=mono[g];" +
        "[2:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[j];" +
        "[n][g][j]concat=n=3:v=0:a=1[a]",
      "-map", "[a]", "-c:a", "aac", "-b:a", "80k", output,
    ], { quiet: true, timeout: 180_000 });
  }
  return { file: output, narrationSeconds, japaneseSeconds, gap };
}

function motionExpressions(motion, side, targetWidth, source) {
  const targetHeight = targetWidth * source.height / source.width;
  const baseX = side === "left" ? 54 : 1280 - targetWidth - 54;
  const baseY = Math.max(118, 720 - targetHeight - 42);
  let x = `${baseX}+5*sin(2*PI*t/2.8)`;
  let y = `${baseY}+7*sin(2*PI*t/1.6)`;
  let angle = "0.012*sin(2*PI*t/2.4)";
  if (motion === "enter") {
    x = side === "left"
      ? `${baseX}-440*exp(-4*t)`
      : `${baseX}+440*exp(-4*t)`;
  } else if (motion === "bounce") {
    y = `${baseY}-18*abs(sin(PI*t/0.72))`;
  } else if (motion === "hop") {
    y = `${baseY}-40*abs(sin(PI*t/0.92))`;
    angle = "0.025*sin(2*PI*t/1.84)";
  } else if (motion === "peek") {
    x = side === "left"
      ? `${baseX}-18+20*sin(2*PI*t/2.3)`
      : `${baseX}+18-20*sin(2*PI*t/2.3)`;
    y = `${baseY}+4*sin(2*PI*t/1.7)`;
  } else if (motion === "dance") {
    x = `${baseX}+12*sin(2*PI*t/1.25)`;
    y = `${baseY}-21*abs(sin(PI*t/0.62))`;
    angle = "0.035*sin(2*PI*t/1.25)";
  }
  return { x, y, angle };
}

function encodeSegment(frame, mascot, audio, output, seconds, options = {}) {
  const targetWidth = options.width || 405;
  const side = options.side || "right";
  const motion = motionExpressions(options.motion || "bounce", side, targetWidth, mascot);
  const inputs = [
    "-y",
    "-loop", "1", "-framerate", "24", "-i", frame,
    "-loop", "1", "-framerate", "24", "-i", mascot.file,
  ];
  if (audio) inputs.push("-i", audio);
  else inputs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=24000");
  inputs.push("-stream_loop", "-1", "-i", musicFile);

  run(ffmpeg, [
    ...inputs,
    "-filter_complex",
    "[0:v]scale=1344:756,crop=1280:720:x='32+8*sin(t*0.25)':y='18+5*cos(t*0.2)',fps=24[bg];" +
      `[1:v]scale=${targetWidth}:-1,format=rgba,rotate='${motion.angle}':ow=rotw(iw):oh=roth(ih):c=none[character];` +
      `[bg][character]overlay=x='${motion.x}':y='${motion.y}':eval=frame:shortest=1,format=yuv420p[v];` +
      "[2:a]aresample=24000,apad,volume=1[voice];" +
      "[3:a]aresample=24000,volume=0.085,afade=t=in:st=0:d=0.35[music];" +
      "[voice][music]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.92[a]",
    "-map", "[v]", "-map", "[a]",
    "-t", seconds.toFixed(3), "-r", "24",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1",
    "-pix_fmt", "yuv420p", output,
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
  lesson.story.beats.forEach((_, index) => {
    renderFrame(lesson, { kind: "beat", index }, join(lessonFrames, `${index + 1}.png`));
  });

  if (framesOnly) {
    const poster = join(posterDir, `${lesson.id}.png`);
    const coverMascot = mascots[lesson.story.coverPose] || mascots.intro;
    run(magick, [
      introFrame, "(", coverMascot.file, "-resize", "420x", ")",
      "-gravity", "southeast", "-geometry", "+62+24", "-composite", poster,
    ], { quiet: true });
    continue;
  }

  const segments = [];
  const cues = [];
  let clock = 0;

  const introAudio = join(audioDir, `${lesson.id}-intro.mp3`);
  const introText = `${lesson.story.series}. 제 ${Number(lesson.lesson)}화, ${lesson.story.episodeTitle}.`;
  speak(introText, "ko-KR-SunHiNeural", introAudio, "-6%");
  const introSpeech = duration(introAudio);
  const introDuration = introSpeech + 0.7;
  const introSegment = join(lessonSegments, "000-intro.mp4");
  const coverMascot = mascots[lesson.story.coverPose] || mascots.intro;
  encodeSegment(introFrame, coverMascot, introAudio, introSegment, introDuration, {
    width: 430, side: "right", motion: "enter",
  });
  cues.push({ start: clock, end: clock + introSpeech, text: introText });
  segments.push(introSegment);
  clock += introDuration;

  lesson.story.beats.forEach((beat, index) => {
    const line = lesson.lines[beat.line];
    const speech = composeBeatAudio(lesson, beat, index);
    const segmentDuration = speech.narrationSeconds + speech.gap + speech.japaneseSeconds + 0.8;
    const segment = join(lessonSegments, `${String(index + 1).padStart(3, "0")}-story.mp4`);
    const mascot = mascots[beat.pose] || mascots.dance;
    encodeSegment(
      join(lessonFrames, `${index + 1}.png`),
      mascot,
      speech.file,
      segment,
      segmentDuration,
      { width: beat.pose === "hero" ? 350 : 405, side: beat.side, motion: beat.motion },
    );
    cues.push({
      start: clock,
      end: clock + speech.narrationSeconds,
      text: beat.narration,
    });
    const japaneseStart = clock + speech.narrationSeconds + speech.gap;
    cues.push({
      start: japaneseStart,
      end: japaneseStart + speech.japaneseSeconds,
      text: `${line.ja}\n${line.ko}`,
    });
    segments.push(segment);
    clock += segmentDuration;
  });

  const outroAudio = join(audioDir, `${lesson.id}-outro.mp3`);
  speak(lesson.story.outro, "ko-KR-SunHiNeural", outroAudio, "-5%");
  const outroSpeech = duration(outroAudio);
  const outroDuration = outroSpeech + 0.9;
  const outroSegment = join(lessonSegments, "999-outro.mp4");
  encodeSegment(outroFrame, mascots.cheer, outroAudio, outroSegment, outroDuration, {
    width: 410, side: "right", motion: "hop",
  });
  cues.push({ start: clock, end: clock + outroSpeech, text: lesson.story.outro });
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
