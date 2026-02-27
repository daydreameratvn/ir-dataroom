import { Tabs, TabsList, TabsTrigger } from '@papaya/shared-ui';

interface CategoryNavProps {
  categories: string[];
  active: string | null;
  onChange: (category: string | null) => void;
}

export default function CategoryNav({
  categories,
  active,
  onChange,
}: CategoryNavProps) {
  return (
    <Tabs
      value={active ?? '__all__'}
      onValueChange={(v) => onChange(v === '__all__' ? null : v)}
    >
      <TabsList variant="line">
        <TabsTrigger value="__all__">All</TabsTrigger>
        {categories.map((cat) => (
          <TabsTrigger key={cat} value={cat} className="capitalize">
            {cat.replace(/_/g, ' ')}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
