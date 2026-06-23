import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Trophy, MessageSquare, LogOut, Zap, Sword, PlusCircle,
  LogIn, Dribbble, CheckCircle2, Hourglass, AlertCircle,
  DoorOpen, Sparkles, X, Users, Bot, WifiOff, Bell, Settings, ShieldAlert
} from 'lucide-react';
import { UserInfo, PlayerState, LobbyStats } from './types';
import Leaderboard from './components/Leaderboard';
import LobbyChat from './components/LobbyChat';
import UserProfile from './components/UserProfile';
import TicTacToeGame from './components/TicTacToeGame';
import ActiveRooms from './components/ActiveRooms';
import OfflineGame, { AIDifficulty } from './components/OfflineGame';
import OfflineTwoPlayer from './components/OfflineTwoPlayer';

// Notification preferences type
type NotificationType = 'welcome' | 'matchFound' | 'matchEnded' | 'chatMessage' | 'eloChange' | 'roomCreated' | 'roomJoined' | 'offlineGameWin' | 'offlineGameLose' | 'connectionRestored' | 'connectionLost';

interface NotificationPrefs {
  welcome: boolean;
  matchFound: boolean;
  matchEnded: boolean;
  chatMessage: boolean;
  eloChange: boolean;
  roomCreated: boolean;
  roomJoined: boolean;
  offlineGameWin: boolean;
  offlineGameLose: boolean;
  connectionRestored: boolean;
  connectionLost: boolean;
}

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  welcome: true,
  matchFound: true,
  matchEnded: true,
  chatMessage: true,
  eloChange: true,
  roomCreated: true,
  roomJoined: true,
  offlineGameWin: true,
  offlineGameLose: true,
  connectionRestored: true,
  connectionLost: true,
};

// ─── Toast System ───────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string; }

