import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { downloadMock, isTauriMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  isTauriMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: isTauriMock }));
vi.mock("../api/client", () => ({ downloadFile: downloadMock }));

import { DownloadLink } from "./DownloadLink";

afterEach(() => {
  cleanup();
  downloadMock.mockReset();
});

describe("DownloadLink", () => {
  test("uses the existing browser anchor without intercepting navigation", () => {
    isTauriMock.mockReturnValue(false);
    render(<DownloadLink href="/api/export" download="export.json">Export JSON</DownloadLink>);
    const link = screen.getByRole("link", { name: "Export JSON" });
    expect(link).toHaveAttribute("href", "/api/export");
    expect(link).toHaveAttribute("download", "export.json");
    expect(downloadMock).not.toHaveBeenCalled();
  });

  test("downloads through the Rust transport and announces failures accessibly", async () => {
    isTauriMock.mockReturnValue(true);
    downloadMock.mockRejectedValue(new Error("Export failed"));
    render(<DownloadLink href="/api/export" className="button">Export JSON</DownloadLink>);
    fireEvent.click(screen.getByRole("link", { name: "Export JSON" }));

    await waitFor(() => expect(downloadMock).toHaveBeenCalledWith("/api/export", "forge-download"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Export failed");
  });
});
