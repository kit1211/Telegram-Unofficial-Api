/** BullMQ custom job ids must not contain `:`. */
export function sanitizeBullJobId(id: string): string {
  return id.replace(/:/g, "_");
}

export function childJobId(parentId: string, part: string): string {
  const safe = part.replace(/:/g, "_").replace(/\//g, "_");
  return sanitizeBullJobId(`${parentId}__${safe}`);
}
