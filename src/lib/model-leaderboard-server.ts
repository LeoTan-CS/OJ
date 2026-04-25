import { buildModelLeaderboardData } from "@/lib/model-leaderboard";
import { prisma } from "@/lib/prisma";

export async function loadModelLeaderboardData() {
  const rankingBatches = await prisma.modelTestBatch.findMany({
    where: { kind: "RANKING", status: "COMPLETED", judgeStatus: "COMPLETED" },
    include: {
      results: {
        include: {
          model: {
            include: { user: true, group: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return buildModelLeaderboardData(rankingBatches);
}
