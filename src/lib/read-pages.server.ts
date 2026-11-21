/** Sequential bounded-size reads for server-side aggregation, never concurrent fan-out. */
export async function readPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  visit: (rows: T[]) => void,
  size = 200,
): Promise<void> {
  if (!Number.isInteger(size) || size < 1 || size > 1000) throw new Error("Invalid page size");
  for (let from = 0; ; from += size) {
    const result = await load(from, from + size - 1);
    if (result.error) throw new Error(result.error.message);
    const rows = result.data ?? [];
    visit(rows);
    if (rows.length < size) return;
  }
}