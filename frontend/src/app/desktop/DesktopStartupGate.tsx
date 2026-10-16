import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

type RuntimeStatus = { state: "starting" | "ready" | "failed" | "stopped"; message?: string | null };
type GateState = { state: "starting" | "ready" | "failed"; message?: string };

export function DesktopStartupGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<GateState>({ state: isTauri() ? "starting" : "ready" });

  const checkStatus = useCallback(async (active: () => boolean) => {
    try {
      const status = await invoke<RuntimeStatus>("desktop_runtime_status");
      if (!active()) return;
      if (status.state === "ready") {
        setGate({ state: "ready" });
      } else if (status.state === "failed" || status.state === "stopped") {
        setGate({ state: "failed", message: status.message ?? "Forge's local service is unavailable." });
      } else {
        setGate({ state: "starting" });
      }
    } catch {
      if (active()) setGate({ state: "failed", message: "Forge could not check its local service." });
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let timer: number | undefined;
    const active = () => !disposed;
    const poll = async () => {
      await checkStatus(active);
      if (active()) timer = window.setTimeout(poll, 400);
    };
    void poll();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [checkStatus]);

  async function retry() {
    setGate({ state: "starting" });
    try {
      await invoke("desktop_retry_start");
      const status = await invoke<RuntimeStatus>("desktop_runtime_status");
      if (status.state === "failed" || status.state === "stopped") {
        setGate({ state: "failed", message: status.message ?? "Forge's local service is unavailable." });
      }
    } catch {
      setGate({ state: "failed", message: "Forge could not restart its local service." });
    }
  }

  if (gate.state === "ready") return children;
  if (gate.state === "starting") {
    return <main className="desktop-startup" aria-live="polite"><p role="status">Starting Forge local service…</p></main>;
  }
  return (
    <main className="desktop-startup" aria-live="polite">
      <h1>Forge could not start</h1>
      <p role="alert">{gate.message}</p>
      <p>Log file: %LOCALAPPDATA%\Forge\logs\forge-desktop.log</p>
      <button className="button primary" onClick={() => void retry()} type="button">Retry local service</button>
    </main>
  );
}
