export function parseRankingsResponse(data) {
  const rankings = Array.isArray(data?.rankings) ? data.rankings : []
  const totalRaw = data?.pagination?.total
  const total = Number.isFinite(Number(totalRaw)) && Number(totalRaw) >= 0
    ? Number(totalRaw)
    : 0

  return { rankings, total }
}
