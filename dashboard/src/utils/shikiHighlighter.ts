import type { Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark'],
        langs: [
          'typescript',
          'javascript',
          'json',
          'bash',
          'python',
          'tsx',
          'jsx',
          'css',
          'html',
          'markdown',
        ],
      })
    );
  }
  return highlighterPromise;
}

// For testing: reset singleton
export function resetHighlighterSingleton() {
  highlighterPromise = null;
}