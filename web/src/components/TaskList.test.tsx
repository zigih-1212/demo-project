import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TaskList from "../components/TaskList";

// Mock the api module
vi.mock("../services/api", () => ({
  api: {
    listTasks: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

import { api } from "../services/api";

const mockListTasks = api.listTasks as ReturnType<typeof vi.fn>;
const mockUpdateTask = api.updateTask as ReturnType<typeof vi.fn>;
const mockDeleteTask = api.deleteTask as ReturnType<typeof vi.fn>;

describe("TaskList", () => {
  const mockTasks = [
    {
      id: "1",
      title: "Первая задача",
      description: "Описание первой",
      status: "todo" as const,
      priority: "high" as const,
      assignee: "Анна",
      created_by: null,
      due_date: null,
      created_at: "2026-10-01T10:00:00.000Z",
      updated_at: "2026-10-01T10:00:00.000Z",
    },
    {
      id: "2",
      title: "Вторая задача",
      description: "",
      status: "done" as const,
      priority: "medium" as const,
      assignee: "unassigned",
      created_by: null,
      due_date: null,
      created_at: "2026-10-02T10:00:00.000Z",
      updated_at: "2026-10-02T10:00:00.000Z",
    },
  ];

  const mockPaginatedResponse = {
    items: mockTasks,
    total: 2,
    page: 1,
    pageSize: 10,
    pages: 1,
    cached: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListTasks.mockResolvedValue(mockPaginatedResponse);
    mockUpdateTask.mockResolvedValue(mockTasks[0]);
    mockDeleteTask.mockResolvedValue({ ok: true });
  });

  it("renders task list table", async () => {
    render(<TaskList />);
    await waitFor(() => {
      expect(screen.getAllByText(/Задачи/).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Первая задача").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Вторая задача").length).toBeGreaterThan(0);
  });

  it("shows loading state", () => {
    mockListTasks.mockImplementation(() => new Promise(() => {}));
    render(<TaskList />);
    const loading = screen.getAllByText(/Загрузка…/);
    expect(loading.length).toBeGreaterThan(0);
  });

  it("displays task priority badges", async () => {
    render(<TaskList />);
    await waitFor(() => {
      expect(screen.getAllByText("high").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/К выполнению/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Готово/).length).toBeGreaterThan(0);
  });

  it("calls api.listTasks on mount", async () => {
    render(<TaskList />);
    await waitFor(() => {
      expect(mockListTasks).toHaveBeenCalled();
    });
  });

  it("updates task status on dropdown change", async () => {
    const user = await userEvent.setup();
    render(<TaskList />);
    await waitFor(() => {
      expect(screen.getAllByText("Первая задача").length).toBeGreaterThan(0);
    });

    // Find status select (the one with "К выполнению" option, not the pageSize select)
    const allSelects = screen.getAllByRole("combobox");
    const statusSelect = allSelects.find((el) =>
      el.innerHTML.includes("К выполнению")
    );
    expect(statusSelect).toBeDefined();

    await user.selectOptions(statusSelect!, "В работе");

    expect(mockUpdateTask).toHaveBeenCalledWith("1", { status: "in_progress" });
  });

  it("deletes task on button click", async () => {
    const user = await userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TaskList />);
    await waitFor(() => {
      expect(screen.getAllByText("Первая задача").length).toBeGreaterThan(0);
    });

    const deleteButtons = screen.getAllByRole("button", { name: /Удалить/ });
    await user.click(deleteButtons[0]);

    expect(mockDeleteTask).toHaveBeenCalledWith("1");
  });

  it("shows empty state when no tasks", async () => {
    mockListTasks.mockResolvedValue({
      ...mockPaginatedResponse,
      items: [],
      total: 0,
    });
    render(<TaskList />);
    await waitFor(() => {
      expect(screen.getAllByText(/Задач не найдено/).length).toBeGreaterThan(0);
    });
  });
});
