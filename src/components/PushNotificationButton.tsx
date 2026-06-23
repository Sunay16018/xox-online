// ─── PushNotificationButton ──────────────────────────────────────────────────
// YouTube tarzı "Bildirim Al" butonu. App.tsx'e veya UserProfile'a eklenebilir.
// Kullanım: <PushNotificationButton token={authToken} />

import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface Props {
  token: string | null;
  compact?: boolean; // true ise sadece ikon göster (header için)
}

export function PushNotificationButton({ token, compact = false }: Props) {
  const { isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe } =
    usePushNotifications(token);

  if (!isSupported) return null;

  const handleClick = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        title={isSubscribed ? 'Bildirimleri Kapat' : 'Bildirim Al'}
        className={`
          relative p-2 rounded-full transition-all duration-200
          ${isSubscribed
            ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10'
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'}
          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isSubscribed ? (
          <BellRing className="w-5 h-5" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
        {isSubscribed && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full" />
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm
          transition-all duration-200 border
          ${isSubscribed
            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
            : 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500'}
          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isSubscribed ? (
          <BellOff className="w-4 h-4" />
        ) : (
          <Bell className="w-4 h-4" />
        )}
        <span>
          {isLoading
            ? 'Yükleniyor...'
            : isSubscribed
            ? 'Bildirimleri Kapat'
            : 'Bildirim Al'}
        </span>
      </button>

      {isSubscribed && (
        <p className="text-xs text-indigo-300/70 flex items-center gap-1">
          <BellRing className="w-3 h-3" />
          Eşleşme ve maç sonuçlarında bildirim alacaksın
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
