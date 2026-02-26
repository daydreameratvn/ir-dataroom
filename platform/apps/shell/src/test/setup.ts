import '@testing-library/jest-dom/vitest';

// jsdom doesn't have ResizeObserver — cmdk needs it
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement scrollIntoView — cmdk calls it on items
Element.prototype.scrollIntoView = function () {};
