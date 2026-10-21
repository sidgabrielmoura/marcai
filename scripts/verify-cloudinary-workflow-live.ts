import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import {
  createTenantUploadCredentials,
  inspectCloudinaryAsset,
  deleteCloudinaryAsset,
} from "../src/infrastructure/cloudinary/cloudinary-service";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

async function verify() {
  const credentials = createTenantUploadCredentials({
    organizationId: "workflow-audit",
    scope: "evidence",
    taskId: "smoke",
    resourceType: "image",
    allowedFormats: ["png"],
    publicId: randomUUID(),
  });
  const expectedId = `${credentials.folder}/${credentials.publicId}`;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=",
    "base64",
  );
  let createdId: string | null = null;
  try {
    const form = new FormData();
    form.set("file", new Blob([bytes], { type: "image/png" }), "audit.png");
    for (const [key, value] of Object.entries(credentials.uploadParams))
      form.set(key, String(value));
    const response = await fetch(credentials.uploadUrl, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error("Cloudinary rejected the isolated workflow test upload.");
    if (result.public_id !== expectedId)
      throw new Error("Cloudinary returned an unexpected asset identity.");
    createdId = expectedId;
    const metadata = await inspectCloudinaryAsset(expectedId, "image");
    console.log(
      "Metadata check:",
      JSON.stringify({
        expectedBytes: bytes.length,
        actualBytes: metadata.fileSize,
        format: metadata.format,
        resourceType: metadata.resourceType,
        identityMatches: metadata.publicId === expectedId,
      }),
    );
    if (
      metadata.fileSize <= 0 ||
      metadata.fileSize > 10 * 1024 * 1024 ||
      metadata.format !== "png" ||
      metadata.publicId !== expectedId
    )
      throw new Error(
        "Cloudinary metadata did not match the authorized upload.",
      );
    console.log(
      "PASS: signed multipart upload and provider metadata verification.",
    );
  } finally {
    if (createdId) {
      if (
        !createdId.startsWith(
          "tarefai/orgs/workflow-audit/tasks/smoke/evidence/",
        )
      )
        throw new Error("Refusing to remove an asset outside the test folder.");
      if (!(await deleteCloudinaryAsset(createdId, "image")))
        throw new Error(
          "The isolated Cloudinary test asset could not be removed.",
        );
      console.log("PASS: isolated test asset removed.");
    }
  }
}
verify().catch((error: unknown) => {
  console.error(
    "FAIL: Cloudinary workflow test.",
    JSON.stringify({
      kind: error instanceof Error ? error.name : "ProviderError",
      code:
        typeof error === "object" && error && "http_code" in error
          ? error.http_code
          : null,
    }),
  );
  process.exitCode = 1;
});
