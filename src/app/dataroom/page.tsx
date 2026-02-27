import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, FileSpreadsheet, Video, File } from "lucide-react";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function getFileIcon(mimeType: string) {
  if (mimeType === "application/pdf") {
    return <FileText className="h-8 w-8 text-red-500" />;
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
  }
  if (mimeType.startsWith("video/")) {
    return <Video className="h-8 w-8 text-blue-500" />;
  }
  return <File className="h-8 w-8 text-gray-500" />;
}

export default async function DataroomPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });

  if (!investor || investor.status !== "nda_accepted") {
    redirect("/dataroom/nda");
  }

  const files = await prisma.file.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Group files by category
  const grouped: Record<string, typeof files> = {};
  for (const file of files) {
    if (!grouped[file.category]) {
      grouped[file.category] = [];
    }
    grouped[file.category].push(file);
  }

  const categories = Object.keys(grouped).sort();

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Documents</h2>

      {categories.length === 0 && (
        <p className="text-gray-600">No documents are available yet.</p>
      )}

      {categories.map((category) => (
        <div key={category} className="mb-8">
          <h3 className="mb-4 text-lg font-semibold text-gray-800">
            {category}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped[category].map((file) => (
              <Card key={file.id} className="transition-shadow hover:shadow-md">
                <Link href={`/dataroom/file/${file.id}`}>
                  <CardHeader className="flex flex-row items-center gap-4 pb-2">
                    {getFileIcon(file.mimeType)}
                    <CardTitle className="text-base leading-tight">
                      {file.name}
                    </CardTitle>
                  </CardHeader>
                </Link>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      <p>{formatFileSize(file.size)}</p>
                      <p>
                        {new Date(file.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/files/${file.id}/download`}>Download</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Separator className="mt-8" />
        </div>
      ))}
    </div>
  );
}
