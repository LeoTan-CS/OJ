export const modelUploadMaxBytes = 5 * 1024 * 1024 * 1024;
export const modelUploadMaxSizeLabel = "5GB";

export function assertModelUploadSize(size: number) {
  if (size > modelUploadMaxBytes) throw new Error(`模型压缩包不能大于 ${modelUploadMaxSizeLabel}`);
}

export function formatModelUploadSize(size: number) {
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
