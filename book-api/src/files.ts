import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Config } from "./config";
import { createToken, nowSeconds } from "./tokens";
import type { BookFormat } from "./tokens";

const DOWNLOAD_URL_SECONDS: number = 300;

const FILE_NAMES: Record<BookFormat, string> = {
  pdf: "Disqualified - Luke Vasilion.pdf",
  epub: "Disqualified - Luke Vasilion.epub",
};

const CONTENT_TYPES: Record<BookFormat, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
};

const s3: S3Client = new S3Client({});

export interface DownloadLinks {
  pdf: string;
  pdfSave: string;
  epub: string;
  expiresAt: number;
}

export function downloadLinks(config: Config, apiBase: string, sessionId: string): DownloadLinks {
  const expiresAt: number = nowSeconds() + config.linkTtlSeconds;
  const build = (format: BookFormat): string =>
    `${apiBase}/download?t=${createToken({ sessionId, format, expiresAt }, config.linkSecret)}`;
  const pdf: string = build("pdf");
  return { pdf, pdfSave: `${pdf}&save=1`, epub: build("epub"), expiresAt };
}

export function presignFile(config: Config, format: BookFormat, save: boolean): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: format === "pdf" ? config.pdfKey : config.epubKey,
      ResponseContentDisposition: `${format === "pdf" && !save ? "inline" : "attachment"}; filename="${FILE_NAMES[format]}"`,
      ResponseContentType: CONTENT_TYPES[format],
    }),
    { expiresIn: DOWNLOAD_URL_SECONDS },
  );
}
