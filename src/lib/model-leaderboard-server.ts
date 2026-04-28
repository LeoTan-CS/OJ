import { buildModelLeaderboardData } from "@/lib/model-leaderboard";
import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user-select";

export async function loadModelLeaderboardData() {
  const rankingBatches = await prisma.modelTestBatch.findMany({
    where: { kind: "RANKING", status: "COMPLETED", judgeStatus: "COMPLETED" },
    include: {
      results: {
        include: {
          model: {
            include: { user: { select: publicUserSelect } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return buildModelLeaderboardData(rankingBatches);
}
