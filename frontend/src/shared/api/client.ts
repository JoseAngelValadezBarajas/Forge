import { ApiError } from "./errors";
import { isTauri } from "@tauri-apps/api/core";
import { desktopApiFetch } from "./desktopTransport";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return isTauri() ? desktopApiFetch(path, init) : fetch(path, init);
}

function responseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const extended = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  const regular = disposition.match(/filename\s*=\s*(?:"([^"]*)"|([^;]+))/i);
  let candidate = extended ?? regular?.[1] ?? regular?.[2]?.trim() ?? fallback;
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // Keep the undecoded value; the filename is still sanitized below.
  }
  candidate = candidate.split(/[\\/]/).pop() ?? "";
  candidate = Array.from(candidate, (character) => {
    const code = character.charCodeAt(0);
    return '<>:"|?*'.includes(character) || code < 0x20 || code === 0x7f ? "_" : character;
  }).join("").replace(/[. ]+$/g, "").trim();
  if (!candidate || candidate === "." || candidate === "..") return fallback;
  const stem = candidate.split(".", 1)[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) candidate = `_${candidate}`;
  return candidate.slice(0, 180) || fallback;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { detail?: string | { msg?: string }[] };
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail)) return payload.detail.map((item) => item.msg).join("; ");
  } catch {
    // Preserve a stable user-facing error when the server did not return JSON.
  }
  return "Forge could not complete that request.";
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const requestInit = {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  };
  const response = await apiFetch(`/api${path}`, requestInit);
  if (!response.ok) {
    throw new ApiError(response.status, await errorDetail(response));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function downloadFile(path: string, fallbackFilename = "forge-download"): Promise<void> {
  const response = await apiFetch(path);
  if (!response.ok) throw new ApiError(response.status, await errorDetail(response));
  const filename = responseFilename(response.headers.get("Content-Disposition"), fallbackFilename);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