let _toastId = 0;

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map((t) => {
        const styles: Record<ToastType, string> = {
          success: 'bg-emerald-600 border-emerald-500',
          error: 'bg-rose-600 border-rose-500',
          info: 'bg-indigo-600 border-indigo-500',
          warning: 'bg-amber-500 border-amber-400',
        };
        const icons: Record<ToastType, React.ReactNode> = {
          success: <CheckCircle2 className="w-4 h-4" />,
          error: <AlertCircle className="w-4 h-4" />,
          info: <Sparkles className="w-4 h-4" />,
          warning: <AlertCircle className="w-4 h-4" />,
        };
        return (
          <div key={t.id} className={`toast-in pointer-events-auto flex items-start gap-3 text-white rounded-2xl border px-4 py-3 shadow-xl ${styles[t.type]}`}>
            <div className="mt-0.5 shrink-0">{icons[t.type]}</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{t.title}</p>
              {t.message && <p className="text-xs opacity-80 mt-0.5">{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Avatar presets ──────────────────────────────────────────────────────────
const PRESET_AVATARS = [
  { name: 'XOX Premium', url: '/assets/images/xox-icon.png' },
  { name: 'Oscar', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Oscar' },
  { name: 'Charlie', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Charlie' },
  { name: 'Buster', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Buster' },
  { name: 'Coco', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Coco' },
  { name: 'Sasha', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Sasha' },
  { name: 'Gizmo', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Gizmo' },
  { name: 'Milo', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Milo' },
  { name: 'Bella', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Bella' },
];

type PageView = 'lobby' | 'rooms' | 'leaderboard';

// ─── Offline Difficulty Modal ─────────────────────────────────────────────────
function OfflineDifficultyModal({ onSelect, onClose }: {
  onSelect: (difficulty: AIDifficulty, rounds: number) => void;
  onClose: () => void;
}) {
  const [selectedDiff, setSelectedDiff] = useState<AIDifficulty>('normal');
  const [selectedRounds, setSelectedRounds] = useState(3);

  const diffOptions: { key: AIDifficulty; label: string; desc: string; emoji: string; color: string }[] = [
    { key: 'easy',   label: 'Kolay',  desc: 'AI bazen hata yapar',      emoji: '😊', color: 'border-emerald-400 bg-emerald-50 text-emerald-700' },
    { key: 'normal', label: 'Normal', desc: 'Dengeli bir rakip',         emoji: '🤔', color: 'border-amber-400 bg-amber-50 text-amber-700' },
    { key: 'hard',   label: 'Zor',    desc: 'Mükemmel AI — yenilmez!',  emoji: '😈', color: 'border-rose-400 bg-rose-50 text-rose-700' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl space-y-6 animate-scaleUp">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto">
            <Bot className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="font-black text-xl text-slate-900">AI ile Oyna</h2>
          <p className="text-slate-400 text-xs">İnternet olmadan yapay zekaya karşı oyna!</p>
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Zorluk Seç</span>
          <div className="space-y-2">
            {diffOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSelectedDiff(opt.key)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                  selectedDiff === opt.key ? opt.color + ' border-current shadow-sm' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <div className="font-bold text-sm">{opt.label}</div>
                  <div className="text-xs opacity-70">{opt.desc}</div>
                </div>
                {selectedDiff === opt.key && (
                  <CheckCircle2 className="w-5 h-5 ml-auto shrink-0 opacity-70" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Rounds */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Kaç Tur?</span>
          <div className="flex gap-2">
            {[1, 3, 5].map(n => (
              <button
                key={n}
                onClick={() => setSelectedRounds(n)}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-extrabold transition-all cursor-pointer ${
                  selectedRounds === n
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {n} Tur
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl transition-all text-sm cursor-pointer">
            İptal
          </button>
          <button
            onClick={() => onSelect(selectedDiff, selectedRounds)}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-indigo-200 transition-all text-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <Bot className="w-4 h-4" /> Başla!
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Offline Two-Player Rounds Modal ───────────────────────────────────────
function OfflineTwoPlayerRoundsModal({ onSelect, onClose }: {
  onSelect: (rounds: number) => void;
  onClose: () => void;
}) {
  const [selectedRounds, setSelectedRounds] = useState(3);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl space-y-6 animate-scaleUp">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
            <Users className="w-6 h-6 text-emerald-600" />
          </div>
          <h2 className="font-black text-xl text-slate-900">Aynı Cihazdan 2 Kişi</h2>
          <p className="text-slate-400 text-xs">İnternet olmadan arkadaşınla sırayla oyna!</p>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Kaç Tur?</span>
          <div className="flex gap-2">
            {[1, 3, 5].map(n => (
              <button
                key={n}
                onClick={() => setSelectedRounds(n)}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-extrabold transition-all cursor-pointer ${
                  selectedRounds === n
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {n} Tur
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl transition-all text-sm cursor-pointer">
            İptal
          </button>
          <button
            onClick={() => onSelect(selectedRounds)}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-emerald-200 transition-all text-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4" /> Başla!
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Modal ────────────────────────────────────────────────────────
function SettingsModal({ 
  isOpen, 
  onClose, 
  notifPrefs, 
  onPrefsChange,
  addToast,
  showSystemNotification
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  notifPrefs: NotificationPrefs;
  onPrefsChange: (prefs: NotificationPrefs) => void;
  addToast: (type: ToastType, title: string, message?: string) => void;
  showSystemNotification: (title: string, options?: NotificationOptions) => void;
}) {
  const notifTypes: Array<{ key: NotificationType; label: string; desc: string; icon: string }> = [
    { key: 'welcome', label: 'Hoş Geldin Bildirimi', desc: 'Uygulamaya giriş yaptığında karşılama bildirimi gönder', icon: '👋' },
    { key: 'matchFound', label: 'Maç Bulundu', desc: 'Rakip bulunduğunda bildir', icon: '⚡' },
    { key: 'matchEnded', label: 'Maç Sonu', desc: 'Maç bittiğinde bildir', icon: '🏁' },
    { key: 'chatMessage', label: 'Chat Mesajı', desc: 'Lobi sohbetinde yeni mesaj varsa bildir', icon: '💬' },
    { key: 'eloChange', label: 'ELO Değişimi', desc: 'ELO puanın değiştiğinde bildir', icon: '📊' },
    { key: 'roomCreated', label: 'Oda Oluşturuldu', desc: 'Yeni oda oluşturduğunda bildir', icon: '🚪' },
    { key: 'roomJoined', label: 'Odaya Girildi', desc: 'Birisi odana girdiğinde bildir', icon: '👥' },
    { key: 'offlineGameWin', label: 'Offline Zafer', desc: 'AI\'yi yendiğinde bildir', icon: '🏆' },
    { key: 'offlineGameLose', label: 'Offline Yenilgi', desc: 'AI seni yendiğinde bildir', icon: '🤖' },
    { key: 'connectionRestored', label: 'Bağlantı Geri Geldi', desc: 'İnternet bağlantısı geri geldiğinde bildir', icon: '🌐' },
    { key: 'connectionLost', label: 'Bağlantı Kesildi', desc: 'İnternet bağlantısı koptuğunda bildir', icon: '📡' },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 max-w-2xl w-full shadow-2xl space-y-6 animate-scaleUp max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between sticky top-0 bg-white pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <Bell className="w-6 h-6 text-indigo-600" />
                </div>
                <h2 className="font-black text-xl text-slate-900">Bildirim Ayarları</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Notification Permission Status */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 space-y-2">
              {Notification.permission === 'granted' ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-700">Tarayıcı Bildirimleri Etkin</p>
                    <p className="text-xs text-emerald-600">Sistem bildirimleri gönderilecek</p>
                  </div>
                </div>
              ) : Notification.permission === 'denied' ? (
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-rose-700">Bildirimler Engellendi</p>
                    <p className="text-xs text-rose-600">Tarayıcı ayarlarından izin ver</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => Notification.requestPermission().then((perm) => {
                    if (perm === 'granted') {
                      // Sistem bildirimi göster (toast değil)
                      showSystemNotification('✅ Bildirimler Etkin!', { body: 'Tarayıcı sistem bildirimleri açıldı. Artık YouTube gibi bildirim alacaksın.' });
                    }
                  })}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-all cursor-pointer"
                >
                  <Bell className="w-4 h-4" /> Tarayıcı Bildirimlerini Etkinleştir
                </button>
              )}
            </div>

            <div className="space-y-3">
              {notifTypes.map((nt) => (
                <label key={nt.key} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={notifPrefs[nt.key]}
                    onChange={(e) => onPrefsChange({ ...notifPrefs, [nt.key]: e.target.checked })}
                    className="w-5 h-5 rounded-lg accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{nt.icon}</span>
                      <p className="font-bold text-slate-800 text-sm group-hover:text-indigo-700">{nt.label}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{nt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-xl mt-0.5">ℹ️</span>
              <div className="text-sm text-blue-800">
                <p className="font-bold">Bildirimler Web Notifications kullanarak çalışır.</p>
                <p className="text-xs mt-1 text-blue-700">Tarayıcı bildirim izni vermişse sistem bildirimleri alacaksın.</p>
              </div>
            </div>

            <button onClick={onClose} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold py-3 rounded-2xl transition-all">
              Kapat
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  // ─── Auth ────────────────────────────────────────────────────────────────
  const [token, setToken] = useState<string | null>(localStorage.getItem('xox_jwt_token'));
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [avatarSeedIndex, setAvatarSeedIndex] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // ─── Navigation ──────────────────────────────────────────────────────────
  const [activePageView, setActivePageView] = useState<PageView>('lobby');

  // ─── Socket & Stats ──────────────────────────────────────────────────────
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lobbyStats, setLobbyStats] = useState<LobbyStats>({ onlineCount: 1, activeGames: 0, searchingCount: 0, usersPlaying: 0 });
  const [dbStatus, setDbStatus] = useState({ connected: false, mode: 'In-Memory Fallback', error: null, uriSet: false });

  // ─── Matchmaking ─────────────────────────────────────────────────────────
  const [searchRounds, setSearchRounds] = useState<number>(3);
  const [matchmakingActive, setMatchmakingActive] = useState(false);
  const [queueTimer, setQueueTimer] = useState(0);
  const queueIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Private Room ─────────────────────────────────────────────────────────
  const [customRounds, setCustomRounds] = useState<number>(3);
  const [privateRoomCode, setPrivateRoomCode] = useState('');
  const privateRoomCodeRef = useRef('');
  useEffect(() => { privateRoomCodeRef.current = privateRoomCode; }, [privateRoomCode]);
  const [codeToJoin, setCodeToJoin] = useState('');
  const [customRoomError, setCustomRoomError] = useState<string | null>(null);

  // ─── Active Game ──────────────────────────────────────────────────────────
  const [activeGame, setActiveGame] = useState<{
    roomCode: string; me: PlayerState; opponent: PlayerState;
    roundsLimit: number; gameBoard: string[]; turnUserId: string;
    status: 'playing' | 'round_ended' | 'finished';
  } | null>(null);

  const [leadRefresh, setLeadRefresh] = useState(0);

  // ─── Toasts ───────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ─── Offline Mode ─────────────────────────────────────────────────────────
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineGame, setOfflineGame] = useState<{ difficulty: AIDifficulty; rounds: number } | null>(null);

  // ─── Offline Two-Player (Same Device) Mode ──────────────────────────────────
  const [offlineTwoPlayerModalOpen, setOfflineTwoPlayerModalOpen] = useState(false);
  const [offlineTwoPlayerGame, setOfflineTwoPlayerGame] = useState<{ rounds: number } | null>(null);

  // ─── Notification Settings ────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => {
    const saved = localStorage.getItem('xox_notif_prefs');
    return saved ? { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(saved) } : DEFAULT_NOTIF_PREFS;
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Save notif prefs whenever they change
  useEffect(() => {
    localStorage.setItem('xox_notif_prefs', JSON.stringify(notifPrefs));
    // Sunucudaki push gönderimini de senkronize et — kapatılan bir tür için
    // arka planda/cihaz kapalıyken artık push bildirimi gönderilmesin.
    if (token && !token.startsWith('offline_')) {
      fetch('/api/push/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prefs: notifPrefs }),
      }).catch(() => {});
    }
  }, [notifPrefs, token]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const addToast = useCallback((type: ToastType, title: string, message?: string, duration = 4000) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const removeToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ─── Notification Helper ──────────────────────────────────────────────────
  const showSystemNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const notifOptions: NotificationOptions = {
      icon: '/assets/images/xox-icon.png',
      tag: 'xox-arena-notification',
      requireInteraction: false,
      ...options,
    };

    // Mobil (Android) için Service Worker üzerinden showNotification zorunludur.
    // new Notification() mobil tarayıcılarda sessizce bloklanır veya hata fırlatır.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.showNotification(title, notifOptions);
        })
        .catch(() => {
          try { new Notification(title, notifOptions); } catch (e) { console.warn('Notification gösterilemedi:', e); }
        });
    } else {
      // SW henüz aktif değilse (masaüstü eski tarayıcı) direkt Notification
      try {
        new Notification(title, notifOptions);
      } catch (e) {
        console.warn('Notification gösterilemedi:', e);
      }
    }
  }, []);

  const sendNotification = useCallback((type: NotificationType, title: string, message?: string) => {
    if (notifPrefs[type]) {
      showSystemNotification(title, { body: message });
      // In-app toast kaldırıldı, sadece gerçek sistem bildirimi gönderiliyor
    }
  }, [notifPrefs, showSystemNotification]);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      sendNotification('connectionRestored', '🌐 İnternet Bağlantısı Geri Geldi', 'Sunucuya bağlanılıyor...');
      // Socket yeniden bağlan
      if (token && token.startsWith('offline_') === false) {
        // Online user, reconnect
        window.location.reload();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      sendNotification('connectionLost', '📡 İnternet Bağlantısı Kesildi', 'Çevrimdışı moda geçiyorsunuz...');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token, sendNotification]);

  // ─── Welcome Notification (uygulamaya her girişte bir kez) ────────────────
  const welcomeShownRef = useRef(false);
  useEffect(() => {
    if (user && !welcomeShownRef.current) {
      welcomeShownRef.current = true;
      sendNotification('welcome', `👋 Hoş Geldin, ${user.username}!`, 'XOX Arena\'ya tekrar hoş geldin, iyi oyunlar!');
    }
  }, [user, sendNotification]);


  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (token) {
      // Offline user varsa, localStorage'dan yükle
      if (token.startsWith('offline_')) {
        const offlineUser = localStorage.getItem('xox_offline_user');
        if (offlineUser) {
          try {
            setUser(JSON.parse(offlineUser));
            return;
          } catch (e) {
            console.error('Offline user parse hatası:', e);
            handleLogout();
            return;
          }
        }
      }
      // Online user: normal fetch
      fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then(setUser)
        .catch(handleLogout);
    }
    fetch('/api/status').then((r) => r.json()).then((d) => { if (d.database) setDbStatus(d.database); }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !user) { socket?.disconnect(); setSocket(null); return; }

    // Offline modda socket bağlantısını engelle
    if (!navigator.onLine) {
      setSocket(null);
      return;
    }

    const s = io({ auth: { token }, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });

    s.on('connect', () => {
      s.emit('get-lobby-status', (stats: LobbyStats) => { if (stats) setLobbyStats(stats); });
    });

    s.on('lobby-count-update', (data: Partial<LobbyStats>) => setLobbyStats((p) => ({ ...p, ...data })));

    s.on('receive-message', (msg: { username: string; message: string }) => {
      if (msg.username && msg.username !== user.username && msg.message) {
        sendNotification('chatMessage', `💬 ${msg.username}`, msg.message);
      }
    });

    s.on('match-joined', (data: { roomCode: string; players: PlayerState[]; roundsTotal: number; currentRound: number; gameBoard: string[]; turnUserId: string; status: 'playing' | 'round_ended' | 'finished' }) => {
      cancelMatchmakingInterval();
      setMatchmakingActive(false);
      const myPlayer = data.players.find((p) => p.userId === user.userId);
      const enemyPlayer = data.players.find((p) => p.userId !== user.userId);
      if (myPlayer && enemyPlayer) {
        setActiveGame({ roomCode: data.roomCode, me: myPlayer, opponent: enemyPlayer, roundsLimit: data.roundsTotal, gameBoard: data.gameBoard, turnUserId: data.turnUserId, status: data.status });
        if (data.roomCode === privateRoomCodeRef.current) {
          sendNotification('roomJoined', '👥 Birisi Odana Katıldı!', `${enemyPlayer.username} (${enemyPlayer.elo} ELO) odana girdi, maç başlıyor!`);
        } else {
          sendNotification('matchFound', '⚡ Maç Bulundu!', `Rakibiniz: ${enemyPlayer.username} (${enemyPlayer.elo} ELO)`);
        }
        setPrivateRoomCode('');
      }
    });

    s.on('match-timeout', (data: { message: string }) => {
      cancelMatchmakingInterval();
      setMatchmakingActive(false);
      addToast('warning', 'Rakip Bulunamadı', data.message);
    });

    s.on('match-finished', (data: { winnerUserId: string | null; winnerName: string; scores: Record<string, number>; eloChanges: Array<{ userId: string; username: string; change: number; oldElo: number; newElo: number }> }) => {
      const isWinner = data.winnerUserId === user.userId;
      const isDraw = !data.winnerUserId;
      sendNotification(
        'matchEnded',
        isDraw ? '🤝 Maç Berabere Bitti' : isWinner ? '🏆 Maçı Kazandın!' : '🏁 Maç Sona Erdi',
        isDraw ? 'Maç berabere sonuçlandı.' : `Kazanan: ${data.winnerName}`
      );

      const myEloChange = data.eloChanges?.find((c) => c.userId === user.userId);
      if (myEloChange) {
        setUser((prev) => (prev ? { ...prev, elo: myEloChange.newElo } : prev));
        sendNotification(
          'eloChange',
          myEloChange.change >= 0 ? `📊 ELO +${myEloChange.change}` : `📊 ELO ${myEloChange.change}`,
          `Yeni ELO puanın: ${myEloChange.newElo}`
        );
      }
      setLeadRefresh((p) => p + 1);
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, [token, user?.userId]);

  useEffect(() => {
    if (matchmakingActive) {
      setQueueTimer(0);
      queueIntervalRef.current = setInterval(() => setQueueTimer((t) => t + 1), 1000);
    } else {
      cancelMatchmakingInterval();
    }
    return cancelMatchmakingInterval;
  }, [matchmakingActive]);

  const cancelMatchmakingInterval = () => {
    if (queueIntervalRef.current) { clearInterval(queueIntervalRef.current); queueIntervalRef.current = null; }
  };

  const handleLogout = () => {
    localStorage.removeItem('xox_jwt_token');
    localStorage.removeItem('xox_offline_user');
    setToken(null); setUser(null); setActiveGame(null);
    setMatchmakingActive(false); cancelMatchmakingInterval();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError(null); setAuthSuccessMsg(null); setAuthLoading(true);
    const avatarToSave = avatarInput.trim() || PRESET_AVATARS[avatarSeedIndex]?.url || '/assets/images/xox-icon.png';
    
    try {
      // Offline check
      if (!navigator.onLine) {
        // Offline mode: local storage'a kaydet
        const offlineUsers = JSON.parse(localStorage.getItem('xox_offline_users') || '{}');
        if (offlineUsers[usernameInput]) {
          throw new Error('Bu kullanıcı adı zaten alınmış.');
        }
        if (usernameInput.length < 3 || usernameInput.length > 15) {
          throw new Error('Kullanıcı adı 3 ile 15 karakter arasında olmalıdır.');
        }
        
        const userId = 'offline_' + Date.now();
        const offlineUser: UserInfo = {
          userId,
          username: usernameInput,
          avatarUrl: avatarToSave,
          elo: 1200,
          totalGames: 0,
          wins: 0,
          currentWinStreak: 0,
          maxWinStreak: 0,
        };
        
        // Şifreyi ayrı bir yerde sakla
        offlineUsers[usernameInput] = { ...offlineUser, _password: passwordInput };
        localStorage.setItem('xox_offline_users', JSON.stringify(offlineUsers));
        
        setAuthSuccessMsg('Hesap oluşturuldu (Çevrimdışı)! Giriş yapılıyor...');
        setTimeout(() => {
          localStorage.setItem('xox_jwt_token', userId);
          localStorage.setItem('xox_offline_user', JSON.stringify(offlineUser));
          setToken(userId);
          setUser(offlineUser);
          resetAuthForm();
        }, 1200);
        setAuthLoading(false);
        return;
      }
      
      // Online mode: normal server auth
      const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usernameInput, password: passwordInput, avatarUrl: avatarToSave }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Kayıt başarısız.');
      setAuthSuccessMsg('Hesap oluşturuldu! Giriş yapılıyor...');
      setTimeout(() => { localStorage.setItem('xox_jwt_token', body.token); setToken(body.token); setUser(body.user); resetAuthForm(); }, 1200);
    } catch (err: any) { setAuthError(err.message || 'Bir hata oluştu.'); }
    finally { setAuthLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError(null); setAuthSuccessMsg(null); setAuthLoading(true);
    try {
      // Offline check
      if (!navigator.onLine) {
        // Offline mode: local storage'dan kontrol et
        const offlineUsers = JSON.parse(localStorage.getItem('xox_offline_users') || '{}');
        const storedUser = offlineUsers[usernameInput];
        
        if (!storedUser || storedUser._password !== passwordInput) {
          throw new Error('Hatalı kullanıcı adı veya şifre (Çevrimdışı).');
        }
        
        // UserInfo olarak extract et (password hariç)
        const { _password, ...userInfo } = storedUser;
        
        setAuthSuccessMsg('Giriş başarılı (Çevrimdışı)! Yönlendiriliyorsunuz...');
        setTimeout(() => {
          const token = userInfo.userId;
          localStorage.setItem('xox_jwt_token', token);
          localStorage.setItem('xox_offline_user', JSON.stringify(userInfo));
          setToken(token);
          setUser(userInfo);
          resetAuthForm();
        }, 800);
        setAuthLoading(false);
        return;
      }
      
      // Online mode: normal server auth
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usernameInput, password: passwordInput }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Hatalı kullanıcı adı veya şifre.');
      setAuthSuccessMsg('Giriş başarılı! Yönlendiriliyorsunuz...');
      setTimeout(() => { localStorage.setItem('xox_jwt_token', body.token); setToken(body.token); setUser(body.user); resetAuthForm(); }, 800);
    } catch (err: any) { setAuthError(err.message || 'Giriş yapılamadı.'); }
    finally { setAuthLoading(false); }
  };

  const resetAuthForm = () => { setUsernameInput(''); setPasswordInput(''); setAvatarInput(''); setAuthError(null); setAuthSuccessMsg(null); };

  const handleUpdateAvatar = async (newUrl: string) => {
    try {
      const r = await fetch('/api/user/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ avatarUrl: newUrl }) });
      const body = await r.json();
      if (!r.ok) return { success: false, error: body.error };
      localStorage.setItem('xox_jwt_token', body.token);
      setToken(body.token); setUser(body.user);
      setLeadRefresh((p) => p + 1);
      addToast('success', 'Avatar güncellendi!');
      return { success: true };
    } catch { return { success: false, error: 'Sunucuya bağlanılamadı.' }; }
  };

  const handleStartMatchmaking = () => {
    if (!socket) return;
    setCustomRoomError(null);
    socket.emit('search-match', { rounds: searchRounds }, (res: { error?: string }) => {
      if (res?.error) { addToast('error', 'Hata', res.error); return; }
      setMatchmakingActive(true);
      addToast('info', 'Rakip Aranıyor...', `${searchRounds} tur için sırada bekliyorsunuz`);
    });
  };

  const handleCancelMatchmaking = () => {
    if (!socket) return;
    socket.emit('cancel-matchmaking', () => { setMatchmakingActive(false); addToast('info', 'Arama İptal Edildi'); });
  };

  const handleCreateCustomRoom = () => {
    if (!socket) return;
    setCustomRoomError(null);
    socket.emit('create-custom-room', { rounds: customRounds }, (res: { success: boolean; roomCode: string; rounds: number; error?: string }) => {
      if (res.error) { setCustomRoomError(res.error); return; }
      setPrivateRoomCode(res.roomCode);
      sendNotification('roomCreated', '🚪 Oda Oluşturuldu!', `Kod: ${res.roomCode} — Arkadaşına gönder!`);
    });
  };

  const handleJoinCustomRoom = (code?: string) => {
    const roomCode = code ?? codeToJoin;
    if (!socket || !roomCode) return;
    setCustomRoomError(null);
    socket.emit('join-custom-room', { roomCode }, (res: { success: boolean; roomCode: string; rounds: number; error?: string }) => {
      if (res.error) {
        if (code) addToast('error', 'Odaya Girilemiyor', res.error);
        else setCustomRoomError(res.error);
      }
    });
  };

  const handleExitActiveGame = () => {
    setActiveGame(null); setPrivateRoomCode(''); setCodeToJoin(''); setCustomRoomError(null);
    setLeadRefresh((p) => p + 1);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ─── RENDER: Offline Game ──────────────────────────────────────────────
  if (offlineGame) {
    return (
      <div className="min-h-screen bg-slate-50 antialiased font-sans">
        <header className="nav-glass sticky top-0 z-50 py-3.5">
          <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <img src="/assets/images/xox-icon.png" alt="XOX Arena" className="w-8 h-8 rounded-xl object-cover shadow border border-white/60" referrerPolicy="no-referrer" />
              <span className="font-black text-base text-slate-800 tracking-tight">XOX ARENA</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-slate-100 text-slate-600 text-[10px] font-black px-2 py-1 rounded-full border border-slate-200 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline Mod
              </span>
            </div>
          </div>
        </header>
        <main className="py-6">
          <OfflineGame
            difficulty={offlineGame.difficulty}
            rounds={offlineGame.rounds}
            onExit={() => setOfflineGame(null)}
            onGameWin={() => sendNotification('offlineGameWin', '🏆 Harika! AI\'yi Yendin!', 'Tebrikler, senin için gurur duyulacak bir zafer!')}
            onGameLose={() => sendNotification('offlineGameLose', '🤖 AI Kazandı', 'Sonraki sefer daha iyi yapabilirsin!')}
          />
        </main>
      </div>
    );
  }

  // ─── RENDER: Offline Two-Player (Same Device) Game ──────────────────────
  if (offlineTwoPlayerGame) {
    return (
      <div className="min-h-screen bg-slate-50 antialiased font-sans">
        <header className="nav-glass sticky top-0 z-50 py-3.5">
          <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <img src="/assets/images/xox-icon.png" alt="XOX Arena" className="w-8 h-8 rounded-xl object-cover shadow border border-white/60" referrerPolicy="no-referrer" />
              <span className="font-black text-base text-slate-800 tracking-tight">XOX ARENA</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-slate-100 text-slate-600 text-[10px] font-black px-2 py-1 rounded-full border border-slate-200 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline Mod
              </span>
            </div>
          </div>
        </header>
        <main className="py-6">
          <OfflineTwoPlayer
            rounds={offlineTwoPlayerGame.rounds}
            onExit={() => setOfflineTwoPlayerGame(null)}
          />
        </main>
      </div>
    );
  }

  // ─── RENDER: Active Game ────────────────────────────────────────────────
  if (user && activeGame) {
    return (
      <div className="min-h-screen bg-slate-50 antialiased font-sans">
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <header className="nav-glass sticky top-0 z-50 py-3.5">
          <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <img src="/assets/images/xox-icon.png" alt="XOX Arena" className="w-8 h-8 rounded-xl object-cover shadow border border-white/60" referrerPolicy="no-referrer" />
              <span className="font-black text-base text-slate-800 tracking-tight">XOX ARENA</span>
            </div>
            <div className="flex items-center gap-2">
              <img src={user.avatarUrl} alt={user.username} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover border border-slate-200" />
              <span className="font-bold text-xs text-slate-700">{user.username}</span>
              <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black font-mono px-2 py-1 rounded-full border border-indigo-100">⭐ {user.elo} ELO</span>
            </div>
          </div>
        </header>
        <main className="py-6">
          <TicTacToeGame socket={socket} roomCode={activeGame.roomCode} myUserId={user.userId} opponent={activeGame.opponent} me={activeGame.me} roundsLimit={activeGame.roundsLimit} initialGameBoard={activeGame.gameBoard} initialTurnUserId={activeGame.turnUserId} initialStatus={activeGame.status} onExitGame={handleExitActiveGame} />
        </main>
      </div>
    );
  }

  // ─── RENDER: Dashboard ─────────────────────────────────────────────────
  if (user) {
    return (
      <div className="min-h-screen bg-slate-50 antialiased font-sans flex flex-col">
        <ToastContainer toasts={toasts} onRemove={removeToast} />

        {/* Offline Difficulty Modal */}
        {offlineModalOpen && (
          <OfflineDifficultyModal
            onSelect={(diff, rounds) => {
              setOfflineModalOpen(false);
              setOfflineGame({ difficulty: diff, rounds });
            }}
            onClose={() => setOfflineModalOpen(false)}
          />
        )}

        {/* Offline Two-Player Rounds Modal */}
        {offlineTwoPlayerModalOpen && (
          <OfflineTwoPlayerRoundsModal
            onSelect={(rounds) => {
              setOfflineTwoPlayerModalOpen(false);
              setOfflineTwoPlayerGame({ rounds });
            }}
            onClose={() => setOfflineTwoPlayerModalOpen(false)}
          />
        )}

        {/* Settings Modal */}
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          notifPrefs={notifPrefs}
          onPrefsChange={setNotifPrefs}
          addToast={addToast}
          showSystemNotification={showSystemNotification}
        />

        {/* Navbar */}
        <header className="nav-glass sticky top-0 z-50 py-2.5 sm:py-3">
          <div className="max-w-6xl mx-auto px-2.5 sm:px-4 flex items-center justify-between gap-1 sm:gap-2">
            {/* Logo */}
            <div className="hidden md:flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => setActivePageView('lobby')}>
              <div className="relative">
                <img src="/assets/images/xox-icon.png" alt="XOX Arena" className="w-9 h-9 rounded-xl object-cover shadow-md border border-white/60" referrerPolicy="no-referrer" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white nav-dot" />
              </div>
              <div>
                <span className="font-black text-sm text-slate-800 leading-none block tracking-tight">XOX ARENA</span>
                <span className="text-[9px] text-slate-400 font-bold block tracking-wider uppercase">Online Multiplayer</span>
              </div>
            </div>

            {/* Mobile logo (icon only) */}
            <img src="/assets/images/xox-icon.png" alt="XOX Arena" className="md:hidden w-7 h-7 rounded-lg object-cover shadow-sm border border-white/60 shrink-0 cursor-pointer" referrerPolicy="no-referrer" onClick={() => setActivePageView('lobby')} />

            {/* Nav Pills */}
            <nav className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/50 gap-0.5 min-w-0 overflow-x-auto">
              {([
                { key: 'lobby', label: 'Lobi', icon: <Zap className="w-3 h-3 shrink-0" /> },
                { key: 'rooms', label: 'Odalar', icon: <DoorOpen className="w-3 h-3 shrink-0" /> },
                { key: 'leaderboard', label: 'Sıralama', icon: <Trophy className="w-3 h-3 shrink-0" /> },
              ] as const).map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setActivePageView(key)}
                  className={`px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 ${
                    activePageView === key ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {icon}<span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </nav>

            {/* User */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {!navigator.onLine && (
                <div className="hidden sm:flex bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-2.5 py-1.5 rounded-xl items-center gap-1 shrink-0">
                  <WifiOff className="w-3 h-3" /> Çevrimdışı
                </div>
              )}
              <div className="flex items-center gap-1.5 bg-white border border-slate-100 rounded-xl px-1.5 sm:px-2.5 py-1.5 shadow-sm shrink-0">
                <img src={user.avatarUrl} alt={user.username} referrerPolicy="no-referrer"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`; }}
                  className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0" />
                <div className="hidden sm:block text-left leading-none">
                  <span className="font-bold text-xs text-slate-700 block max-w-[100px] truncate">{user.username}</span>
                  <span className="font-mono text-[9px] font-black text-indigo-500">⭐ {user.elo}</span>
                </div>
              </div>
              <button onClick={() => setShowSettingsModal(true)} className="p-1.5 sm:p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer shrink-0" title="Bildirim Ayarları">
                <Bell className="w-4 h-4" />
              </button>
              <button onClick={handleLogout} className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer shrink-0" title="Çıkış Yap">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* ── LEADERBOARD PAGE ── */}
        {activePageView === 'leaderboard' && (
          <main className="max-w-4xl w-full mx-auto px-4 py-8 flex-1 animate-scaleUp">
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 rounded-3xl p-6 md:p-8 text-white mb-8 border border-slate-800 shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2 relative z-10">
                <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-indigo-500/30">Liderlik Kürsüsü</span>
                <h2 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2">
                  <Trophy className="w-7 h-7 text-amber-400" /> Şampiyonlar Ligi
                </h2>
                <p className="text-slate-300 text-xs font-medium">En yüksek ELO'ya sahip oyuncuların canlı sıralaması</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 shrink-0 text-center relative z-10 min-w-40">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Sıralamandasın</span>
                <div className="font-mono text-xl font-black text-amber-400 mt-1">⭐ {user.elo} ELO</div>
                <span className="text-[10px] text-slate-300 font-bold">Seri: {user.currentWinStreak} Galibiyet</span>
              </div>
              <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
            </div>
            <Leaderboard currentUserId={user.userId} refreshTrigger={leadRefresh} />
          </main>
        )}

        {/* ── ROOMS PAGE ── */}
        {activePageView === 'rooms' && (
          <main className="max-w-4xl w-full mx-auto px-4 py-8 flex-1 animate-scaleUp space-y-8">
            {!navigator.onLine && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-900 text-sm">İnternet Bağlantısı Yok</h3>
                  <p className="text-amber-700 text-xs mt-1">Online oyun oynamak için internet bağlantısı gereklidir. Offline modda AI ile oynayabilirsiniz.</p>
                </div>
              </div>
            )}
            {/* Hero */}
            <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden border border-indigo-500/30 shadow-xl">
              <div className="relative z-10 space-y-2">
                <span className="bg-white/15 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/20">Canlı Odalar</span>
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                  <DoorOpen className="w-6 h-6" /> Açık Odalar
                </h2>
                <p className="text-indigo-100 text-xs font-medium">Şu an aktif tüm özel odalar — katıl, hemen oyna!</p>
              </div>
              {/* Live stat */}
              <div className="relative z-10 mt-4 flex items-center gap-4">
                <div className="bg-white/10 rounded-2xl px-4 py-2 flex items-center gap-2 border border-white/15">
                  <Users className="w-4 h-4 text-white/80" />
                  <span className="font-mono text-sm font-black">{lobbyStats.activeGames} aktif oda</span>
                </div>
                <div className="bg-white/10 rounded-2xl px-4 py-2 flex items-center gap-2 border border-white/15">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-sm font-black">{lobbyStats.onlineCount} çevrimiçi</span>
                </div>
              </div>
              {/* Decorative */}
              <div className="absolute right-6 top-4 text-8xl opacity-10 select-none font-black">✕</div>
              <div className="absolute right-20 bottom-2 text-5xl opacity-10 select-none font-black">○</div>
            </div>

            <ActiveRooms socket={socket} currentUserId={user.userId} onJoinRoom={(code) => handleJoinCustomRoom(code)} />

            {/* Create own room CTA */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm glow-card">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-slate-100 text-slate-700 rounded-2xl"><PlusCircle className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-800">Kendi Odanı Aç</h3>
                  <p className="text-xs text-slate-400">Arkadaşını davet et ve özel maç oyna</p>
                </div>
              </div>
              {customRoomError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs p-3 rounded-xl flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />{customRoomError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Create */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                  <div><h4 className="font-bold text-xs text-slate-700 uppercase tracking-tight">Oda Oluştur</h4></div>
                  <div className="flex gap-1.5">
                    {[1, 3, 5].map((n) => (
                      <button key={n} onClick={() => setCustomRounds(n)} className={`flex-1 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${customRounds === n ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>{n} Tur</button>
                    ))}
                  </div>
                  {privateRoomCode ? (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-indigo-400 block">Oda Kodun</span>
                      <span className="font-mono text-lg font-black text-indigo-700 tracking-widest block select-all mt-1">{privateRoomCode}</span>
                      <p className="text-[10px] text-indigo-400 mt-1">Kopyalayıp arkadaşına gönder!</p>
                    </div>
                  ) : (
                    <button onClick={handleCreateCustomRoom} disabled={!navigator.onLine} className="btn-shine w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm cursor-pointer">
                      {!navigator.onLine ? 'İnternet Gerekli' : 'Oda Kodu Al'}
                    </button>
                  )}
                </div>
                {/* Join */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                  <div><h4 className="font-bold text-xs text-slate-700 uppercase tracking-tight">Koda Göre Katıl</h4></div>
                  <input type="text" value={codeToJoin} onChange={(e) => setCodeToJoin(e.target.value)} placeholder="Oda Kodu (ör: ABC12D)" className="w-full bg-white border border-slate-200 text-xs px-3.5 py-2.5 rounded-xl uppercase font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-colors" />
                  <button onClick={() => handleJoinCustomRoom()} disabled={!codeToJoin.trim() || !navigator.onLine} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm cursor-pointer">
                    {!navigator.onLine ? 'İnternet Gerekli' : 'Odaya Gir'}
                  </button>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ── LOBBY PAGE ── */}
        {activePageView === 'lobby' && (
          <main className="max-w-6xl w-full mx-auto px-4 py-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-scaleUp">

            {/* Offline Warning */}
            {!navigator.onLine && (
              <div className="lg:col-span-12 bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-900 text-sm">İnternet Bağlantısı Yok</h3>
                  <p className="text-amber-700 text-xs mt-1">Eşleşme ve online rakip bulma şu anda çalışmamaktadır. Offline modda AI ile oynayabilir veya internete geri bağlandığınızda tekrar deneyin.</p>
                </div>
              </div>
            )}

            {/* Left column — actions */}
            <div className="lg:col-span-12 xl:col-span-7 space-y-6">

              {/* Stats Bar */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 text-white flex items-center justify-around border border-slate-700/60 shadow-md">
                {[
                  { label: 'Çevrimiçi', value: `${lobbyStats.onlineCount}`, color: 'text-emerald-400', suffix: 'oyuncu' },
                  { label: 'Savaşanlar', value: `${lobbyStats.usersPlaying}`, color: 'text-indigo-400', suffix: 'kişi' },
                  { label: 'Aktif Maç', value: `${lobbyStats.activeGames}`, color: 'text-violet-400', suffix: 'seri' },
                ].map((s, i) => (
                  <React.Fragment key={s.label}>
                    {i > 0 && <div className="w-px h-8 bg-slate-700" />}
                    <div className="text-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">{s.label}</span>
                      <span className={`font-mono text-base font-black ${s.color} stat-pulse`}>{s.value} <span className="text-xs">{s.suffix}</span></span>
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Matchmaking Card */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm glow-card space-y-5 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl shadow-sm shadow-indigo-200">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800 tracking-tight">Eşleş ve Savaş</h3>
                    <p className="text-xs text-slate-400">ELO'na göre online rakip bul</p>
                  </div>
                </div>

                {matchmakingActive ? (
                  <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 animate-scaleUp">
                    <div className="relative">
                      <span className="absolute inset-0 rounded-full bg-indigo-400/20 animate-ping" />
                      <div className="w-16 h-16 bg-white border border-indigo-100 rounded-full flex items-center justify-center shadow">
                        <Hourglass className="w-7 h-7 text-indigo-600 animate-spin" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Rakip Aranıyor...</h4>
                      <p className="text-slate-400 text-xs mt-1">ELO {user.elo} ±200 · {searchRounds} Tur</p>
                      <span className="font-mono text-2xl font-black text-indigo-600 block mt-2">{formatTimer(queueTimer)}</span>
                    </div>
                    <button onClick={handleCancelMatchmaking} className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all cursor-pointer shadow-sm">Aramayı İptal Et</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Kaç tur oynayalım?</span>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setSearchRounds(n)}
                          className={`py-3 rounded-2xl border text-sm font-extrabold transition-all cursor-pointer ${searchRounds === n ? 'bg-gradient-to-b from-indigo-500 to-indigo-700 text-white border-indigo-600 shadow-sm shadow-indigo-200 scale-105' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleStartMatchmaking} disabled={!navigator.onLine} className="btn-shine w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2">
                      <Sword className="w-4 h-4" /> {!navigator.onLine ? 'İnternet Gerekli' : 'Hemen Eşleş'}
                    </button>
                  </div>
                )}
              </div>

              {/* Offline AI Card */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm glow-card space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-slate-700 to-slate-900 text-white rounded-2xl shadow-sm">
                    <WifiOff className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800 tracking-tight">Offline Oyna</h3>
                    <p className="text-xs text-slate-400">İnternetsiz oyna · ELO kazanılmaz</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setOfflineModalOpen(true)}
                    className="w-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-bold py-3.5 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Bot className="w-4 h-4" /> AI ile Oyna
                  </button>
                  <button
                    onClick={() => setOfflineTwoPlayerModalOpen(true)}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3.5 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Users className="w-4 h-4" /> 2 Kişi Oyna
                  </button>
                </div>
              </div>

              {/* Private Room Card */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm glow-card space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-100 text-slate-700 rounded-2xl"><PlusCircle className="w-5 h-5" /></div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800 tracking-tight">Özel Oda</h3>
                    <p className="text-xs text-slate-400">Arkadaşınla oda kodu ile oyna · <button onClick={() => setActivePageView('rooms')} className="text-indigo-500 hover:underline cursor-pointer">Tüm odaları gör →</button></p>
                  </div>
                </div>
                {customRoomError && <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs p-3 rounded-xl flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{customRoomError}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                    <h4 className="font-bold text-xs text-slate-700 uppercase tracking-tight">Oda Oluştur</h4>
                    <div className="flex gap-1.5">
                      {[1, 3, 5].map((n) => (
                        <button key={n} onClick={() => setCustomRounds(n)} className={`flex-1 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${customRounds === n ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>{n} Tur</button>
                      ))}
                    </div>
                    {privateRoomCode ? (
                      <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                        <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 block">Giriş Kodu</span>
                        <span className="font-mono text-base font-black text-indigo-600 tracking-wider block select-all mt-1">{privateRoomCode}</span>
                      </div>
                    ) : (
                      <button onClick={handleCreateCustomRoom} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer">Kod Al</button>
                    )}
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                    <h4 className="font-bold text-xs text-slate-700 uppercase tracking-tight">Odaya Katıl</h4>
                    <input type="text" value={codeToJoin} onChange={(e) => setCodeToJoin(e.target.value)} placeholder="Oda Kodu (ABC12D)" className="w-full bg-white border border-slate-200 text-xs px-3 py-2.5 rounded-xl uppercase font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-colors" />
                    <button onClick={() => handleJoinCustomRoom()} disabled={!codeToJoin.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer">Odaya Gir</button>
                  </div>
                </div>
              </div>

              {/* Profile */}
              <UserProfile user={user} onUpdateAvatar={handleUpdateAvatar} dbInfo={dbStatus} />
            </div>

            {/* Right column — chat */}
            <div className="lg:col-span-12 xl:col-span-5 space-y-6 h-full">
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm glow-card flex flex-col h-[580px]">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-1">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Genel Sohbet</h3>
                    <p className="text-[10px] text-slate-400">Lobideki oyuncularla konuş</p>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <LobbyChat socket={socket} roomId="lobby" currentUsername={user.username} />
                </div>
              </div>
            </div>
          </main>
        )}

        <footer className="bg-white border-t border-slate-100 py-5 mt-auto">
          <p className="text-center text-slate-400 text-xs font-mono">
            &copy; {new Date().getFullYear()} XOX Online · Tüm Hakları Saklıdır
          </p>
        </footer>
      </div>
    );
  }

  // ─── RENDER: Auth Page ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-mesh antialiased font-sans flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {/* Floating orbs */}
      <div className="orb-a absolute top-[10%] left-[15%] w-72 h-72 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="orb-b absolute bottom-[10%] right-[10%] w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="orb-c absolute top-[40%] right-[25%] w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Floating XO symbols */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        {['✕', '○', '✕', '○', '✕', '○'].map((sym, i) => (
          <span key={i} className="absolute text-white/5 font-black"
            style={{ fontSize: `${[80, 120, 60, 100, 90, 70][i]}px`, top: `${[5, 60, 75, 20, 85, 45][i]}%`, left: `${[5, 75, 30, 85, 50, 10][i]}%`, transform: `rotate(${[-15, 20, -10, 15, -20, 10][i]}deg)` }}>
            {sym}
          </span>
        ))}
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-3xl p-7 shadow-2xl shadow-black/20 space-y-7 animate-scaleUp">
          {/* Logo area */}
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-3xl blur-xl" />
              <img src="/assets/images/xox-icon.png" alt="XOX Arena" className="relative w-16 h-16 rounded-2xl object-cover shadow-xl border border-white/80 mx-auto" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h1 className="font-black text-2xl text-slate-900 tracking-tight">XOX ARENA</h1>
              <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase block mt-1">Online Multiplayer · ELO Sistemi</span>
            </div>
          </div>

          {/* Alerts */}
          {authError && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0" /><span className="font-medium">{authError}</span>
            </div>
          )}
          {authSuccessMsg && (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0" /><span className="font-medium">{authSuccessMsg}</span>
            </div>
          )}

          {/* Tab toggle */}
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            {(['login', 'register'] as const).map((mode) => (
              <button key={mode} onClick={() => { setAuthMode(mode); setAuthError(null); setAuthSuccessMsg(null); }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${authMode === mode ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
                {mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
              </button>
            ))}
          </div>

          {/* Offline Mode Info */}
          {!navigator.onLine && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-3 flex items-start gap-3">
              <div className="text-xl mt-0.5">📱</div>
              <div>
                <h4 className="font-bold text-blue-900 text-xs">Çevrimdışı Mod Aktif</h4>
                <p className="text-blue-700 text-xs mt-1">Verileriniz bu cihazda localStorage'da saklanır. Internet bağlantısı gelince sunucuyla senkronize olmaz.</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Kullanıcı Adı</label>
              <input type="text" required minLength={3} maxLength={15} value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Örn: xox_ustasi"
                className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Şifre</label>
              <input type="password" required value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
            </div>

            {authMode === 'register' && (
              <div className="space-y-2.5 animate-fadeIn">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">Karakter Seç</label>
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {PRESET_AVATARS.map((av, idx) => (
                    <button key={av.name} type="button" onClick={() => { setAvatarSeedIndex(idx); setAvatarInput(''); }}
                      className={`p-1 rounded-xl border-2 shrink-0 transition-all cursor-pointer hover:scale-105 ${avatarSeedIndex === idx && !avatarInput ? 'border-indigo-500 shadow-sm ring-2 ring-indigo-500/20' : 'border-slate-100 bg-slate-50'}`}
                      title={av.name}>
                      <img src={av.url} alt={av.name} className="w-10 h-10 rounded-lg object-cover bg-white" />
                    </button>
                  ))}
                </div>
                <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">— veya özel link —</div>
                <input type="text" value={avatarInput} onChange={(e) => setAvatarInput(e.target.value)} placeholder="https://... resim linki"
                  className="w-full bg-slate-50 border border-slate-200 text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
              </div>
            )}

            <button type="submit" disabled={authLoading}
              className="btn-shine w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer">
              {authLoading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : authMode === 'login' ? (
                <><LogIn className="w-4 h-4" /> Giriş Yap</>
              ) : (
                <><Dribbble className="w-4 h-4" /> Kayıt Ol ve Katıl</>
              )}
            </button>
          </form>
        </div>

        {/* SEO blurb below card */}
        <p className="text-center text-white/30 text-[10px] mt-6 font-medium">
          Ücretsiz · Gerçek Zamanlı · ELO Sıralama · Rekabetçi XOX
        </p>
      </div>
    </div>
  );
}
