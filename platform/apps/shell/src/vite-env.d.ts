/// <reference types="vite/client" />

declare module 'sample/entry' {
  import type { ComponentType } from 'react';
  interface EntryProps {
    basePath?: string;
  }
  const Entry: ComponentType<EntryProps>;
  export default Entry;
}
