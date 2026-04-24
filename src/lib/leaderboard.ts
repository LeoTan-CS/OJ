type SubmissionLike = {
  id: string;
  userId: string;
  metricValue: number | null;
  leaderboardScore: number | null;
  createdAt: Date;
  user: { id: string; username: string; nickname: string };
};

export function buildLeaderboard(submissions: SubmissionLike[]) {
  const best = new Map<string, SubmissionLike & { submissionCount: number }>();
  const counts = new Map<string, number>();
  for (const submission of submissions) counts.set(submission.userId, (counts.get(submission.userId) ?? 0) + 1);
  for (const submission of submissions) {
    if (submission.leaderboardScore == null) continue;
    const current = best.get(submission.userId);
    if (!current || submission.leaderboardScore > current.leaderboardScore! || (submission.leaderboardScore === current.leaderboardScore && submission.createdAt < current.createdAt)) {
      best.set(submission.userId, { ...submission, submissionCount: counts.get(submission.userId) ?? 0 });
    }
  }
  return [...best.values()].sort((a, b) => (b.leaderboardScore ?? -Infinity) - (a.leaderboardScore ?? -Infinity) || a.createdAt.getTime() - b.createdAt.getTime()).map((entry, index) => ({ rank: index + 1, ...entry }));
}
