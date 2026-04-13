import type { Id, TableNames } from "../../../convex/_generated/dataModel";

export function asConvexId<TableName extends TableNames>(
  value: string,
): Id<TableName> {
  return value as Id<TableName>;
}
