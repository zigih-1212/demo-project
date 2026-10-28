import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "../components/Dashboard";

// Mock the api module
vi.mock("../services/api", () => ({
  api: {
    summary: vi.fn(),
  },
}));

import { api } from "../services/api";

const mockSummary = api.summary as ReturnType<typeof vi.fn>;

describe("Dashboard", () => {
  const mockSummaryData = {
    total: 10,
    byStatus: { todo: 3, in_progress: 2, done: 4, blocked: 1 },
    byPriority: { low: 2, medium: 4, high: 3, critical: 1 },
    overdueCount: 1,
    completionRate: 40,
    createdPerDay: [
      { date: "2026-10-01", count: 2 },
      { date: "2026-10-02", count: 3 },
    ],
    generatedAt: "2026-10-28T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSummary.mockResolvedValue(mockSummaryData);
  });

  it("renders dashboard title", async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText(/Обзор проекта/)).toBeTruthy();
    });
  });

  it("shows loading state initially", () => {
    render(<Dashboard />);
    const loadingElements = screen.getAllByText(/Загрузка метрик…/);
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it("displays task stats after loading", async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("10")).toBeTruthy();
    });
    expect(screen.getAllByText(/Всего задач/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/В работе/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Готово/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Просрочено/).length).toBeGreaterThan(0);
  });

  it("displays correct counts for each status", async () => {
    render(<Dashboard />);
    await waitFor(() => {
      const count4 = screen.getAllByText("4");
      expect(count4.length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("displays distribution by status", async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(
        screen.getAllByText(/Распределение по статусам/).length
      ).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/todo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/in_progress/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/done/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/blocked/).length).toBeGreaterThan(0);
  });

  it("calls api.summary on mount", async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(mockSummary).toHaveBeenCalled();
    });
  });
});
