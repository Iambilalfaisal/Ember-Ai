import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("the shell", () => {
  it("has a main landmark named after the product", () => {
    render(<Home />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Ember" })).toBeInTheDocument();
  });
});
