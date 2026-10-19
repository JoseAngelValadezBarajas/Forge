import { invoke, isTauri } from "@tauri-apps/api/core";

type DesktopApiRequest = {
  request_id: string;
  method: string;
  path_and_query: string;
  body?: string;
};

type DesktopApiResponse = {
  status: number;
  contentType: string | null;
  contentDisposition: string | null;
  bodyBase64: string;
  saved?: boolean;
};

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function responseFromDesktop(result: DesktopApiResponse): Response {
  const headers = new Headers();
  if (result.contentType) headers.set("Content-Type", result.contentType);
  if (result.contentDisposition) headers.set("Content-Disposition", result.contentDisposition);
  const bytes = decodeBase64(result.bodyBase64);
  const body = result.status === 204 || result.status === 304 ? null : new ArrayBuffer(bytes.byteLength);
  if (body) new Uint8Array(body).set(bytes);
  return new Response(body, {
    status: result.status,
    headers,
  });
}

export async function desktopApiFetch(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  if (!isTauri()) throw new TypeError("Desktop API transport is only available in Forge Desktop.");
  const signal = init.signal;
  if (signal?.aborted) throw abortError();
  if (init.body !== undefined && init.body !== null && typeof init.body !== "string") {
    throw new TypeError("Forge Desktop API requests must use a JSON string body.");
  }

  const requestId = crypto.randomUUID();
  const request: DesktopApiRequest = {
    request_id: requestId,
    method: (init.method ?? "GET").toUpperCase(),
    path_and_query: pathAndQuery,
    ...(typeof init.body === "string" ? { body: init.body } : {}),
  };
  let rejectOnAbort: ((reason: DOMException) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => { rejectOnAbort = reject; });
  const onAbort = () => {
    rejectOnAbort?.(abortError());
    void invoke<boolean>("desktop_cancel_api_request", { requestId }).catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (signal?.aborted) throw abortError();
    const pending = invoke<DesktopApiResponse>("desktop_api_request", { request });
    const result = await (signal ? Promise.race([pending, aborted]) : pending);
    return responseFromDesktop(result);
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function desktopApiDownload(pathAndQuery: string, fallbackFilename: string): Promise<Response> {
  if (!isTauri()) throw new TypeError("Desktop API transport is only available in Forge Desktop.");
  const request: DesktopApiRequest = {
    request_id: crypto.randomUUID(),
    method: "GET",
    path_and_query: pathAndQuery,
  };
  const result = await invoke<DesktopApiResponse>("desktop_save_download", {
    request,
    fallbackFilename,
  });
  return responseFromDesktop(result);
}
