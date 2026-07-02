export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function trimText(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.35));
}

export function safeMarkdownUrl(url: string) {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return "";
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

const RELATIVE_STEPS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  let delta = (then - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto", style: "narrow" });
  for (const [step, unit] of RELATIVE_STEPS) {
    if (Math.abs(delta) < step) return formatter.format(Math.round(delta), unit);
    delta /= step;
  }
  return "";
}
