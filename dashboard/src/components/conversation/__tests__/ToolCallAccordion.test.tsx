import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolCallAccordion } from "../ToolCallAccordion";

// react-use-measure requires ResizeObserver which jsdom does not provide
vi.mock("react-use-measure", () => ({
  default: () => [(el: unknown) => el, { height: 100, width: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0 }],
}));

const toolCalls = [
  {
    name: "read_file",
    id: "tc_1",
    input: { path: "/foo/bar.ts" },
    output: "file content here",
  },
];

describe("ToolCallAccordion", () => {
  it("renders collapsed by default (aria-expanded is false)", () => {
    render(<ToolCallAccordion toolCalls={toolCalls} messageId="msg1" />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("shows tool name", () => {
    render(<ToolCallAccordion toolCalls={toolCalls} messageId="msg1" />);
    expect(screen.getByText("read_file")).toBeTruthy();
  });

  it("expands on click (aria-expanded becomes true)", () => {
    render(<ToolCallAccordion toolCalls={toolCalls} messageId="msg1" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders args and results labels after expansion", () => {
    render(<ToolCallAccordion toolCalls={toolCalls} messageId="msg1" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Arguments")).toBeTruthy();
    expect(screen.getByText("Result")).toBeTruthy();
  });

  it("uses stable anchor id", () => {
    const { container } = render(<ToolCallAccordion toolCalls={toolCalls} messageId="msg1" />);
    expect(container.querySelector("#tool-msg1-0")).toBeTruthy();
  });

  it("returns null when toolCalls is empty", () => {
    const { container } = render(<ToolCallAccordion toolCalls={[]} messageId="msg1" />);
    expect(container.firstChild).toBeNull();
  });
});
