import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SupabaseSignIn from "./SupabaseSignIn";

describe("Supabase sign-in", () => {
  it("submits an existing account", async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    const onSignUp = vi.fn().mockResolvedValue(false);
    render(<SupabaseSignIn onSignIn={onSignIn} onSignUp={onSignUp} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(onSignIn).toHaveBeenCalledWith("user@example.com", "password");
    });
    expect(onSignUp).not.toHaveBeenCalled();
  });

  it("creates an account and explains email confirmation", async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    const onSignUp = vi.fn().mockResolvedValue(false);
    render(<SupabaseSignIn onSignIn={onSignIn} onSignUp={onSignUp} />);

    fireEvent.click(screen.getByRole("button", { name: "New here? Create an account" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(onSignUp).toHaveBeenCalledWith("user@example.com", "password");
    });
    expect((await screen.findByRole("status")).textContent).toContain("Check your email to confirm it");
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("shows authentication errors without logging credentials", async () => {
    const onSignIn = vi.fn().mockRejectedValue(new Error("Invalid login credentials"));
    const onSignUp = vi.fn().mockResolvedValue(false);
    render(<SupabaseSignIn onSignIn={onSignIn} onSignUp={onSignUp} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Invalid login credentials");
  });
});
