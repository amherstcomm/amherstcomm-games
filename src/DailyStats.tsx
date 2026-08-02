import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { DAILY_ENV } from '@/dailyData';
import { supabase } from '@/supabase';
import { formatElapsed } from '@/useUpTimer';

type Game = 'guess' | 'hive' | 'scramble' | 'grid' | 'box' | 'weave';

// aggregate shape returned by the daily_stats RPC; keys vary per game
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Aggregates = Record<string, any>;

const cache = new Map<string, Aggregates>();

function parts(game: Game, s: Aggregates): string[] {
  const players = `${s.players} player${s.players === 1 ? '' : 's'}`;
  switch (game) {
    case 'guess':
      return [
        players,
        `${s.winRate}% of boards solved`,
        ...(s.avgGuesses != null ? [`avg ${s.avgGuesses} guesses`] : []),
      ];
    case 'hive':
      return [
        players,
        ...(s.avgScore != null ? [`avg score ${s.avgScore}`] : []),
        ...(s.genius > 0 ? [`${s.genius} reached Genius`] : []),
        ...(s.queenBee > 0 ? [`${s.queenBee} Queen Bee${s.queenBee === 1 ? '' : 's'}`] : []),
      ];
    case 'scramble':
    case 'grid':
      return [
        players,
        ...(s.avgScore != null ? [`avg ${s.avgScore} pts`] : []),
        ...(s.topScore != null ? [`top ${s.topScore}`] : []),
      ];
    case 'box':
      return [
        players,
        ...(s.avgWords != null ? [`avg ${s.avgWords} words`] : []),
        ...(s.fewestWords != null ? [`best ${s.fewestWords}`] : []),
      ];
    case 'weave':
      return [
        players,
        `${s.solvedPct}% solved`,
        ...(s.avgTimeMs != null ? [`avg ${formatElapsed(Number(s.avgTimeMs))}`] : []),
        ...(s.avgHints != null ? [`avg ${s.avgHints} hint${Number(s.avgHints) === 1 ? '' : 's'}`] : []),
      ];
  }
}

// one-line "across all players" summary for a day's daily puzzle; renders
// nothing when Supabase is unconfigured or nobody has synced a result yet
export default function DailyStats({ game, date }: { game: Game; date: string }) {
  const [stats, setStats] = useState<Aggregates | null>(() => cache.get(`${game}:${date}`) ?? null);

  useEffect(() => {
    if (!supabase || !date) return;
    const key = `${game}:${date}`;
    const cached = cache.get(key);
    if (cached) {
      setStats(cached);
      return;
    }
    let alive = true;
    supabase.rpc('daily_stats', { p_game: game, p_date: date, p_env: DAILY_ENV }).then(({ data, error }) => {
      if (!alive || error || !data) return;
      cache.set(key, data);
      setStats(data);
    });
    return () => {
      alive = false;
    };
  }, [game, date]);

  if (!stats || !stats.players) return null;

  return (
    <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-500">
      <Users className="w-3.5 h-3.5 text-slate-600" />
      Today across all registered players: {parts(game, stats).join(' · ')}
    </p>
  );
}
