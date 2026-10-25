import { Watchlist } from "@/components/watchlist";
import { loadWatchlist, refreshWatchlistIfStale } from "@/lib/watchlist-server";

export default async function WatchlistPage() {
  // Wie die Übersicht: beim Öffnen nachladen, wenn ein Titel älter als 12 Stunden ist
  const refreshing = await refreshWatchlistIfStale();
  const rows = await loadWatchlist();
  return <Watchlist rows={rows} refreshing={refreshing} />;
}
