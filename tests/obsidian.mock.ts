export class TFile {
  path: string;
  basename: string;

  constructor(path: string) {
    this.path = path;
    this.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

