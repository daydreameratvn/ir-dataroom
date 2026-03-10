import { meta as phoenixSdkMeta, content as phoenixSdkContent } from './phoenix-sdk';

export interface DocEntry {
  slug: string;
  title: string;
  description: string;
  version: string;
  icon: string;
  packages: readonly string[];
  tags: readonly string[];
  content: string;
}

const docs: DocEntry[] = [
  { ...phoenixSdkMeta, content: phoenixSdkContent },
];

export default docs;

export function getDoc(slug: string): DocEntry | undefined {
  return docs.find((d) => d.slug === slug);
}
