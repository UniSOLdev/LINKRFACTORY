import fs from "fs";
import path from "path";

const BLOB_PATH = "linkr-factory/state.sqlite";

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

/** Replace the local SQLite file with the private Blob copy, when one exists. */
export async function pullDatabase(file: string, close: () => void): Promise<void> {
  if (!blobConfigured()) return;
  const { get } = await import("@vercel/blob");
  const result = await get(BLOB_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return;
  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
  close();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${file}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
  }
}

/** Upload the SQLite file so the next server instance can continue the same run. */
export async function pushDatabase(file: string): Promise<void> {
  if (!blobConfigured()) return;
  if (!fs.existsSync(file)) return;
  const { put } = await import("@vercel/blob");
  await put(BLOB_PATH, fs.readFileSync(file), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });
}
