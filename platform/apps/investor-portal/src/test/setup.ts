import '@testing-library/jest-dom/vitest';

// jsdom doesn't have ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't have scrollIntoView
Element.prototype.scrollIntoView = function () {};
