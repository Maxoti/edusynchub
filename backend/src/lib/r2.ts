import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID as string;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID as string;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY as string;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME as string;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.warn("[r2] R2 credentials are not fully set - uploads will fail.");
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/**
 * Generates a short-lived presigned PUT URL so the browser can upload
 * directly to R2 without the file passing through this server.
 */
export async function getPresignedUploadUrl(
  teacherId: number,
  fileName: string,
  fileType: string
): Promise<{ uploadUrl: string; fileKey: string }> {
  const uniquePrefix = randomBytes(8).toString("hex");
  const fileKey = `papers/${teacherId}/${uniquePrefix}-${sanitizeFileName(fileName)}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileKey,
    ContentType: fileType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes

  return { uploadUrl, fileKey };
}



/**
 * Generates a short-lived presigned GET URL so a teacher can view/download
 * their own uploaded file directly from R2.
 */
export async function getPresignedDownloadUrl(fileKey: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileKey,
  });

  return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes
}


/**
 * Best-effort delete of a file from R2. Callers should not fail the
 * whole operation if this throws - the database row is the source of
 * truth for what a teacher owns; an orphaned R2 object is cheap to
 * clean up later and not worth blocking a delete over.
 */
export async function deleteR2Object(fileKey: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: fileKey }));
}
