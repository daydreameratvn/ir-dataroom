import { Routes, Route } from 'react-router-dom';
import DocsIndex from './DocsIndex';
import DocViewer from './DocViewer';

export default function DocsPage() {
  return (
    <Routes>
      <Route index element={<DocsIndex />} />
      <Route path=":slug" element={<DocViewer />} />
    </Routes>
  );
}
