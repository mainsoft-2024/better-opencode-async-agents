import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TypingIndicator } from "../TypingIndicator";

describe("TypingIndicator", () => {
  it("renders 3 dots", () => {
    const { container } = render(<TypingIndicator />);
    const dots = container.querySelectorAll("span");
    expect(dots.length).toBe(3);
  });

  it("accepts className prop", () => {
    const { container } = render(<TypingIndicator className="my-custom-class" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("my-custom-class");
  });
});
