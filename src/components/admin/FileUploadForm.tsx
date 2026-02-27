"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, RefreshCw } from "lucide-react";
import { CATEGORIES, getCategoryStyle, sortCategories } from "@/lib/categories";

interface DataroomFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: string;
  uploadedAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export function FileManager() {
  const [files, setFiles] = useState<DataroomFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("Financials");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/files");
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFiles(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load files.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async () => {
    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.length) {
      toast({
        title: "Error",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      formData.append("category", selectedCategory);

      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to upload file");
      }
      toast({ title: "Success", description: "File uploaded successfully." });
      fileInput.value = "";
      fetchFiles();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete file");
      toast({ title: "Success", description: "File deleted." });
      fetchFiles();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete file.",
        variant: "destructive",
      });
    }
  };

  // Group files by category
  const groupedFiles = files.reduce<Record<string, DataroomFile[]>>(
    (acc, file) => {
      const cat = file.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(file);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Files</h2>
          <p className="text-muted-foreground">
            Manage dataroom files and documents.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchFiles}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload File</CardTitle>
          <CardDescription>
            Add a new document to the dataroom.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="file">File</Label>
              <Input id="file" type="file" ref={fileInputRef} />
            </div>
            <div className="w-48 space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={handleUpload} disabled={uploading}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Files by Category */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading files...
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No files uploaded yet.
        </div>
      ) : (
        sortCategories(Object.keys(groupedFiles)).map((category) => {
          const categoryFiles = groupedFiles[category];
          return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {category}
                <Badge variant="secondary">{categoryFiles.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryFiles.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {file.name}
                          <span
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                            style={getCategoryStyle(file.category)}
                          >
                            {file.category}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{file.mimeType}</Badge>
                      </TableCell>
                      <TableCell>{formatFileSize(file.size)}</TableCell>
                      <TableCell>
                        {new Date(file.uploadedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(file.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          );
        })
      )}
    </div>
  );
}
