import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const PART_SIZE = 512 * 1024;
const BIG_FILE_THRESHOLD = 10 * 1024 * 1024;

export interface UploadedInputFile {
  _: "inputFile" | "inputFileBig";
  id: bigint;
  parts: number;
  name: string;
  md5_checksum?: string;
  file_size?: bigint;
}

export type UploadInvoker = (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

/** Upload local file via upload.saveFilePart / saveBigFilePart (MTProto). */
export async function uploadLocalFile(
  invoke: UploadInvoker,
  filePath: string,
): Promise<UploadedInputFile> {
  const buffer = readFileSync(filePath);
  const name = filePath.split("/").pop() ?? "file";
  const fileId = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  const isBig = buffer.length >= BIG_FILE_THRESHOLD;
  const parts = Math.ceil(buffer.length / PART_SIZE) || 1;
  const md5 = createHash("md5").update(buffer).digest("hex");

  for (let part = 0; part < parts; part++) {
    const start = part * PART_SIZE;
    const chunk = buffer.subarray(start, start + PART_SIZE);
    if (isBig) {
      await invoke("upload.saveBigFilePart", {
        file_id: fileId,
        file_part: part,
        file_total_parts: parts,
        file_size: BigInt(buffer.length),
        bytes: chunk,
      });
    } else {
      await invoke("upload.saveFilePart", {
        file_id: fileId,
        file_part: part,
        bytes: chunk,
      });
    }
  }

  if (isBig) {
    return {
      _: "inputFileBig",
      id: fileId,
      parts,
      name,
      file_size: BigInt(buffer.length),
    };
  }
  return {
    _: "inputFile",
    id: fileId,
    parts,
    name,
    md5_checksum: md5,
  };
}

export function fileSizeBytes(filePath: string): number {
  return statSync(filePath).size;
}
