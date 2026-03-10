/// <reference types="vite/client" />

declare const __BUILD_ID__: string;

declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module 'sample/entry' {
  import type { ComponentType } from 'react';
  interface EntryProps {
    basePath?: string;
  }
  const Entry: ComponentType<EntryProps>;
  export default Entry;
}
