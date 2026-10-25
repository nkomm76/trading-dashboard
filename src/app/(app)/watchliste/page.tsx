import { Watchlist } from "@/components/watchlist";
import { loadWatchlist } from "@/lib/watchlist-server";

export default async function WatchlistPage() {
  const rows = await loadWatchlist();
  return <Watchlist rows={rows} />;
}
