#!/usr/bin/env bun
/**
 * Safely clean forensics test output folder.
 *
 * Only deletes known output file types (.json, .jpg, .png) inside
 * the test-cases-v2-output directory. Never uses rm -rf.
 *
 * Usage:
 *   bun scripts/forensics-clean-output.ts              # clean all cases
 *   bun scripts/forensics-clean-output.ts case-03      # clean specific case
 *   bun scripts/forensics-clean-output.ts --dry-run    # preview only
 */

import { readdirSync, unlinkSync, rmdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const OUTPUT_BASE = "/Volumes/work/git/papaya-org/test-cases-v2-output";

// Safety: never operate outside the output directory
if (!OUTPUT_BASE.endsWith("-output")) {
  console.error("SAFETY: OUTPUT_BASE must end with '-output'");
  process.exit(1);
}

// Safe file extensions we'll delete
const SAFE_EXTS = new Set([".json", ".jpg", ".jpeg", ".png", ".webp"]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetCase = args.find((a) => !a.startsWith("--"));

if (!existsSync(OUTPUT_BASE)) {
  console.log(`Output folder does not exist: ${OUTPUT_BASE}`);
  process.exit(0);
}

let totalFiles = 0;
let totalDirs = 0;
let totalBytes = 0;

function cleanDir(dir: string): boolean {
  if (!existsSync(dir)) return true;

  const entries = readdirSync(dir, { withFileTypes: true });
  let allRemoved = true;

  for (const entry of entries) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      const empty = cleanDir(full);
      if (empty) {
        if (dryRun) {
          console.log(`  [rmdir] ${full}`);
        } else {
          rmdirSync(full);
        }
        totalDirs++;
      } else {
        allRemoved = false;
      }
    } else if (SAFE_EXTS.has(extname(entry.name).toLowerCase())) {
      const size = statSync(full).size;
      if (dryRun) {
        console.log(`  [rm] ${entry.name} (${Math.round(size / 1024)} KB)`);
      } else {
        unlinkSync(full);
      }
      totalFiles++;
      totalBytes += size;
    } else {
      // Unknown file type — skip
      console.log(`  [skip] ${full} (unknown type)`);
      allRemoved = false;
    }
  }

  return allRemoved;
}

console.log(dryRun ? "DRY RUN — no files will be deleted\n" : "");

if (targetCase) {
  const caseDir = join(OUTPUT_BASE, targetCase);
  if (!existsSync(caseDir)) {
    console.log(`Case folder not found: ${caseDir}`);
    process.exit(1);
  }
  console.log(`Cleaning: ${caseDir}`);
  const empty = cleanDir(caseDir);
  if (empty && !dryRun) {
    rmdirSync(caseDir);
    totalDirs++;
  }
} else {
  const cases = readdirSync(OUTPUT_BASE, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (cases.length === 0) {
    console.log("Output folder is empty.");
    process.exit(0);
  }

  console.log(`Cleaning ${cases.length} case(s): ${cases.join(", ")}`);
  for (const c of cases) {
    console.log(`\n  ${c}/`);
    const caseDir = join(OUTPUT_BASE, c);
    const empty = cleanDir(caseDir);
    if (empty && !dryRun) {
      rmdirSync(caseDir);
      totalDirs++;
    }
  }
}

console.log(`\n${dryRun ? "Would delete" : "Deleted"}: ${totalFiles} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB), ${totalDirs} directories`);
