import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LoginForm from "../components/LoginForm";

// Mock the AuthContext
vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../contexts/AuthContext";

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

describe("LoginForm", () => {
  const mockLogin = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      logout: vi.fn(),
    });
  });

  it("renders login form with email and password fields", () => {
    render(<LoginForm onSuccess={mockOnSuccess} />);
    const emailInputs = screen.getAllByPlaceholderText(/anna@pulse.dev/);
    expect(emailInputs.length).toBeGreaterThan(0);
    const passwordInputs = screen.getAllByPlaceholderText(/••••••••/);
    expect(passwordInputs.length).toBeGreaterThan(0);
    const submitButtons = screen.getAllByRole("button", { name: /Войти/ });
    expect(submitButtons.length).toBeGreaterThan(0);
  });

  it("shows demo accounts info", () => {
    render(<LoginForm onSuccess={mockOnSuccess} />);
    expect(screen.getAllByText(/Демо-аккаунты:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/admin@pulse.dev/).length).toBeGreaterThan(0);
  });

  it("calls login with email and password on submit", async () => {
    const user = await userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);
    mockLogin.mockResolvedValue({});

    const emailInputs = screen.getAllByPlaceholderText(/anna@pulse.dev/);
    const passwordInputs = screen.getAllByPlaceholderText(/••••••••/);
    const submitButtons = screen.getAllByRole("button", { name: /Войти/ });

    await user.type(emailInputs[0], "admin@pulse.dev");
    await user.type(passwordInputs[0], "demo1234");
    await user.click(submitButtons[0]);

    expect(mockLogin).toHaveBeenCalledWith("admin@pulse.dev", "demo1234");
  });
});
