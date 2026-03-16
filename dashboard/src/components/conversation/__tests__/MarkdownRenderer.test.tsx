import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownRenderer } from '../MarkdownRenderer';

// Mock shiki so tests don't await WASM loading
vi.mock('../../../utils/shikiHighlighter', () => ({
  getHighlighter: vi.fn().mockRejectedValue(new Error('shiki not available in test env')),
  resetHighlighterSingleton: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MarkdownRenderer', () => {
  it('renders plain text', () => {
    render(<MarkdownRenderer content="Hello, world!" />);
    expect(screen.getByText('Hello, world!')).toBeTruthy();
  });

  it('renders markdown headings', () => {
    render(<MarkdownRenderer content="# Heading 1" />);
    const h1 = document.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1?.textContent).toBe('Heading 1');
  });

  it('renders unordered lists', () => {
    const { container } = render(<MarkdownRenderer content={"- item one\n- item two"} />);
    const items = container.querySelectorAll('li');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('renders links', () => {
    render(<MarkdownRenderer content="[click me](https://example.com)" />);
    const link = document.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.textContent).toBe('click me');
  });

  it('renders inline code with styling', () => {
    render(<MarkdownRenderer content="Use `const` keyword" />);
    const code = document.querySelector('code');
    expect(code).toBeTruthy();
    expect(code?.textContent).toBe('const');
    // Should have inline styling classes
    expect(code?.className).toContain('bg-gray-700');
  });

  it('renders fenced code block as fallback pre/code when shiki unavailable', async () => {
    render(<MarkdownRenderer content={'```typescript\nconst x = 1;\n```'} />);
    // Since shiki mock rejects, fallback pre/code should render
    // Give a tick for the effect to run and reject
    await new Promise((r) => setTimeout(r, 0));
    const pre = document.querySelector('pre');
    expect(pre).toBeTruthy();
    const code = pre?.querySelector('code');
    expect(code?.textContent).toContain('const x = 1;');
  });

  it('renders GFM tables', () => {
    const tableMarkdown = "| A | B |\n|---|---|\n| 1 | 2 |";
    const { container } = render(<MarkdownRenderer content={tableMarkdown} />);
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    const cells = container.querySelectorAll('td');
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  it('renders GFM strikethrough', () => {
    render(<MarkdownRenderer content="~~deleted~~" />);
    const del = document.querySelector('del');
    expect(del).toBeTruthy();
    expect(del?.textContent).toBe('deleted');
  });

  it('applies custom className to wrapper', () => {
    const { container } = render(
      <MarkdownRenderer content="text" className="my-custom-class" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper?.className).toContain('my-custom-class');
  });
});