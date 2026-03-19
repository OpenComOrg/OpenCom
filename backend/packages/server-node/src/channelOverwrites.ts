import { q } from "./db.js";

export type ChannelOverwriteRow = {
  target_type: "role" | "member";
  target_id: string;
  allow: string | number;
  deny: string | number;
};

export async function listChannelOverwrites(channelId: string): Promise<ChannelOverwriteRow[]> {
  return q<ChannelOverwriteRow>(
    `SELECT target_type,target_id,allow,deny
     FROM channel_overwrites
     WHERE channel_id=:channelId`,
    { channelId }
  );
}

export async function replaceChannelOverwrites(
  channelId: string,
  overwrites: ChannelOverwriteRow[]
): Promise<number> {
  await q(`DELETE FROM channel_overwrites WHERE channel_id=:channelId`, { channelId });

  for (const overwrite of overwrites) {
    await q(
      `INSERT INTO channel_overwrites (channel_id,target_type,target_id,allow,deny)
       VALUES (:channelId,:targetType,:targetId,:allow,:deny)`,
      {
        channelId,
        targetType: overwrite.target_type,
        targetId: overwrite.target_id,
        allow: String(overwrite.allow ?? 0),
        deny: String(overwrite.deny ?? 0)
      }
    );
  }

  return overwrites.length;
}

export async function copyChannelOverwrites(
  sourceChannelId: string,
  targetChannelId: string
): Promise<number> {
  const overwrites = await listChannelOverwrites(sourceChannelId);
  return replaceChannelOverwrites(targetChannelId, overwrites);
}

export async function syncCategoryOverwritesToChildren(categoryId: string): Promise<{
  copied: number;
  childCount: number;
}> {
  const overwrites = await listChannelOverwrites(categoryId);
  const children = await q<{ id: string }>(
    `SELECT id
     FROM channels
     WHERE parent_id=:categoryId
     ORDER BY position ASC, created_at ASC`,
    { categoryId }
  );

  for (const child of children) {
    await replaceChannelOverwrites(child.id, overwrites);
  }

  return {
    copied: overwrites.length,
    childCount: children.length
  };
}
