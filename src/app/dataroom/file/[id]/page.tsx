import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ViewTracker } from "@/components/dataroom/ViewTracker";
import { getCategoryStyle } from "@/lib/categories";
import { hasDataroomAccess } from "@/lib/statuses";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export default async function FileViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });

  if (!investor || !hasDataroomAccess(investor.status)) {
    redirect("/dataroom/nda");
  }

  const { id } = await params;

  const file = await prisma.file.findUnique({ where: { id } });

  if (!file) {
    notFound();
  }

  const isPdf = file.mimeType === "application/pdf";
  const isVideo = file.mimeType.startsWith("video/");
  const isExcel =
    file.mimeType.includes("spreadsheet") || file.mimeType.includes("excel");
  const hasPreview = isPdf || isVideo;

  return (
    <div>
      <ViewTracker fileId={file.id} />

      <div className="mb-6">
        <Link
          href="/dataroom"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Files
        </Link>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">{file.name}</CardTitle>
              <div className="mt-2 flex items-center gap-3">
                <span
                  className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                  style={getCategoryStyle(file.category)}
                >
                  {file.category}
                </span>
                <span className="text-sm text-gray-500">
                  {formatFileSize(file.size)}
                </span>
                <span className="text-sm text-gray-500">
                  Uploaded {new Date(file.uploadedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <Button asChild>
              <a href={`/api/files/${file.id}/download`}>Download</a>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {isPdf && (
        <div className="overflow-hidden rounded-lg border">
          <iframe
            src={`/api/files/${file.id}/view`}
            className="h-[80vh] w-full"
            title={file.name}
          />
        </div>
      )}

      {isVideo && (
        <div className="overflow-hidden rounded-lg border bg-black">
          <video
            controls
            className="mx-auto max-h-[80vh] w-full"
            src={`/api/files/${file.id}/view`}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {!hasPreview && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-gray-500 text-sm">
              {isExcel
                ? "Excel files cannot be previewed in the browser. Use the download button above."
                : "Preview is not available for this file type. Use the download button above."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
