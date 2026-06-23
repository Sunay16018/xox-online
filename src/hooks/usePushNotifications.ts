// ─── usePushNotifications Hook ───────────────────────────────────────────────
// YouTube tarzı push bildirimleri için abone olma / iptal etme hook'u.
// Kullanım: const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications(token);

import { useState, useEffect, useCallback } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

export function usePushNotifications(authToken: string | null): PushNotificationState {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tarayıcı desteğini ve mevcut aboneliği kontrol et
  useEffect(() => {
    const checkSupport = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setIsSupported(false);
        return;
      }
      setIsSupported(true);

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        setIsSubscribed(!!existing);
      } catch {
        setIsSubscribed(false);
      }
    };

    checkSupport();
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!authToken) {
      setError('Bildirimler için giriş yapmanız gerekiyor.');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. İzin iste
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Bildirim izni reddedildi.');
        return false;
      }

      // 2. VAPID public key'i al
      const keyRes = await fetch('/api/push/vapid-public-key');
      if (!keyRes.ok) {
        setError('Push bildirimleri bu sunucuda desteklenmiyor.');
        return false;
      }
      const { publicKey } = await keyRes.json();

      // 3. Service Worker'ı al ve abone ol
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Aboneliği sunucuya kaydet
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ subscription }),
      });

      if (!res.ok) {
        throw new Error('Sunucuya abonelik kaydedilemedi.');
      }

      setIsSubscribed(true);
      return true;
    } catch (err: any) {
      setError(err.message || 'Bilinmeyen hata.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [authToken]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      if (authToken) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
      }

      setIsSubscribed(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Abonelik iptal edilemedi.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [authToken]);

  return { isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe };
}
