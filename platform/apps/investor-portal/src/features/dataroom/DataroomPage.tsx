import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { listDocuments, getRound } from '@/lib/api';
import CategoryNav from '../components/CategoryNav';
import DocumentCard from '../components/DocumentCard';

export default function DataroomPage() {
  const { slug } = useParams<{ slug: string }>();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: roundData } = useQuery({
    queryKey: ['round', slug],
    queryFn: () => getRound(slug!),
    enabled: !!slug,
  });

  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['documents', slug, activeCategory],
    queryFn: () => listDocuments(slug!, activeCategory ?? undefined),
    enabled: !!slug,
  });

  // Extract unique categories from all documents
  const { data: allDocuments } = useQuery({
    queryKey: ['documents', slug, null],
    queryFn: () => listDocuments(slug!),
    enabled: !!slug,
  });

  const categories = allDocuments
    ? [...new Set(allDocuments.map((d) => d.category))]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {roundData?.round.name ?? 'Data Room'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and access confidential documents for this round.
        </p>
      </div>

      {/* Category Navigation */}
      {categories.length > 1 && (
        <CategoryNav
          categories={categories}
          active={activeCategory}
          onChange={setActiveCategory}
        />
      )}

      {/* Documents Grid */}
      {isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <p className="text-sm text-destructive">
            Failed to load documents. Please try again later.
          </p>
        </div>
      ) : !documents || documents.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">
            No documents available
            {activeCategory ? ` in "${activeCategory}"` : ''}.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} document={doc} slug={slug!} />
          ))}
        </div>
      )}
    </div>
  );
}
