export default function StreamingIndicator() {
  return (
    <div className="flex justify-start px-2 py-1">
      <div className="flex items-center gap-1.5">
        <div className="size-1.5 animate-pulse rounded-full bg-primary" />
        <div className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:0.2s]" />
        <div className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:0.4s]" />
      </div>
    </div>
  );
}
